"""
matching_engine.py — table formation for one event session (v0.4).

Implements the engine contract in Qatar_Phase2_Completion_v0.3 §4.2.2:

    run_matching(session_id, mode, rule_version, seed)

Pure Python 3 (standard library only). The caller loads rows from PostgreSQL and passes
plain objects in; the engine never reads user_id from a request, never sees phone numbers,
names or Q07, and returns pseudonymous explanations only.

Hard constraints (never relaxed):
  * one session per run; only bookings in status `paid_awaiting_group` with current consents,
    age attestation and an active account are eligible;
  * one conversation language per table (no AR/EN mixing);
  * venue tier <= every member's budget cap (partition by cap tier, leftovers move DOWN only);
  * no blocked pair at a table (blocks are mutual, whichever side created them);
  * 4 <= table size <= venue capacity (capacity itself is 4..6).

Soft objective (rule_version 'interest_opt_v1' only; baseline is random within constraints):
  score(G) = 0.6 * I(G) + 0.4 * C(G)
  I = mean pairwise Jaccard of Q05 topics over pairs where both members answered;
  C = minimum, over answering members, of that member's mean similarity to the other answering members.
  Missing Q05 answers (or 'no_pref') are re-weighted, not penalised: such members are simply left out
  of I and C, and if a component cannot be computed its weight moves to the other component.
Ties are broken by the stored seed. Weights are hypotheses, not validated (A08).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from itertools import combinations
from typing import Dict, FrozenSet, Iterable, List, Optional, Sequence, Set, Tuple

ALGORITHMS = ("baseline_random", "interest_opt_v1")
MODES = ("dry_run", "published")
LANGUAGES = ("ar", "en")
MIN_TABLE = 4
MAX_TABLE = 6
W_INTEREST = 0.6
W_COHESION = 0.4
NO_PREF = "no_pref"
MAX_OPT_PASSES = 50

# Packing modes (decision 2026-10-23):
#   "min_leftovers" (production default): seat as many people as possible within the session's table
#                    budget (total bookable venue tables), then fill tables to 6 first. 9 -> 5 + 4.
#   "greedy_6": full tables of 6 first; a remainder below 4 is left over. 13 -> 6 + 6 + 1.
PACKING_MODES = ("min_leftovers", "greedy_6")
PACKING_MODE = "min_leftovers"

# Rule versions map to an objective. Unknown versions are rejected rather than guessed.
RULE_OBJECTIVES = {
    "r1-baseline": "baseline_random",
    "r1-interest": "interest_opt_v1",
}


class MatchingError(ValueError):
    """Raised for invalid input (wrong session, bad capacity, unknown rule version...)."""


@dataclass(frozen=True)
class BookingInput:
    booking_id: str
    user_id: str
    session_id: str
    status: str                        # booking_status enum value
    conversation_language: str         # 'ar' | 'en' (copied from the session at hold time)
    budget_tier_rank: int              # member's cap from Q04: 1 = lowest spend tier
    q05_topics: Optional[FrozenSet[str]] = None   # None / empty / {'no_pref'} = not answered
    consents_current: bool = True
    age_attested: bool = True
    account_active: bool = True


@dataclass(frozen=True)
class VenueInput:
    venue_id: str
    tier_rank: int
    capacity: int                      # seats per table, 4..6
    tables_available: int = 1


@dataclass
class Table:
    table_code: str
    language: str
    tier_rank: int                     # min cap of members (venue tier must be <= this)
    members: List[BookingInput]
    venue_id: Optional[str] = None
    interest: Optional[float] = None
    cohesion: Optional[float] = None
    score: Optional[float] = None
    member_scores: Dict[str, Optional[float]] = field(default_factory=dict)

    @property
    def size(self) -> int:
        return len(self.members)


@dataclass
class Leftover:
    booking: BookingInput
    reason: str                        # cell_below_quorum | blocked_conflict


@dataclass
class MatchResult:
    session_id: str
    mode: str
    rule_version: str
    algorithm: str
    seed: int
    inputs_hash: str
    tables: List[Table]
    leftovers: List[Leftover]
    ineligible: List[Tuple[BookingInput, str]]
    explanations: dict


# ----------------------------------------------------------------------------- helpers
def _pseudonym(seed: int, booking_id: str) -> str:
    return "P-" + hashlib.sha256(f"{seed}:{booking_id}".encode()).hexdigest()[:8]


def _stable_key(seed: int, booking_id: str) -> str:
    """Reproducible shuffle key; independent of PYTHONHASHSEED and Python version."""
    return hashlib.sha256(f"shuffle:{seed}:{booking_id}".encode()).hexdigest()


def stable_shuffle(items: Iterable[BookingInput], seed: int) -> List[BookingInput]:
    return sorted(items, key=lambda b: (_stable_key(seed, b.booking_id), b.booking_id))


def _topics(b: BookingInput) -> Optional[FrozenSet[str]]:
    if not b.q05_topics:
        return None
    t = frozenset(x for x in b.q05_topics if x != NO_PREF)
    return t or None


def jaccard(a: FrozenSet[str], b: FrozenSet[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def blocked_pairs(rows: Iterable[Tuple[str, str]]) -> Set[FrozenSet[str]]:
    """user_blocks rows (blocker, blocked) -> mutual pair set."""
    return {frozenset((a, b)) for a, b in rows if a != b}


def _conflicts(member: BookingInput, group: Sequence[BookingInput], blocks: Set[FrozenSet[str]]) -> bool:
    return any(frozenset((member.user_id, other.user_id)) in blocks for other in group)


def _group_ok(group: Sequence[BookingInput], blocks: Set[FrozenSet[str]]) -> bool:
    return not any(frozenset((a.user_id, b.user_id)) in blocks for a, b in combinations(group, 2))


def score_group(group: Sequence[BookingInput]) -> Tuple[Optional[float], Optional[float], Optional[float], Dict[str, Optional[float]]]:
    """Returns (I, C, score, per-member mean similarity). None = not computable (re-weighted)."""
    answered = [(b, _topics(b)) for b in group if _topics(b) is not None]
    member_scores: Dict[str, Optional[float]] = {b.booking_id: None for b in group}
    if len(answered) < 2:
        return None, None, None, member_scores
    pair_sims = [jaccard(ta, tb) for (_, ta), (_, tb) in combinations(answered, 2)]
    interest = sum(pair_sims) / len(pair_sims)
    for b, tb in answered:
        sims = [jaccard(tb, to) for o, to in answered if o.booking_id != b.booking_id]
        member_scores[b.booking_id] = sum(sims) / len(sims)
    cohesion = min(v for v in member_scores.values() if v is not None)
    score = W_INTEREST * interest + W_COHESION * cohesion
    return interest, cohesion, score, member_scores


def _total(groups: Sequence[Sequence[BookingInput]]) -> float:
    return sum((score_group(g)[2] or 0.0) for g in groups)


def _table_sizes(n: int, max_size: int, packing: str = PACKING_MODE, max_tables: Optional[int] = None) -> List[int]:
    """Target table sizes for n people (each 4..max_size, at most max_tables tables; None = no limit).

    greedy_6:      full tables first; a remainder of 4+ forms its own table, a smaller one is left over
                   (v0.3 §4.4.1 D19: 13 -> 6 + 6 + 1). Full tables are never split to rescue a remainder.
    min_leftovers: choose the table count k that seats the most people (k * 4 <= n, seated = min(n, k * max)),
                   preferring fewer tables on a tie; then fill each table to max_size while every remaining
                   table can still reach 4 (9 -> 5 + 4, 13 -> 5 + 4 + 4, 16 -> 6 + 6 + 4)."""
    limit = n // MIN_TABLE if max_tables is None else min(max_tables, n // MIN_TABLE)
    if limit <= 0:
        return []
    if packing == "greedy_6":
        full, rest = divmod(n, max_size)
        sizes = [max_size] * full + ([rest] if rest >= MIN_TABLE else [])
        return sizes[:limit]
    k = max(range(1, limit + 1), key=lambda k: (min(n, k * max_size), -k))
    left, sizes = min(n, k * max_size), []
    for i in range(k, 0, -1):
        size = min(max_size, left - MIN_TABLE * (i - 1))
        sizes.append(size)
        left -= size
    return sizes


# ----------------------------------------------------------------------------- group formation
def _seat_greedy(ordered: List[BookingInput], sizes: List[int], blocks: Set[FrozenSet[str]]):
    """Seat in seeded order; each person goes to the emptiest table that has room and no blocked pair."""
    groups: List[List[BookingInput]] = [[] for _ in sizes]
    unseated: List[Tuple[BookingInput, str]] = []
    for m in ordered:
        options = [i for i in range(len(groups)) if len(groups[i]) < sizes[i]]
        if not options:
            unseated.append((m, "cell_below_quorum"))  # remainder after full tables
            continue
        fit = [i for i in options if not _conflicts(m, groups[i], blocks)]
        if not fit:
            unseated.append((m, "blocked_conflict"))
            continue
        target = min(fit, key=lambda i: (len(groups[i]), i))
        groups[target].append(m)
    # tables that ended below quorum are dissolved; their members try other tables with room
    keep: List[List[BookingInput]] = []
    for g in groups:
        if len(g) >= MIN_TABLE:
            keep.append(g)
        else:
            unseated.extend((m, "cell_below_quorum") for m in g)
    still: List[Tuple[BookingInput, str]] = []
    for m, reason in unseated:
        fit = [g for g in keep if len(g) < max(sizes) and not _conflicts(m, g, blocks)]
        if fit:
            min(fit, key=len).append(m)
        else:
            still.append((m, reason))
    return keep, still


def _optimise(groups: List[List[BookingInput]], blocks: Set[FrozenSet[str]]) -> List[List[BookingInput]]:
    """Deterministic hill-climbing over pairwise swaps between tables; accepts strict improvements only."""
    for _ in range(MAX_OPT_PASSES):
        improved = False
        for gi, gj in combinations(range(len(groups)), 2):
            for a_idx in range(len(groups[gi])):
                for b_idx in range(len(groups[gj])):
                    a, b = groups[gi][a_idx], groups[gj][b_idx]
                    new_i = groups[gi][:a_idx] + [b] + groups[gi][a_idx + 1:]
                    new_j = groups[gj][:b_idx] + [a] + groups[gj][b_idx + 1:]
                    if not (_group_ok(new_i, blocks) and _group_ok(new_j, blocks)):
                        continue
                    before = (score_group(groups[gi])[2] or 0.0) + (score_group(groups[gj])[2] or 0.0)
                    after = (score_group(new_i)[2] or 0.0) + (score_group(new_j)[2] or 0.0)
                    if after > before + 1e-12:
                        groups[gi], groups[gj] = new_i, new_j
                        improved = True
        if not improved:
            break
    return groups


def form_groups(cell: List[BookingInput], max_size: int, blocks: Set[FrozenSet[str]], algorithm: str, seed: int,
                packing: str = PACKING_MODE, budget: Optional[dict] = None):
    """budget = {"left": int | None}: tables still available in the session; consumed by the tables formed."""
    ordered = stable_shuffle(cell, seed)
    sizes = _table_sizes(len(ordered), max_size, packing, None if budget is None else budget["left"])
    if budget is not None and budget["left"] is not None:
        budget["left"] -= len(sizes)
    if not sizes:
        return [], [(m, "cell_below_quorum") for m in ordered]
    groups, unseated = _seat_greedy(ordered, sizes, blocks)
    if algorithm == "interest_opt_v1" and len(groups) > 1:
        groups = _optimise(groups, blocks)
    return groups, unseated


def place_leftovers_downward(tables: List[Table], leftovers: List[Leftover], max_size: int,
                             blocks: Set[FrozenSet[str]], algorithm: str, seed: int, next_code,
                             packing: str = PACKING_MODE, budget: Optional[dict] = None) -> Tuple[List[Table], List[Leftover]]:
    """Seat leftovers at an existing table of the SAME language whose tier <= their cap (never higher);
    then pool what remains per language and form new tables at the lowest cap among members."""
    remaining: List[Leftover] = []
    for lo in sorted(leftovers, key=lambda x: (_stable_key(seed, x.booking.booking_id))):
        m = lo.booking
        fit = [t for t in tables
               if t.language == m.conversation_language and t.tier_rank <= m.budget_tier_rank
               and t.size < max_size and not _conflicts(m, t.members, blocks)]
        if fit:
            target = min(fit, key=lambda t: (t.size, -t.tier_rank, t.table_code))
            target.members.append(m)
        else:
            remaining.append(lo)

    final_left: List[Leftover] = []
    for lang in LANGUAGES:
        pool = [lo.booking for lo in remaining if lo.booking.conversation_language == lang]
        reasons = {lo.booking.booking_id: lo.reason for lo in remaining}
        groups, unseated = form_groups(pool, max_size, blocks, algorithm, seed, packing, budget)
        for g in groups:
            tables.append(Table(table_code=next_code(), language=lang,
                                tier_rank=min(m.budget_tier_rank for m in g), members=list(g)))
        final_left.extend(Leftover(m, reasons.get(m.booking_id, r)) for m, r in unseated)
    return tables, final_left


def assign_venues(tables: List[Table], venues: Optional[Sequence[VenueInput]]) -> List[str]:
    """Venue tier <= table tier, capacity >= size. Prefers the highest eligible tier, then venue_id."""
    warnings: List[str] = []
    if venues is None:
        return warnings
    stock = {v.venue_id: v.tables_available for v in venues}
    for t in sorted(tables, key=lambda t: (-t.size, t.table_code)):
        fit = [v for v in venues if v.tier_rank <= t.tier_rank and v.capacity >= t.size and stock[v.venue_id] > 0]
        if not fit:
            warnings.append(f"{t.table_code}: no_venue_available")
            continue
        v = sorted(fit, key=lambda v: (-v.tier_rank, v.venue_id))[0]
        t.venue_id = v.venue_id
        stock[v.venue_id] -= 1
    return warnings


def inputs_hash(pool: Sequence[BookingInput], blocks: Set[FrozenSet[str]], params: dict) -> str:
    doc = {
        "params": params,
        "pool": sorted([
            [b.booking_id, b.user_id, b.conversation_language, b.budget_tier_rank,
             sorted(b.q05_topics) if b.q05_topics else None]
            for b in pool]),
        "blocks": sorted(sorted(p) for p in blocks),
    }
    return hashlib.sha256(json.dumps(doc, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def validate_tables(tables: Sequence[Table], max_size: int, blocks: Set[FrozenSet[str]]) -> List[str]:
    """Hard-constraint checklist (§4.2.2 review screen). Empty list = all ✓."""
    errors = []
    seen: Set[str] = set()
    for t in tables:
        if not (MIN_TABLE <= t.size <= max_size):
            errors.append(f"{t.table_code}: size {t.size} outside {MIN_TABLE}..{max_size}")
        if {m.conversation_language for m in t.members} != {t.language}:
            errors.append(f"{t.table_code}: mixed or wrong language")
        if any(m.budget_tier_rank < t.tier_rank for m in t.members):
            errors.append(f"{t.table_code}: tier above a member's cap")
        if not _group_ok(t.members, blocks):
            errors.append(f"{t.table_code}: blocked pair seated together")
        for m in t.members:
            if m.booking_id in seen:
                errors.append(f"{t.table_code}: booking seated twice")
            seen.add(m.booking_id)
    return errors


# ----------------------------------------------------------------------------- entry point
def run_matching(session_id: str, mode: str, rule_version: str, seed: int,
                 bookings: Sequence[BookingInput], block_rows: Iterable[Tuple[str, str]] = (),
                 venue_capacity: int = MAX_TABLE, venues: Optional[Sequence[VenueInput]] = None,
                 packing_mode: str = PACKING_MODE, max_tables: Optional[int] = None) -> MatchResult:
    """max_tables = bookable venue tables for the session (None = unlimited). Cells are filled in sorted
    (language, tier) order, so when tables are scarce earlier cells are served first."""
    if mode not in MODES:
        raise MatchingError(f"mode must be one of {MODES}")
    if rule_version not in RULE_OBJECTIVES:
        raise MatchingError(f"unknown rule_version {rule_version!r}")
    if not (MIN_TABLE <= venue_capacity <= MAX_TABLE):
        raise MatchingError("venue_capacity must be between 4 and 6")
    if not isinstance(seed, int):
        raise MatchingError("seed must be an integer")
    if packing_mode not in PACKING_MODES:
        raise MatchingError(f"packing_mode must be one of {PACKING_MODES}")
    if max_tables is not None and max_tables < 0:
        raise MatchingError("max_tables must be >= 0")
    budget = {"left": max_tables}
    algorithm = RULE_OBJECTIVES[rule_version]
    blocks = blocked_pairs(block_rows)

    pool: List[BookingInput] = []
    ineligible: List[Tuple[BookingInput, str]] = []
    seen_users: Set[str] = set()
    for b in bookings:
        if b.session_id != session_id:
            raise MatchingError(f"booking {b.booking_id} belongs to another session")
        if b.conversation_language not in LANGUAGES:
            raise MatchingError(f"booking {b.booking_id} has invalid language")
        if b.status != "paid_awaiting_group":
            ineligible.append((b, "status_not_paid_awaiting_group"))
        elif not b.consents_current:
            ineligible.append((b, "consents_not_current"))
        elif not (b.age_attested and b.account_active):
            ineligible.append((b, "not_eligible"))
        elif b.user_id in seen_users:
            ineligible.append((b, "duplicate_user_in_session"))
        else:
            seen_users.add(b.user_id)
            pool.append(b)

    counter = {"n": 0}

    def next_code() -> str:
        counter["n"] += 1
        return f"T{counter['n']:02d}"

    cells: Dict[Tuple[str, int], List[BookingInput]] = {}
    for b in pool:
        cells.setdefault((b.conversation_language, b.budget_tier_rank), []).append(b)

    tables: List[Table] = []
    leftovers: List[Leftover] = []
    for (lang, tier) in sorted(cells):
        groups, unseated = form_groups(cells[(lang, tier)], venue_capacity, blocks, algorithm, seed,
                                       packing_mode, budget)
        for g in groups:
            tables.append(Table(table_code=next_code(), language=lang, tier_rank=tier, members=list(g)))
        leftovers.extend(Leftover(m, r) for m, r in unseated)

    tables, leftovers = place_leftovers_downward(tables, leftovers, venue_capacity, blocks, algorithm,
                                                 seed, next_code, packing_mode, budget)
    venue_warnings = assign_venues(tables, venues)

    for t in tables:
        t.members.sort(key=lambda m: _stable_key(seed, m.booking_id))
        t.interest, t.cohesion, t.score, t.member_scores = score_group(t.members)

    errors = validate_tables(tables, venue_capacity, blocks)
    if errors:
        raise MatchingError("hard constraint violated: " + "; ".join(errors))

    params = {"session_id": session_id, "rule_version": rule_version, "seed": seed, "venue_capacity": venue_capacity,
              "packing_mode": packing_mode, "max_tables": max_tables}
    h = inputs_hash(pool, blocks, params)
    explanations = explain(tables, leftovers, ineligible, seed, algorithm, venue_warnings)
    return MatchResult(session_id, mode, rule_version, algorithm, seed, h, tables, leftovers, ineligible, explanations)


def _shared_topic_count(group: Sequence[BookingInput]) -> int:
    counts: Dict[str, int] = {}
    for b in group:
        for t in (_topics(b) or ()):
            counts[t] = counts.get(t, 0) + 1
    return sum(1 for c in counts.values() if c >= 2)


def explain(tables: Sequence[Table], leftovers: Sequence[Leftover], ineligible, seed: int,
            algorithm: str, venue_warnings: List[str]) -> dict:
    """Pseudonymous explanation stored in matching_runs.explanations (no user_id, no names, no answers)."""
    out_tables = []
    for t in tables:
        warnings = []
        if _shared_topic_count(t.members) < 2:
            warnings.append("solo interest coverage < 2 topics")
        out_tables.append({
            "table_code": t.table_code,
            "language": t.language,
            "tier_rank": t.tier_rank,
            "size": t.size,
            "venue_id": t.venue_id,
            "seats": [_pseudonym(seed, m.booking_id) for m in t.members],
            "interest": None if t.interest is None else round(t.interest, 4),
            "cohesion": None if t.cohesion is None else round(t.cohesion, 4),
            "score": None if t.score is None else round(t.score, 4),
            "answered_q05": sum(1 for m in t.members if _topics(m) is not None),
            "checks": {"same_language": True, "tier_within_caps": True, "no_blocked_pair": True,
                       "size_within_bounds": True},
            "warnings": warnings,
        })
    return {
        "algorithm": algorithm,
        "weights": {"interest": W_INTEREST, "cohesion": W_COHESION} if algorithm == "interest_opt_v1" else None,
        "tables": out_tables,
        "leftovers": [{"seat": _pseudonym(seed, lo.booking.booking_id), "reason": lo.reason} for lo in leftovers],
        "ineligible": [{"seat": _pseudonym(seed, b.booking_id), "reason": r} for b, r in ineligible],
        "venue_warnings": venue_warnings,
    }


def to_table_assignments(result: MatchResult) -> List[dict]:
    """Rows for table_assignments (member_score = mean similarity, NULL if Q05 not answered)."""
    rows = []
    for t in result.tables:
        for m in t.members:
            rows.append({"booking_id": m.booking_id, "table_code": t.table_code,
                         "member_score": None if t.member_scores.get(m.booking_id) is None
                         else round(t.member_scores[m.booking_id], 4)})
    return rows
