---
title: "Phase 3 — Pre-Launch Execution & Validation Package (v0.4)"
subtitle: "{BRAND} social-dining service, Doha — builds on Qatar_Phase2_Completion_v0.3"
date: "2026-10-23"
---

# 0. Read me first

## 0.1 What this package is

This package turns the v0.3 specification into artefacts that can be executed, tested or sent out before launch. It has four tracks:

| Track | Deliverables | Gate it serves | Status in v0.4 |
|---|---|---|---|
| 1 Commercial / legal / compliance | 1.1 Legal counsel briefing memo · 1.2 Venue pitch & terms sheet (AR + EN) · 1.3 PSP technical integration checklist | O03, O04, O05 | **Drafts for external review.** Nothing here is legal advice or a signed term. |
| 2 UX research | 2.1 Design tokens + component state matrix · 2.2 Cognitive interview guide (AR + EN) · 2.3 D08 Question Adaptation Log | D08, D13, D24 | Tokens are machine-checked for contrast; the guide is ready to pilot; D08 holds **training examples only**. |
| 3 Engineering | 3.1 `001_init.sql` · 3.2 `matching_engine.py` · 3.3 pytest suite · 3.4 DB bridge | D15, D16, D18 | **Executed** on PostgreSQL 16.15 and Python 3.13 (results in §0.4). |
| 4 Ops / QA | 4.1 Runbook A — quorum failure at T-24 h · 4.2 Runbook B — live S1 report | D19, D24 | **Executed** end-to-end as SQL simulations with assertions (§0.4). |

## 0.2 Markers

| Marker | Meaning |
|---|---|
| **[LEGAL]** | Value or wording must be confirmed by Qatar-qualified counsel before use. |
| **[CONFIG]** | Operational setting stored in config; the value shown is the proposed default. |
| **[PROPOSED]** | A product proposal made in this package; needs owner sign-off. |
| **[COMMERCIAL]** | Left open on purpose — to be agreed with the venue or PSP; no figure is assumed. |
| **TRAINING EXAMPLE** | Illustrative content used to train researchers on the log format. **Not a finding.** Phase 1 forbids presenting invented research results as evidence. |
| `{BRAND}` | Brand placeholder for the Qatar service (the name is not decided in the Phase 1/2 files). |

## 0.3 Business rules carried unchanged from v0.3

These rules are enforced in code, not only described:

| Rule | Where it is enforced |
|---|---|
| Table size 4–6; quorum 4 | `event_tables.capacity CHECK (4..6)`, `min_quorum CHECK (= 4)`, `table_lock_quorum` CHECK; engine `validate_tables()` |
| One conversation language per table; no AR/EN mixing | `event_sessions.conversation_language` (one per session); bookings copy it; engine partitions by language and re-validates |
| No date of birth collected | `users` has only `age_eligibility_confirmed_at`; schema check 1 asserts no DOB-like column exists |
| `user_id` from the JWT only | API rule (v0.3 C1); DB functions take `p_user_id` as a parameter the API fills from the token; `rebook_booking` enforces ownership |
| Venue tier ≤ every member's cap; leftovers move **down** only | engine partition + `place_leftovers_downward()`; `move_booking_table()` raises `TIER_ABOVE_CAP` |
| Blocks are mutual and never overridden | `blocked_pairs` view; engine hard constraint; `move_booking_table()` raises `BLOCKED_PAIR` |
| Venue reveal only after lock | Runbook A step 3.6 reveals only `locked` tables |
| No-show fee = 0 % (non-punitive) | `cancellation_policies.no_show_fee_pct CHECK (= 0)` |
| Q07 is P4 and has no free text | `questions.q07_is_restricted CHECK`; Q07 answers store only the request flag |

## 0.4 Verification log (what was actually run)

All commands were run on 2026-10-23 in the project container against a local **PostgreSQL 16.15** and **Python 3.13.16 / pytest 9.1.1**.

| # | Command | Result |
|---|---|---|
| V1 | `psql -v ON_ERROR_STOP=1 -1 -f qatar/db/migrations/001_init.sql` | Applies cleanly; 33 base tables in schema `app` |
| V2 | `psql -v ON_ERROR_STOP=1 -1 -f qatar/db/tests/001_init_checks.sql` | `ALL CHECKS PASSED` (checks 1–14) and `CHECK 15 PASSED` |
| V3 | `cd qatar/matching && python3 -m pytest -q` | `27 passed` |
| V4 | `qatar/ops/runbook_a/run_simulation.sh` | `RUNBOOK A SIMULATION PASSED` (repeated 5×; booking UUIDs differ each run) |
| V5 | `qatar/ops/runbook_b/run_simulation.sh` | `RUNBOOK B SIMULATION PASSED` (repeated 3×) |
| V6 | `python3 qatar/design/contrast_check.py qatar/design/tokens.json` | 34 of 34 text/UI pairs meet WCAG 2.1 AA in light and dark |

What was **not** verified: any PSP sandbox, any venue, any legal position, any participant response. Those are the open gates.

## 0.5 Changes and additions vs v0.3

| # | Area | v0.3 | v0.4 | Why |
|---|---|---|---|---|
| C9 | Table sizing | §4.4.1 D19 expects 13 bookings → 2 × 6 + 1 leftover | Engine implements **fill-to-capacity**: full tables first; a remainder ≥ 4 forms its own table; a remainder < 4 is a leftover. Full tables are never split to rescue a remainder. | Makes the D19 expectation executable. Note: 9 bookings → 6 + 3 leftovers, not 5 + 4. **[PROPOSED]** product to confirm this trade-off (fuller tables vs. seating everyone). |
| C10 | Rebook mechanics | SCR-08b says `ننقل رسمك كما هو` (fee transferred as-is); no data model | `bookings.rebooked_from_booking_id` (unique FK) + `rebook_booking()` — the new booking is created as `paid_awaiting_group` with the same price; no second charge, no refund | One payment stays attached to the original booking; the ledger stays one-payment-per-booking. |
| C11 | Ops functions | Described in prose | `hold_seat`, `release_expired_holds`, `cancel_table_quorum`, `rebook_booking`, `refund_unresolved_organizer_cancels`, `move_booking_table`, `matching_input` | Atomic, testable, audited. |
| C12 | Appeal independence | "reviewed by someone who did not decide" | Trigger `check_appeal_reviewer` rejects an appeal decided by the case's decider **or second approver**, and allows one appeal decision only | A permanent ban therefore needs **three** distinct T&S people (decider, second approver, appeal reviewer). Staffing implication flagged in Runbook B. |
| C13 | Templates | 8 keys (§4.3) | + `CONDUCT_DECISION`, `APPEAL_DECISION`, `VENUE_TABLE_RELEASED` (AR + EN in §4.3 of this package) | v0.3 flow step 6/7 needed a reported-user notice; venue release was named but not worded. |
| C14 | API | §3 endpoints | + `POST /bookings/{id}/resolution`, `POST /reports`, and admin endpoints used by the runbooks (§4.0) | Needed to execute the runbooks. |
| C15 | Matching rule versions | `rule_version` free text | `r1-baseline` → `baseline_random`; `r1-interest` → `interest_opt_v1`; unknown versions are rejected | Reproducibility; no silent fallback. |
