"""pytest suite for matching_engine.run_matching (v0.4). Run: python3 -m pytest -q"""
import pytest

from matching_engine import (BookingInput, MatchingError, VenueInput, run_matching, score_group,
                             to_table_assignments, validate_tables, blocked_pairs)

SESSION = "s-0001"
TOPICS = [
    frozenset({"food", "travel"}), frozenset({"food", "books_culture"}), frozenset({"sport", "tech"}),
    frozenset({"tech", "books_culture"}), frozenset({"travel", "creative_hobbies"}), frozenset({"creative_hobbies", "food"}),
]


def make(n, lang="ar", tier=2, start=0, topics=True, session=SESSION, status="paid_awaiting_group"):
    return [BookingInput(booking_id=f"b{start + i:03d}", user_id=f"u{start + i:03d}", session_id=session,
                         status=status, conversation_language=lang, budget_tier_rank=tier,
                         q05_topics=TOPICS[(start + i) % len(TOPICS)] if topics else None)
            for i in range(n)]


@pytest.mark.parametrize("rule", ["r1-baseline", "r1-interest"])
def test_twelve_users_make_two_tables_of_six(rule):
    r = run_matching(SESSION, "dry_run", rule, 42, make(12))
    assert sorted(t.size for t in r.tables) == [6, 6]
    assert r.leftovers == []
    seated = {m.booking_id for t in r.tables for m in t.members}
    assert len(seated) == 12


def test_thirteen_users_greedy_6_make_two_full_tables_and_one_leftover():
    # v0.3 §4.4.1 D19 step 2: never a table of 7
    r = run_matching(SESSION, "dry_run", "r1-interest", 13, make(13), packing_mode="greedy_6")
    assert sorted(t.size for t in r.tables) == [6, 6]
    assert len(r.leftovers) == 1 and r.leftovers[0].reason == "cell_below_quorum"


def test_thirteen_users_min_leftovers_with_two_venue_tables():
    # Runbook A setting: the session has 2 bookable tables (12 seats)
    r = run_matching(SESSION, "dry_run", "r1-interest", 13, make(13), max_tables=2)
    assert sorted(t.size for t in r.tables) == [6, 6]
    assert len(r.leftovers) == 1


def test_thirteen_users_min_leftovers_unlimited_tables_seats_everyone():
    r = run_matching(SESSION, "dry_run", "r1-interest", 13, make(13))
    assert sorted(t.size for t in r.tables) == [4, 4, 5]
    assert r.leftovers == []


@pytest.mark.parametrize("n, max_tables, expected, left", [
    # seats spread evenly (owner, 10 Nov: prefer 5-6 over 4): 10 -> 5 + 5, 16 -> 6 + 5 + 5, 15 -> 5 + 5 + 5
    (9, None, [4, 5], 0), (9, 2, [4, 5], 0), (9, 1, [6], 3), (10, None, [5, 5], 0), (15, None, [5, 5, 5], 0),
    (16, None, [5, 5, 6], 0), (12, None, [6, 6], 0), (7, None, [6], 1), (3, None, [], 3), (8, 0, [], 8),
])
def test_min_leftovers_packing(n, max_tables, expected, left):
    r = run_matching(SESSION, "dry_run", "r1-baseline", 21, make(n), max_tables=max_tables)
    assert sorted(t.size for t in r.tables) == expected
    assert len(r.leftovers) == left
    assert all(4 <= t.size <= 6 for t in r.tables)


def test_greedy_6_nine_users_leaves_three():
    r = run_matching(SESSION, "dry_run", "r1-baseline", 21, make(9), packing_mode="greedy_6")
    assert [t.size for t in r.tables] == [6] and len(r.leftovers) == 3


def test_table_budget_is_shared_across_cells():
    pool = make(6, lang="ar") + make(6, lang="en", start=20)
    r = run_matching(SESSION, "dry_run", "r1-baseline", 2, pool, max_tables=1)
    assert len(r.tables) == 1 and len(r.leftovers) == 6


def test_three_users_become_leftovers_for_waitlist():
    r = run_matching(SESSION, "dry_run", "r1-interest", 7, make(3))
    assert r.tables == []
    assert len(r.leftovers) == 3
    assert {lo.reason for lo in r.leftovers} == {"cell_below_quorum"}
    assert all(e["seat"].startswith("P-") for e in r.explanations["leftovers"])


