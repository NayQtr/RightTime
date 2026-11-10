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

Matching rules (owner's proposals, built provisionally on 10 Nov 2026; values in MATCHING_RULES):
  * hard: no repeat of the same two women at a table within 14 days (7 in a small session), unless both asked to stay
    in touch; no two women more than 2 Q11 age bands apart (3 in a small session). Applied as blocked pairs.
  * soft (optimised rule versions): a repeat penalty that falls to 0 at 42 days, a small boost for a woman left
    without a table in the last 28 days, and a small penalty for a table of 4. Tables below a score threshold are
    flagged "low match" for coordinators; everyone is still seated.
  * celebrants are seated first, so the celebration rule leaves the other woman out (item 31).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, replace
from itertools import combinations
from typing import Dict, FrozenSet, Iterable, List, Optional, Sequence, Set, Tuple

from personality import (PERSONALITY_WEIGHTS, PersonalityError, check_questionnaire, clean_answers, pair_total,
                         score_group_personality, table_themes)

ALGORITHMS = ("baseline_random", "interest_opt_v1", "personality_v1")
PERSONALITY = "personality_v1"
OPTIMISED = ("interest_opt_v1", PERSONALITY)
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
    "r2-personality": PERSONALITY,
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
    # r2-personality: {question_key: [option_key, ...]}, cleaned by the engine (personality.clean_answers)
    answers: Optional[Dict[str, List[str]]] = field(default=None, hash=False, compare=False)
    occasion: Optional[str] = None     # migration 018: 'birthday' | 'other' | None
    unseated_days_ago: Optional[int] = None  # migration 020: days since a session where she was left without a table


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
    energy: Optional[float] = None
    themes: List[dict] = field(default_factory=list)
    soft: Dict[str, float] = field(default_factory=dict)   # repeat_penalty, priority_boost, size_penalty
    objective: Optional[float] = None
    low_match: bool = False

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
    rules: dict = field(default_factory=dict)


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


# Celebration tables (migration 018): a woman celebrating an occasion is seated only with women whose Q25 answer says
# they would enjoy or not mind it. Applied as blocked pairs, so seating and validation enforce it like a block.
CELEBRATION_QUESTION = "Q25"
CELEBRATION_OK = ("love_to_join", "dont_mind")


def celebration_pairs(pool: Sequence[BookingInput]) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for c in pool:
        if not c.occasion:
            continue
        for o in pool:
            if o.user_id == c.user_id:
                continue
            a = (o.answers or {}).get(CELEBRATION_QUESTION) or []
            if not any(k in CELEBRATION_OK for k in a):
                out.append((c.user_id, o.user_id))
    return out


# Age range (Q11), in order: the age-gap rule counts bands between two women.
AGE_QUESTION = "Q11"
AGE_BANDS = ("age_18_24", "age_25_34", "age_35_44", "age_45_54", "age_55_plus")

# Matching rules: the owner's proposals, built provisionally on 10 Nov 2026 (Notion fixes 1, 2, 5, 7, 8, 9, 13 and
# item 31). Change them here AND in MATCHING_RULES in qatar/api/src/matching/engine.js: the parity test checks that
# both are equal. Days are Doha calendar days between two sessions (app.matching_input, migration 020). Scores and
# penalties are on the engine's 0..1 table-score scale. Soft rules steer the optimised rule versions only.
MATCHING_RULES = {
    "repeat_block_days": 14,       # hard: the same two women never share a table again within 14 days...
    "repeat_decay_end_days": 42,   # ...then a penalty that falls linearly to 0 at 42 days...
    "repeat_penalty": 0.1,         # ...worth 0.1 per pair at full strength. Both asked to stay in touch = exempt.
    "max_age_band_gap": 2,         # hard: at most 2 Q11 age bands apart at one table; no age band = not limited
    "small_pool_below": 24,        # a session with fewer eligible women than this is small, and then:
    "small_repeat_block_days": 7,  #   the hard no-repeat window is 7 days
    "small_max_age_band_gap": 3,   #   and 3 age bands apart are allowed
    # Coordinators see "Low match" on a table scoring below this (everyone is still seated). Per algorithm, because
    # the scales differ: r2 averages similarity over all answers, r1 is Jaccard overlap of topics only.
    "low_match_below": {"personality_v1": 0.3, "interest_opt_v1": 0.15, "baseline_random": 0.15},
    "priority_days": 28,           # a woman left without a table in a session in the last 28 days (4 weeks)...
    "priority_boost": 0.05,        # ...adds 0.05 to her table's score: she takes a seat when that costs the table less
    "size4_penalty": 0.02,         # a table of 4 counts 0.02 less, so the engine prefers 5-6 when it can
}
# app.matching_input() returns history from this many days back (migration 020); the day windows must fit in it.
HISTORY_LOOKBACK_DAYS = 90
PRIORITY_REASON = "seat_given_to_priority"


def effective_rules(pool_size: int, algorithm: str) -> dict:
    """Rules in force for this pool: a small session relaxes the hard rules."""
    r = MATCHING_RULES
    small = pool_size < r["small_pool_below"]
    return {
        "small_session": small,
        "repeat_block_days": r["small_repeat_block_days"] if small else r["repeat_block_days"],
        "repeat_decay_end_days": r["repeat_decay_end_days"],
        "repeat_penalty": r["repeat_penalty"],
        "max_age_band_gap": r["small_max_age_band_gap"] if small else r["max_age_band_gap"],
        "priority_days": r["priority_days"],
        "priority_boost": r["priority_boost"],
        "size4_penalty": r["size4_penalty"],
        "low_match_below": r["low_match_below"][algorithm],
    }


def age_band(b: BookingInput) -> Optional[int]:
    """Index of her Q11 age band, or None when she gave none (or more than one)."""
    given = (b.answers or {}).get(AGE_QUESTION)
    known = {x for x in given if x in AGE_BANDS} if isinstance(given, list) else set()
    return AGE_BANDS.index(next(iter(known))) if len(known) == 1 else None


def age_gap_pairs(pool: Sequence[BookingInput], max_gap: int) -> List[Tuple[str, str]]:
    """Pairs more than max_gap age bands apart; applied as blocked pairs (hard)."""
    out: List[Tuple[str, str]] = []
    bands = [age_band(b) for b in pool]
    for i in range(len(pool)):
        if bands[i] is None:
            continue
        for j in range(i + 1, len(pool)):
            if bands[j] is not None and abs(bands[i] - bands[j]) > max_gap:
                out.append((pool[i].user_id, pool[j].user_id))
    return out


def repeat_rules(history: Iterable[Sequence], rules: dict):
    """history rows (app.matching_input, migration 020): [user_a, user_b, days apart, both asked to stay in touch].
    Returns (blocked pairs within the block window, {pair: penalty factor from 1 down to 0} after it)."""
    blocked: List[Tuple[str, str]] = []
    penalties: Dict[FrozenSet[str], float] = {}
    span = rules["repeat_decay_end_days"] - rules["repeat_block_days"]
    for a, b, days, mutual in history:
        if a == b or mutual:
            continue
        if days <= rules["repeat_block_days"]:
            blocked.append((a, b))
        elif days < rules["repeat_decay_end_days"]:
            f = (rules["repeat_decay_end_days"] - days) / span
            k = frozenset((a, b))
            if k not in penalties or f > penalties[k]:
                penalties[k] = f
    return blocked, penalties


def _has_priority(b: BookingInput, rules: dict) -> bool:
    return b.unseated_days_ago is not None and b.unseated_days_ago <= rules["priority_days"]


def _celebrants_first(items: list, booking=lambda x: x) -> list:
    """Item 31: celebrants are seated first, so when the celebration rule leaves someone out it is the other woman."""
    return [x for x in items if booking(x).occasion] + [x for x in items if not booking(x).occasion]


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


def _scorer(algorithm: str):
    """Both scorers return (mean, cohesion, score, member_scores)."""
    if algorithm == PERSONALITY:
        return lambda g: score_group_personality(g)[:4]
    return score_group


def _total(groups: Sequence[Sequence[BookingInput]]) -> float:
    return sum((score_group(g)[2] or 0.0) for g in groups)


def _soft_parts(g: Sequence[BookingInput], rules: dict, soft: dict) -> Dict[str, float]:
    """Soft rules at one table, on the score scale: the repeat penalty of every pair that met recently, the priority
    boost of each woman left without a table lately, and the size-4 penalty. Sums run left to right as in engine.js."""
    rp = 0.0
    penalties = soft["penalties"]
    if penalties:
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                f = penalties.get(frozenset((g[i].user_id, g[j].user_id)))
                if f is not None:
                    rp += f
    np_ = sum(1 for m in g if m.booking_id in soft["priority"])
    return {"repeat_penalty": rules["repeat_penalty"] * rp, "priority_boost": rules["priority_boost"] * np_,
            "size_penalty": rules["size4_penalty"] if len(g) == MIN_TABLE else 0}


def _objective_of(score: float, p: Dict[str, float]) -> float:
    return score - p["repeat_penalty"] + p["priority_boost"] - p["size_penalty"]


def _make_objective(algorithm: str, rules: dict, soft: dict):
    """The value the optimiser maximises for one table: its score with the soft rules applied."""
    score = _scorer(algorithm)

    def objective(g):
        return _objective_of(score(g)[2] or 0.0, _soft_parts(g, rules, soft))
    return objective


def _table_sizes(n: int, max_size: int, packing: str = PACKING_MODE, max_tables: Optional[int] = None) -> List[int]:
    """Target table sizes for n people (each 4..max_size, at most max_tables tables; None = no limit).

    greedy_6:      full tables first; a remainder of 4+ forms its own table, a smaller one is left over
                   (v0.3 §4.4.1 D19: 13 -> 6 + 6 + 1). Full tables are never split to rescue a remainder.
    min_leftovers: choose the table count k that seats the most people (k * 4 <= n, seated = min(n, k * max)),
                   preferring fewer tables on a tie; then spread the seats evenly, which gives the fewest tables of
                   4 (owner, 10 Nov: prefer 5-6; a table of 4 stays allowed): 9 -> 5 + 4, 10 -> 5 + 5,
                   13 -> 5 + 4 + 4, 16 -> 6 + 5 + 5."""
    limit = n // MIN_TABLE if max_tables is None else min(max_tables, n // MIN_TABLE)
    if limit <= 0:
        return []
    if packing == "greedy_6":
        full, rest = divmod(n, max_size)
        sizes = [max_size] * full + ([rest] if rest >= MIN_TABLE else [])
        return sizes[:limit]
    k = max(range(1, limit + 1), key=lambda k: (min(n, k * max_size), -k))
    base, extra = divmod(min(n, k * max_size), k)
    return [base + 1 if i < extra else base for i in range(k)]


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


MAX_MOVES = 200


def _move_once(groups: List[List[BookingInput]], blocks: Set[FrozenSet[str]], value, max_size: int) -> bool:
    """Applies the first strictly improving single-member move (fixed scan order); returns whether one was applied."""
    for gi in range(len(groups)):
        if len(groups[gi]) <= MIN_TABLE:
            continue
        for gj in range(len(groups)):
            if gj == gi or len(groups[gj]) >= max_size:
                continue
            for ai in range(len(groups[gi])):
                a = groups[gi][ai]
                if _conflicts(a, groups[gj], blocks):
                    continue
                new_i = groups[gi][:ai] + groups[gi][ai + 1:]
                new_j = groups[gj] + [a]
                if value(new_i) + value(new_j) > value(groups[gi]) + value(groups[gj]) + 1e-12:
                    groups[gi], groups[gj] = new_i, new_j
                    return True
    return False


def _optimise(groups: List[List[BookingInput]], blocks: Set[FrozenSet[str]], value,
              max_size: Optional[int] = None) -> List[List[BookingInput]]:
    """Deterministic hill-climbing over pairwise swaps between tables; accepts strict improvements only.
    value(group) -> float is the objective. max_size set (r2 only): single-member moves are also tried after the
    swaps of each pass, keeping every table within MIN_TABLE..max_size."""
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
                    before = value(groups[gi]) + value(groups[gj])
                    after = value(new_i) + value(new_j)
                    if after > before + 1e-12:
                        groups[gi], groups[gj] = new_i, new_j
                        improved = True
        if max_size is not None:
            moves = 0
            while moves < MAX_MOVES and _move_once(groups, blocks, value, max_size):
                moves += 1
                improved = True
        if not improved:
            break
    return groups


def _optimise_for(groups: List[List[BookingInput]], blocks: Set[FrozenSet[str]], algorithm: str, max_size: int,
                  objective):
    """r2: the cohesion term can trap swap search between two profiles, so a second start first clusters on
    pair_total; both starts then climb on the table value and the higher total wins (never below the plain climb).
    objective(group) is the table score with the soft rules applied (_make_objective)."""
    value = objective

    if algorithm != PERSONALITY:
        return _optimise(groups, blocks, value)
    plain = _optimise([list(g) for g in groups], blocks, value, max_size)
    clustered = _optimise(_optimise([list(g) for g in groups], blocks, pair_total, max_size), blocks, value, max_size)

    def total(gs):
        t = 0.0
        for g in gs:
            t += value(g)
        return t
    return clustered if total(clustered) > total(plain) + 1e-12 else plain


def form_groups(cell: List[BookingInput], max_size: int, blocks: Set[FrozenSet[str]], algorithm: str, seed: int,
                packing: str = PACKING_MODE, budget: Optional[dict] = None, objective=None):
    """budget = {"left": int | None}: tables still available in the session; consumed by the tables formed.
    objective(group) = table value for the optimiser (default: the plain table score)."""
    if objective is None:
        score = _scorer(algorithm)

        def objective(g):
            return score(g)[2] or 0.0
    ordered = _celebrants_first(stable_shuffle(cell, seed))
    sizes = _table_sizes(len(ordered), max_size, packing, None if budget is None else budget["left"])
    if budget is not None and budget["left"] is not None:
        budget["left"] -= len(sizes)
    if not sizes:
        return [], [(m, "cell_below_quorum") for m in ordered]
    groups, unseated = _seat_greedy(ordered, sizes, blocks)
    if algorithm in OPTIMISED and len(groups) > 1:
        groups = _optimise_for(groups, blocks, algorithm, max_size, objective)
    return groups, unseated


def _table_fit(t: Table):
    return (t.size, -t.tier_rank, t.table_code)


def _can_join(m: BookingInput, t: Table, max_size: int, blocks: Set[FrozenSet[str]]) -> bool:
    return (t.language == m.conversation_language and t.tier_rank <= m.budget_tier_rank
            and t.size < max_size and not _conflicts(m, t.members, blocks))


def place_leftovers_downward(tables: List[Table], leftovers: List[Leftover], max_size: int,
                             blocks: Set[FrozenSet[str]], algorithm: str, seed: int, next_code,
                             packing: str = PACKING_MODE, budget: Optional[dict] = None,
                             objective=None) -> Tuple[List[Table], List[Leftover]]:
    """Seat leftovers at an existing table of the SAME language whose tier <= their cap (never higher);
    then pool what remains per language and form new tables at the lowest cap among members."""
    remaining: List[Leftover] = []
    ordered = _celebrants_first(sorted(leftovers, key=lambda x: (_stable_key(seed, x.booking.booking_id))),
                                lambda lo: lo.booking)
    for lo in ordered:
        m = lo.booking
        fit = [t for t in tables if _can_join(m, t, max_size, blocks)]
        if fit:
            target = min(fit, key=_table_fit)
            target.members.append(m)
        else:
            remaining.append(lo)

    final_left: List[Leftover] = []
    for lang in LANGUAGES:
        pool = [lo.booking for lo in remaining if lo.booking.conversation_language == lang]
        reasons = {lo.booking.booking_id: lo.reason for lo in remaining}
        groups, unseated = form_groups(pool, max_size, blocks, algorithm, seed, packing, budget, objective)
        for g in groups:
            tables.append(Table(table_code=next_code(), language=lang,
                                tier_rank=min(m.budget_tier_rank for m in g), members=list(g)))
        final_left.extend(Leftover(m, reasons.get(m.booking_id, r)) for m, r in unseated)
    return tables, final_left


def seat_priority(tables: List[Table], leftovers: List[Leftover], max_size: int, blocks: Set[FrozenSet[str]],
                  objective, soft: dict, seed: int) -> List[Leftover]:
    """Priority (Notion fix 9): a woman still without a seat who was left without a table lately takes the seat of a
    woman without priority when the table's value (score with the boost) rises, i.e. when the swap costs the table
    less than the boost. The best such swap is taken; a celebrant never gives up her seat (item 31). The woman who
    gives up her seat takes any other seat she fits, else she is a leftover. The number seated never falls."""
    left = list(leftovers)
    queue = sorted((lo for lo in left if lo.booking.booking_id in soft["priority"]),
                   key=lambda lo: _stable_key(seed, lo.booking.booking_id))
    for lo in queue:
        m = lo.booking
        best = None
        for t in tables:
            if t.language != m.conversation_language or t.tier_rank > m.budget_tier_rank:
                continue
            before = objective(t.members)
            for i, s in enumerate(t.members):
                if s.booking_id in soft["priority"] or s.occasion:
                    continue
                cand = t.members[:i] + [m] + t.members[i + 1:]
                if not _group_ok(cand, blocks):
                    continue
                gain = objective(cand) - before
                if gain > 1e-12 and (best is None or gain > best[2] + 1e-12):
                    best = (t, i, gain, cand)
        if best is None:
            continue
        t, i, _, cand = best
        out = t.members[i]
        t.members = cand
        left = [x for x in left if x is not lo]
        fit = [x for x in tables if x is not t and _can_join(out, x, max_size, blocks)]
        if fit:
            min(fit, key=_table_fit).members.append(out)
        else:
            left.append(Leftover(out, PRIORITY_REASON))
    return left


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


def inputs_hash(pool: Sequence[BookingInput], blocks: Set[FrozenSet[str]], params: dict, with_answers: bool = False,
                history: Sequence[Sequence] = ()) -> str:
    """history and unseated days (migration 020) are added only when present, so earlier runs keep their hash."""
    doc = {
        "params": params,
        "pool": sorted([
            [b.booking_id, b.user_id, b.conversation_language, b.budget_tier_rank,
             sorted(b.q05_topics) if b.q05_topics else None] + ([b.answers] if with_answers else [])
            for b in pool]),
        "blocks": sorted(sorted(p) for p in blocks),
    }
    if history:
        doc["history"] = sorted([a, b, d, bool(m)] if a < b else [b, a, d, bool(m)] for a, b, d, m in history)
    unseated = sorted([b.booking_id, b.unseated_days_ago] for b in pool if b.unseated_days_ago is not None)
    if unseated:
        doc["unseated"] = unseated
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
                 packing_mode: str = PACKING_MODE, max_tables: Optional[int] = None,
                 questionnaire: Optional[Dict[str, List[str]]] = None,
                 history: Iterable[Sequence] = ()) -> MatchResult:
    """max_tables = bookable venue tables for the session (None = unlimited). Cells are filled in sorted
    (language, tier) order, so when tables are scarce earlier cells are served first.
    history = rows [user_a, user_b, days apart, mutual] (repeat_rules); bookings may carry unseated_days_ago."""
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
    personality = algorithm == PERSONALITY
    if personality:
        try:
            check_questionnaire(questionnaire)
        except PersonalityError as e:
            raise MatchingError(str(e)) from None
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
    history = [list(row) for row in (history or ())]
    rules = effective_rules(len(pool), algorithm)
    repeat_blocked, penalties = repeat_rules(history, rules)
    blocks = blocked_pairs(list(block_rows) + celebration_pairs(pool) + age_gap_pairs(pool, rules["max_age_band_gap"])
                           + repeat_blocked)
    soft = {"penalties": penalties, "priority": {b.booking_id for b in pool if _has_priority(b, rules)}}
    objective = _make_objective(algorithm, rules, soft)
    answers_dropped = 0
    if personality:
        for i, b in enumerate(pool):
            answers, dropped = clean_answers(b.answers, questionnaire)
            answers_dropped += dropped
            pool[i] = replace(b, answers=answers)

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
                                       packing_mode, budget, objective)
        for g in groups:
            tables.append(Table(table_code=next_code(), language=lang, tier_rank=tier, members=list(g)))
        leftovers.extend(Leftover(m, r) for m, r in unseated)

    tables, leftovers = place_leftovers_downward(tables, leftovers, venue_capacity, blocks, algorithm,
                                                 seed, next_code, packing_mode, budget, objective)
    if algorithm in OPTIMISED and soft["priority"]:
        leftovers = seat_priority(tables, leftovers, venue_capacity, blocks, objective, soft, seed)
    venue_warnings = assign_venues(tables, venues)

    for t in tables:
        t.members.sort(key=lambda m: _stable_key(seed, m.booking_id))
        if personality:
            t.interest, t.cohesion, t.score, t.member_scores, t.energy = score_group_personality(t.members)
            t.themes = table_themes(t.members)
        else:
            t.interest, t.cohesion, t.score, t.member_scores = score_group(t.members)
        t.soft = _soft_parts(t.members, rules, soft)
        t.objective = _objective_of(t.score or 0.0, t.soft)
        t.low_match = t.score is not None and t.score < rules["low_match_below"]

    errors = validate_tables(tables, venue_capacity, blocks)
    if errors:
        raise MatchingError("hard constraint violated: " + "; ".join(errors))

    params = {"session_id": session_id, "rule_version": rule_version, "seed": seed, "venue_capacity": venue_capacity,
              "packing_mode": packing_mode, "max_tables": max_tables}
    h = inputs_hash(pool, blocks, params, personality, history)
    explanations = explain(tables, leftovers, ineligible, seed, algorithm, venue_warnings, answers_dropped, rules)
    return MatchResult(session_id, mode, rule_version, algorithm, seed, h, tables, leftovers, ineligible, explanations,
                       rules)


