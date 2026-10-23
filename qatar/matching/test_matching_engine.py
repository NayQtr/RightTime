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


def test_thirteen_users_make_two_full_tables_and_one_leftover():
    # v0.3 §4.4.1 D19 step 2: never a table of 7
    r = run_matching(SESSION, "dry_run", "r1-interest", 13, make(13))
    assert sorted(t.size for t in r.tables) == [6, 6]
    assert len(r.leftovers) == 1 and r.leftovers[0].reason == "cell_below_quorum"


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
])
def test_invalid_input_rejected(kwargs):
    args = {"session_id": SESSION, "mode": "dry_run", "rule_version": "r1-baseline", "seed": 1, "bookings": make(4)}
    args.update(kwargs)
    with pytest.raises(MatchingError):
        run_matching(**args)


def test_booking_from_other_session_rejected():
    with pytest.raises(MatchingError):
        run_matching(SESSION, "dry_run", "r1-baseline", 1, make(4) + make(1, start=70, session="s-other"))