@pytest.mark.parametrize("rule", ["r1-baseline", "r1-interest"])
@pytest.mark.parametrize("seed", [1, 2, 3, 99, 2026])
def test_blocked_pair_is_never_seated_together(rule, seed):
    pool = make(12)
    blocks = [("u000", "u001")]                      # one-sided row; engine treats it as mutual
    r = run_matching(SESSION, "dry_run", rule, seed, pool, block_rows=blocks)
    for t in r.tables:
        users = {m.user_id for m in t.members}
        assert not {"u000", "u001"} <= users
    assert validate_tables(r.tables, 6, blocked_pairs(blocks)) == []
    assert sum(t.size for t in r.tables) == 12


def test_missing_optional_answers_are_not_penalised():
    answered = make(5)
    silent = BookingInput("b900", "u900", SESSION, "paid_awaiting_group", "ar", 2, q05_topics=None)
    no_pref = BookingInput("b901", "u901", SESSION, "paid_awaiting_group", "ar", 2, q05_topics=frozenset({"no_pref"}))
    i0, c0, s0, _ = score_group(answered)
    i1, c1, s1, ms = score_group(answered + [silent])
    assert (i0, c0, s0) == (i1, c1, s1)              # a silent member changes nothing
    assert ms["b900"] is None                        # stored as NULL member_score, not 0
    assert score_group(answered + [no_pref])[2] == s0
    r = run_matching(SESSION, "dry_run", "r1-interest", 5, answered + [silent])
    assert r.leftovers == [] and r.tables[0].size == 6   # still seated


def test_languages_never_mix_and_tiers_move_down_only():
    pool = make(4, lang="ar", tier=1) + make(2, lang="ar", tier=3, start=10) + make(4, lang="en", tier=2, start=20)
    r = run_matching(SESSION, "dry_run", "r1-baseline", 11, pool)
    for t in r.tables:
        assert {m.conversation_language for m in t.members} == {t.language}
        assert all(m.budget_tier_rank >= t.tier_rank for m in t.members)
    ar = [t for t in r.tables if t.language == "ar"]
    assert len(ar) == 1 and ar[0].size == 6 and ar[0].tier_rank == 1   # tier-3 pair joined the tier-1 table
    assert r.leftovers == []


def test_leftovers_never_move_up_a_tier():
    pool = make(4, lang="en", tier=3) + make(2, lang="en", tier=1, start=10)
    r = run_matching(SESSION, "dry_run", "r1-baseline", 3, pool)
    assert [t.tier_rank for t in r.tables] == [3]
    assert sorted(lo.booking.budget_tier_rank for lo in r.leftovers) == [1, 1]


def test_same_seed_is_deterministic_and_seed_matters_for_ordering():
    pool = make(18)
    a = run_matching(SESSION, "dry_run", "r1-interest", 123, pool)
    b = run_matching(SESSION, "dry_run", "r1-interest", 123, list(reversed(pool)))
    assert [[m.booking_id for m in t.members] for t in a.tables] == [[m.booking_id for m in t.members] for t in b.tables]
    assert a.inputs_hash == b.inputs_hash
    assert a.explanations == b.explanations


def test_interest_opt_scores_at_least_baseline():
    pool = make(18)
    base = run_matching(SESSION, "dry_run", "r1-baseline", 8, pool)
    opt = run_matching(SESSION, "dry_run", "r1-interest", 8, pool)
    assert sum(t.score for t in opt.tables) >= sum(t.score for t in base.tables) - 1e-9


def test_ineligible_bookings_are_excluded():
    pool = make(4) + make(1, start=50, status="payment_pending")
    pool.append(BookingInput("b060", "u060", SESSION, "paid_awaiting_group", "ar", 2, consents_current=False))
    r = run_matching(SESSION, "dry_run", "r1-baseline", 1, pool)
    assert r.tables[0].size == 4
    assert sorted(reason for _, reason in r.ineligible) == ["consents_not_current", "status_not_paid_awaiting_group"]


def test_explanations_are_pseudonymous():
    r = run_matching(SESSION, "published", "r1-interest", 9, make(6))
    blob = repr(r.explanations)
    assert "u00" not in blob and "b00" not in blob
    assert all(s.startswith("P-") for s in r.explanations["tables"][0]["seats"])


def test_capacity_and_venue_assignment():
    venues = [VenueInput("v-hi", tier_rank=3, capacity=6), VenueInput("v-lo", tier_rank=1, capacity=6)]
    r = run_matching(SESSION, "dry_run", "r1-baseline", 4, make(6, tier=2), venues=venues)
    assert r.tables[0].venue_id == "v-lo"                      # tier 3 venue is above the members' cap
    r5 = run_matching(SESSION, "dry_run", "r1-baseline", 4, make(10), venue_capacity=5)
    assert sorted(t.size for t in r5.tables) == [5, 5]
    rows = to_table_assignments(r5)
    assert len(rows) == 10