def _shared_topic_count(group: Sequence[BookingInput]) -> int:
    counts: Dict[str, int] = {}
    for b in group:
        for t in (_topics(b) or ()):
            counts[t] = counts.get(t, 0) + 1
    return sum(1 for c in counts.values() if c >= 2)


def explain(tables: Sequence[Table], leftovers: Sequence[Leftover], ineligible, seed: int,
            algorithm: str, venue_warnings: List[str], answers_dropped: int = 0, rules: Optional[dict] = None) -> dict:
    """Pseudonymous explanation stored in matching_runs.explanations (no user_id, no names, no answers)."""
    personality = algorithm == PERSONALITY
    out_tables = []
    for t in tables:
        warnings = []
        if personality:
            answered = sum(1 for m in t.members if m.answers)
            if answered < 2:
                warnings.append("fewer than 2 members answered the questionnaire")
        elif _shared_topic_count(t.members) < 2:
            warnings.append("solo interest coverage < 2 topics")
        row = {
            "table_code": t.table_code,
            "language": t.language,
            "tier_rank": t.tier_rank,
            "size": t.size,
            "venue_id": t.venue_id,
            "seats": [_pseudonym(seed, m.booking_id) for m in t.members],
            "interest": None if t.interest is None else round(t.interest, 4),
            "cohesion": None if t.cohesion is None else round(t.cohesion, 4),
            "score": None if t.score is None else round(t.score, 4),
            "repeat_penalty": round(t.soft.get("repeat_penalty", 0.0), 4),
            "priority_boost": round(t.soft.get("priority_boost", 0.0), 4),
            "size_penalty": round(t.soft.get("size_penalty", 0.0), 4),
            "objective": round(t.objective if t.objective is not None else (t.score or 0.0), 4),
            "low_match": t.low_match,
            "answered_q05": sum(1 for m in t.members if _topics(m) is not None),
            "checks": {"same_language": True, "tier_within_caps": True, "no_blocked_pair": True,
                       "size_within_bounds": True, "no_recent_repeat": True, "age_gap_within_limit": True},
            "warnings": warnings,
        }
        if personality:
            row["energy_balance"] = None if t.energy is None else round(t.energy, 4)
            row["answered"] = answered
        out_tables.append(row)
    out = {
        "algorithm": algorithm,
        "weights": {"interest": W_INTEREST, "cohesion": W_COHESION} if algorithm == "interest_opt_v1"
        else PERSONALITY_WEIGHTS if personality else None,
        "rules": rules,
        "tables": out_tables,
        "leftovers": [{"seat": _pseudonym(seed, lo.booking.booking_id), "reason": lo.reason} for lo in leftovers],
        "ineligible": [{"seat": _pseudonym(seed, b.booking_id), "reason": r} for b, r in ineligible],
        "venue_warnings": venue_warnings,
    }
    if personality:
        out["answers_dropped"] = answers_dropped
    return out


def to_table_assignments(result: MatchResult) -> List[dict]:
    """Rows for table_assignments (member_score = mean similarity, NULL if Q05 not answered)."""
    rows = []
    for t in result.tables:
        for m in t.members:
            rows.append({"booking_id": m.booking_id, "table_code": t.table_code,
                         "member_score": None if t.member_scores.get(m.booking_id) is None
                         else round(t.member_scores[m.booking_id], 4)})
    return rows
