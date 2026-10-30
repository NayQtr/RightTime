"""
personality.py — scoring for rule version r2-personality (spec docs/specs/2026-10-30-personality-matching-design.md).

Reference implementation; qatar/api/src/matching/personality.js is its JavaScript port. Sums are explicit
left-to-right loops (not sum(), which compensates rounding on Python 3.12+), so both produce identical floats.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence

# Dimension weights chosen by the owner (spec §1). They must sum to 1.
DIMENSIONS = (
    ("values", 0.32),
    ("personality", 0.28),
    ("social", 0.18),
    ("interests", 0.12),
    ("lifestyle", 0.10),
)
# Q12 (energy) is balanced at table level; it gets the share one item has inside the personality dimension.
ENERGY_QUESTION = "Q12"
ENERGY_LEVELS = ("introvert", "ambivert", "extrovert")
W_ENERGY = 0.07
W_MEAN = 0.6
W_COHESION = 0.4
NO_SAY = "no_say"
NO_PREF = "no_pref"

# kind: single | multi | scale (ordered options). wild: options that give 0.5 with anything. order: scale ranks.
FEATURES = (
    {"q": "Q13", "dim": "values", "kind": "single", "wild": ("mix",)},
    {"q": "Q21", "dim": "values", "kind": "scale", "order": ("s1", "s2", "s3", "s4", "s5")},
    {"q": "Q22", "dim": "values", "kind": "scale", "order": ("s1", "s2", "s3", "s4", "s5")},
    {"q": "Q14", "dim": "values", "kind": "multi"},
    {"q": "Q15", "dim": "personality", "kind": "multi"},
    {"q": "Q06", "dim": "personality", "kind": "multi"},
    {"q": "Q17", "dim": "personality", "kind": "single"},
    {"q": "Q09", "dim": "social", "kind": "multi"},
    {"q": "Q18", "dim": "social", "kind": "single", "wild": ("any",)},
    {"q": "Q19", "dim": "social", "kind": "single"},
    {"q": "Q20", "dim": "social", "kind": "single"},
    {"q": "Q05", "dim": "interests", "kind": "multi"},
    {"q": "Q11", "dim": "lifestyle", "kind": "scale",
     "order": ("age_18_24", "age_25_34", "age_35_44", "age_45_54", "age_55_plus")},
    {"q": "Q16", "dim": "lifestyle", "kind": "single"},
    {"q": "Q23", "dim": "lifestyle", "kind": "single"},
    {"q": "Q24", "dim": "lifestyle", "kind": "single"},
)
THEME_QUESTIONS = ("Q05", "Q19", "Q18", "Q20", "Q09", "Q13", "Q14", "Q15", "Q17")
THEME_EXCLUDED_OPTIONS = frozenset(("mix", "any", NO_PREF, NO_SAY))
MAX_THEMES = 3


class PersonalityError(ValueError):
    pass


def _sum_lr(xs) -> float:
    s = 0.0
    for x in xs:
        s += x
    return s


assert abs(_sum_lr(w for _, w in DIMENSIONS) - 1) < 1e-9, "dimension weights must sum to 1"
assert all(any(d == f["dim"] for d, _ in DIMENSIONS) for f in FEATURES)

_ENERGY_FEATURE = {"q": ENERGY_QUESTION, "kind": "single", "order": ENERGY_LEVELS}


def check_questionnaire(questionnaire: Optional[Dict[str, List[str]]]) -> None:
    """Every option key the engine relies on must exist in the published questionnaire."""
    if not isinstance(questionnaire, dict):
        raise PersonalityError("questionnaire options are required for r2-personality")
    missing: List[str] = []
    for f in FEATURES + (_ENERGY_FEATURE,):
        opts = questionnaire.get(f["q"])
        if not isinstance(opts, list):
            missing.append(f["q"])
            continue
        for o in tuple(f.get("order", ())) + tuple(f.get("wild", ())):
            if o not in opts:
                missing.append(f"{f['q']}.{o}")
    if missing:
        raise PersonalityError("questionnaire is missing: " + ", ".join(missing))


def clean_answers(raw: Optional[Dict[str, List[str]]], questionnaire: Dict[str, List[str]]):
    """Keeps answers to known questions with options the questionnaire still has; returns (answers, dropped)."""
    out: Dict[str, List[str]] = {}
    dropped = 0
    for f in FEATURES + (_ENERGY_FEATURE,):
        given = raw.get(f["q"]) if isinstance(raw, dict) and isinstance(raw.get(f["q"]), list) else []
        valid = sorted(o for o in dict.fromkeys(given) if o in questionnaire[f["q"]])
        dropped += len(given) - len(valid)
        usable = [o for o in valid if o != NO_SAY and not (f["kind"] == "multi" and o == NO_PREF)]
        if usable and (f["kind"] == "multi" or len(usable) == 1):
            out[f["q"]] = usable
        elif len(usable) > 1:
            dropped += len(usable)
    return out, dropped


def _item_sim(f: dict, a: List[str], b: List[str]) -> float:
    if f["kind"] == "multi":
        sb = set(b)
        inter = sum(1 for x in a if x in sb)
        return inter / (len(a) + len(b) - inter)
    x, y = a[0], b[0]
    if f["kind"] == "scale":
        order = f["order"]
        return 1 - abs(order.index(x) - order.index(y)) / (len(order) - 1)
    if x == y:
        return 1
    if x in f.get("wild", ()) or y in f.get("wild", ()):
        return 0.5
    return 0


def pair_score(a: Dict[str, List[str]], b: Dict[str, List[str]]) -> Optional[float]:
    num = 0.0
    den = 0.0
    for dim, w in DIMENSIONS:
        sims = [_item_sim(f, a[f["q"]], b[f["q"]]) for f in FEATURES if f["dim"] == dim and f["q"] in a and f["q"] in b]
        if not sims:
            continue
        num += w * (_sum_lr(sims) / len(sims))
        den += w
    return num / den if den else None


def pair_total(group: Sequence) -> float:
    """Sum of every pair's similarity at the table (first-pass clustering objective; no cohesion term)."""
    total = 0.0
    for i in range(len(group)):
        for j in range(i + 1, len(group)):
            s = pair_score(group[i].answers, group[j].answers)
            if s is not None:
                total += s
    return total