@pytest.mark.parametrize("kwargs", [
    {"mode": "live"}, {"rule_version": "r9"}, {"venue_capacity": 7}, {"venue_capacity": 3},
    {"packing_mode": "balanced"}, {"max_tables": -1},
])
def test_invalid_input_rejected(kwargs):
    args = {"session_id": SESSION, "mode": "dry_run", "rule_version": "r1-baseline", "seed": 1, "bookings": make(4)}
    args.update(kwargs)
    with pytest.raises(MatchingError):
        run_matching(**args)


def test_booking_from_other_session_rejected():
    with pytest.raises(MatchingError):
        run_matching(SESSION, "dry_run", "r1-baseline", 1, make(4) + make(1, start=70, session="s-other"))


# ----------------------------------------------------------------------------- celebration tables (migration 018)
from dataclasses import replace as _replace


def _q25(b, key):
    return _replace(b, answers={"Q25": [key]} if key else None)


@pytest.mark.parametrize("rule", ["r1-baseline", "r1-interest"])
def test_celebrant_never_sits_with_a_woman_who_prefers_no_celebrations(rule):
    pool = make(8)
    pool[0] = _replace(_q25(pool[0], "love_to_join"), occasion="birthday")
    pool[1] = _q25(pool[1], "prefer_none")
    for i in range(2, 8):
        pool[i] = _q25(pool[i], "dont_mind" if i % 2 else "love_to_join")
    for seed in range(20):
        r = run_matching(SESSION, "dry_run", rule, seed, pool)
        for t in r.tables:
            ids = {m.user_id for m in t.members}
            assert not {"u000", "u001"} <= ids


def test_unanswered_q25_counts_as_not_accepting():
    pool = [_q25(b, "dont_mind") for b in make(5)]
    pool[0] = _replace(pool[0], occasion="other")
    pool[4] = _q25(pool[4], None)              # answered v4 only: no Q25
    r = run_matching(SESSION, "dry_run", "r1-baseline", 7, pool)
    seated = {m.user_id for t in r.tables for m in t.members}
    assert not {"u000", "u004"} <= seated
    assert len(seated) == 4 and len(r.leftovers) == 1 and r.leftovers[0].booking.user_id in {"u000", "u004"}


def test_no_celebrant_means_no_extra_rule():
    pool = [_q25(b, "prefer_none") for b in make(6)]
    r = run_matching(SESSION, "dry_run", "r1-baseline", 3, pool)
    assert [t.size for t in r.tables] == [6]


def test_celebrant_keeps_her_seat_the_other_woman_is_left_out():
    # item 31: one of the two must be left out; it is always the woman who prefers no celebrations, never the celebrant
    for q in ("prefer_none", None):
        pool = [_q25(b, "dont_mind") for b in make(5)]
        pool[0] = _replace(pool[0], occasion="birthday")
        pool[4] = _q25(pool[4], q)
        for rule in ("r1-baseline", "r1-interest"):
            for seed in range(25):
                r = run_matching(SESSION, "dry_run", rule, seed, pool)
                assert [lo.booking.user_id for lo in r.leftovers] == ["u004"], (q, rule, seed)


# ----------------------------------------------------------------------------- matching rules (migration 020)
from matching_engine import (AGE_BANDS, HISTORY_LOOKBACK_DAYS, MATCHING_RULES, PRIORITY_REASON, age_band,
                             effective_rules, repeat_rules)


def _age(b, band):
    return _replace(b, answers={**(b.answers or {}), "Q11": [band]})


def _together(tables, a, b):
    return any({a, b} <= {m.user_id for m in t.members} for t in tables)


def _pair_seen(pool, history, rule="r1-baseline", seeds=range(30), a="u000", b="u001"):
    return [seed for seed in seeds
            if _together(run_matching(SESSION, "dry_run", rule, seed, pool, history=history).tables, a, b)]


def test_rules_are_the_owners_provisional_values():
    assert MATCHING_RULES == {
        "repeat_block_days": 14, "repeat_decay_end_days": 42, "repeat_penalty": 0.1, "max_age_band_gap": 2,
        "small_pool_below": 24, "small_repeat_block_days": 7, "small_max_age_band_gap": 3,
        "low_match_below": {"personality_v1": 0.3, "interest_opt_v1": 0.15, "baseline_random": 0.15},
        "priority_days": 28, "priority_boost": 0.05, "size4_penalty": 0.02}
    assert MATCHING_RULES["repeat_decay_end_days"] <= HISTORY_LOOKBACK_DAYS
    assert MATCHING_RULES["priority_days"] <= HISTORY_LOOKBACK_DAYS
    small, regular = effective_rules(23, "interest_opt_v1"), effective_rules(24, "interest_opt_v1")
    assert (small["small_session"], small["repeat_block_days"], small["max_age_band_gap"]) == (True, 7, 3)
    assert (regular["small_session"], regular["repeat_block_days"], regular["max_age_band_gap"]) == (False, 14, 2)
    assert regular["low_match_below"] == 0.15 and effective_rules(30, "personality_v1")["low_match_below"] == 0.3


def test_no_repeat_within_14_days_in_a_regular_session():
    pool = make(24)
    assert _pair_seen(pool, [["u000", "u001", 14, False]]) == []
    assert _pair_seen(pool, [["u001", "u000", 3, False]]) == []           # either order
    assert _pair_seen(pool, [["u000", "u001", 15, False]]) != []          # after the block: allowed (baseline has no penalty)
    r = run_matching(SESSION, "dry_run", "r1-interest", 1, pool, history=[["u000", "u001", 14, False]])
    assert r.explanations["rules"]["repeat_block_days"] == 14 and r.explanations["rules"]["small_session"] is False


def test_small_session_blocks_repeats_for_7_days_only():
    pool = make(12)
    assert _pair_seen(pool, [["u000", "u001", 7, False]]) == []
    assert _pair_seen(pool, [["u000", "u001", 8, False]]) != []
    assert run_matching(SESSION, "dry_run", "r1-baseline", 1, pool).explanations["rules"]["small_session"] is True


def test_both_asked_to_meet_again_lifts_the_block_and_the_penalty():
    assert _pair_seen(make(24), [["u000", "u001", 2, True]]) != []
    blocked, penalties = repeat_rules([["u000", "u001", 2, True], ["u002", "u003", 20, True]],
                                      effective_rules(24, "interest_opt_v1"))
    assert blocked == [] and penalties == {}


def test_repeat_penalty_falls_linearly_to_zero_at_42_days():
    rules = effective_rules(24, "interest_opt_v1")
    _, p = repeat_rules([["a", "b", 15, False], ["c", "d", 28, False], ["e", "f", 41, False], ["g", "h", 42, False]], rules)
    assert p == {frozenset("ab"): 27 / 28, frozenset("cd"): 0.5, frozenset("ef"): 1 / 28}
    _, p = repeat_rules([["a", "b", 8, False]], effective_rules(12, "interest_opt_v1"))
    assert p == {frozenset("ab"): 34 / 35}            # small session: from the 7-day block down to 0 at 42 days
    # recorded with the table: 0.1 x factor for the pair that sits together
    pool = make(24)
    seed = _pair_seen(pool, [["u000", "u001", 28, False]])[0]
    r = run_matching(SESSION, "dry_run", "r1-baseline", seed, pool, history=[["u000", "u001", 28, False]])
    rows = [e for t, e in zip(r.tables, r.explanations["tables"]) if _together([t], "u000", "u001")]
    assert [e["repeat_penalty"] for e in rows] == [0.05]


def test_optimised_rules_avoid_a_recent_repeat_when_tables_are_otherwise_equal():
    pool = make(24, topics=False)                     # no answers: every seating scores the same, so the penalty decides
    for seed in range(15):
        r = run_matching(SESSION, "dry_run", "r1-interest", seed, pool, history=[["u000", "u001", 20, False]])
        assert not _together(r.tables, "u000", "u001"), seed


def test_age_gap_at_most_two_bands_in_a_regular_session():
    assert age_band(_age(make(1)[0], "age_45_54")) == 3 and age_band(make(1)[0]) is None
    assert age_band(_replace(make(1)[0], answers={"Q11": ["age_18_24", "age_55_plus"]})) is None
    pool = make(24)
    pool[0], pool[1], pool[2] = _age(pool[0], "age_18_24"), _age(pool[1], "age_45_54"), _age(pool[2], "age_35_44")
    assert _pair_seen(pool, []) == []                               # 3 bands apart: never at one table
    assert _pair_seen(pool, [], b="u002") != []                     # 2 bands apart: allowed
    assert _pair_seen(pool, [], a="u001", b="u003") != []           # no age band: not limited


def test_small_session_allows_three_age_bands():
    pool = make(12)
    pool[0], pool[1], pool[2] = _age(pool[0], "age_18_24"), _age(pool[1], "age_45_54"), _age(pool[2], "age_55_plus")
    assert _pair_seen(pool, []) != []                               # 3 bands: allowed in a small session
    assert _pair_seen(pool, [], b="u002") == []                     # 4 bands: never