def energy_balance(group: Sequence) -> Optional[float]:
    levels = [m.answers[ENERGY_QUESTION][0] for m in group if m.answers.get(ENERGY_QUESTION)]
    if len(levels) < 2:
        return None
    return len(set(levels)) / min(3, len(levels))


def score_group_personality(group: Sequence):
    """Returns (mean pair similarity, cohesion, score, member_scores, energy_balance)."""
    member_scores: Dict[str, Optional[float]] = {m.booking_id: None for m in group}
    per_member: Dict[str, List[float]] = {m.booking_id: [] for m in group}
    pairs: List[float] = []
    for i in range(len(group)):
        for j in range(i + 1, len(group)):
            s = pair_score(group[i].answers, group[j].answers)
            if s is None:
                continue
            pairs.append(s)
            per_member[group[i].booking_id].append(s)
            per_member[group[j].booking_id].append(s)
    energy = energy_balance(group)
    similarity = mean = cohesion = None
    if pairs:
        for m in group:
            xs = per_member[m.booking_id]
            if xs:
                member_scores[m.booking_id] = _sum_lr(xs) / len(xs)
        mean = _sum_lr(pairs) / len(pairs)
        cohesion = min(member_scores[m.booking_id] for m in group if member_scores[m.booking_id] is not None)
        similarity = W_MEAN * mean + W_COHESION * cohesion
    if similarity is not None and energy is not None:
        score = (1 - W_ENERGY) * similarity + W_ENERGY * energy
    elif similarity is not None:
        score = similarity
    elif energy is not None:
        score = W_ENERGY * energy
    else:
        score = None
    return mean, cohesion, score, member_scores, energy


def table_themes(group: Sequence) -> List[dict]:
    need = max(2, math.ceil(len(group) / 2))
    found = []
    for qi, q in enumerate(THEME_QUESTIONS):
        counts: Dict[str, int] = {}
        for m in group:
            for o in m.answers.get(q, ()):
                if o not in THEME_EXCLUDED_OPTIONS:
                    counts[o] = counts.get(o, 0) + 1
        found.extend((-n, qi, o, q) for o, n in counts.items() if n >= need)
    found.sort()
    return [{"q": q, "o": o} for _, _, o, q in found[:MAX_THEMES]]


PERSONALITY_WEIGHTS = {"dimensions": dict(DIMENSIONS), "energy_balance": W_ENERGY, "mean": W_MEAN, "cohesion": W_COHESION}