def test_low_match_tables_are_flagged_and_everyone_is_still_seated():
    shared = [_replace(b, q05_topics=frozenset({"food", "travel"})) for b in make(6)]
    assert run_matching(SESSION, "dry_run", "r1-interest", 1, shared).explanations["tables"][0]["low_match"] is False
    one_each = ["food", "travel", "sport", "tech", "books_culture", "creative_hobbies"]
    apart = [_replace(b, q05_topics=frozenset({t})) for b, t in zip(make(6), one_each)]
    r = run_matching(SESSION, "dry_run", "r1-interest", 1, apart)
    e = r.explanations["tables"][0]
    assert e["score"] == 0 and e["low_match"] is True and r.tables[0].low_match is True
    assert len(r.tables) == 1 and r.leftovers == []
    assert r.explanations["rules"]["low_match_below"] == 0.15
    silent = run_matching(SESSION, "dry_run", "r1-interest", 1, make(6, topics=False))
    assert silent.explanations["tables"][0]["low_match"] is False   # no score: nothing to judge


def test_every_table_records_its_score_components():
    pool = make(13)
    pool[0] = _replace(pool[0], unseated_days_ago=5)
    r = run_matching(SESSION, "dry_run", "r1-interest", 3, pool, history=[["u001", "u002", 30, False]])
    keys = {"interest", "cohesion", "score", "repeat_penalty", "priority_boost", "size_penalty", "objective", "low_match"}
    for e in r.explanations["tables"]:
        assert keys <= set(e)
        assert e["size_penalty"] == (0.02 if e["size"] == 4 else 0)
        assert abs(e["objective"] - (e["score"] - e["repeat_penalty"] + e["priority_boost"] - e["size_penalty"])) < 1e-3
    assert sum(e["priority_boost"] for e in r.explanations["tables"]) == 0.05


def test_a_woman_left_without_a_table_lately_gets_a_seat_first():
    pool = make(13, topics=False)                     # 2 tables for 13 women: one is left out
    left_out = set()
    for seed in range(20):
        who = run_matching(SESSION, "dry_run", "r1-interest", seed, pool, max_tables=2).leftovers[0].booking.booking_id
        left_out.add(who)
        prio = [_replace(b, unseated_days_ago=10) if b.booking_id == who else b for b in pool]
        r = run_matching(SESSION, "dry_run", "r1-interest", seed, prio, max_tables=2)
        assert len(r.leftovers) == 1 and r.leftovers[0].booking.booking_id != who, seed
        assert r.leftovers[0].reason == PRIORITY_REASON
        assert sum(t.size for t in r.tables) == 12      # the number seated never falls
        late = [_replace(b, unseated_days_ago=29) if b.booking_id == who else b for b in pool]
        assert run_matching(SESSION, "dry_run", "r1-interest", seed, late, max_tables=2).leftovers[0].booking.booking_id == who
        assert run_matching(SESSION, "dry_run", "r1-baseline", seed, prio, max_tables=2).leftovers[0].booking.booking_id == who
    assert len(left_out) > 1


def test_priority_never_takes_a_celebrants_seat():
    pool = [_q25(b, "love_to_join") for b in make(7, topics=False)]
    pool[0] = _replace(pool[0], occasion="birthday")
    for seed in range(20):
        r = run_matching(SESSION, "dry_run", "r1-interest", seed, pool, max_tables=1)
        others = [lo.booking.booking_id for lo in r.leftovers]
        prio = [_replace(b, unseated_days_ago=3) if b.booking_id in others else b for b in pool]
        r = run_matching(SESSION, "dry_run", "r1-interest", seed, prio, max_tables=1)
        assert "u000" in {m.user_id for m in r.tables[0].members}, seed
        assert len(r.tables[0].members) == 6


def test_history_and_unseated_days_enter_the_inputs_hash_only_when_present():
    pool = make(8)
    plain = run_matching(SESSION, "dry_run", "r1-interest", 1, pool).inputs_hash
    assert run_matching(SESSION, "dry_run", "r1-interest", 1, pool, history=[]).inputs_hash == plain
    assert run_matching(SESSION, "dry_run", "r1-interest", 1, pool, history=[["u000", "u001", 50, False]]).inputs_hash != plain
    pool2 = [_replace(pool[0], unseated_days_ago=40)] + pool[1:]
    assert run_matching(SESSION, "dry_run", "r1-interest", 1, pool2).inputs_hash != plain


def test_age_bands_are_the_questionnaire_order():
    assert AGE_BANDS == ("age_18_24", "age_25_34", "age_35_44", "age_45_54", "age_55_plus")
