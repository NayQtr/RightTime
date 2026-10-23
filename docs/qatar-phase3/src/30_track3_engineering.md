# Track 3 — Engineering and backend

## 3.1 Repository layout

| Path | What it is |
|---|---|
| `qatar/db/migrations/001_init.sql` | Complete schema for v0.3 §2 (schema `app`): 34 enums, 33 tables, 3 views + 1 materialised view, 20 functions and their triggers. Full text: Appendix A.1. |
| `qatar/db/tests/001_init_checks.sql` | 15 behaviour checks; each raises if a guard is missing. Appendix A.2. |
| `qatar/matching/matching_engine.py` | `run_matching()`, standard library only. Appendix A.3. |
| `qatar/matching/test_matching_engine.py` | pytest suite (27 tests). Appendix A.3. |
| `qatar/matching/publish_run.py` | Bridge: `app.matching_input()` JSON → engine → SQL that publishes the run. Appendix A.3. |
| `qatar/ops/…` | Runbook A/B seeds, steps and verifications. Appendix A.5. |
| `qatar/design/tokens.json`, `contrast_check.py` | Design tokens + WCAG checker. Appendix A.4. |

Run everything:

```bash
# scratch database (PostgreSQL 15+)
psql -d postgres -c "CREATE DATABASE qtest"
psql -d qtest -v ON_ERROR_STOP=1 -1 -f qatar/db/migrations/001_init.sql
psql -d qtest -v ON_ERROR_STOP=1 -1 -f qatar/db/tests/001_init_checks.sql      # ALL CHECKS PASSED + CHECK 15 PASSED
(cd qatar/matching && python3 -m pytest -q)                                     # 27 passed
qatar/ops/runbook_a/run_simulation.sh                                           # RUNBOOK A SIMULATION PASSED
qatar/ops/runbook_b/run_simulation.sh                                           # RUNBOOK B SIMULATION PASSED
python3 qatar/design/contrast_check.py qatar/design/tokens.json                 # exit 0
```

## 3.2 Schema decisions worth knowing

| Topic | Decision |
|---|---|
| Keys | UUID primary keys (`gen_random_uuid()`), except reference codes (`cities.id`, `legal_documents.version`). v0.3 recommends UUIDv7; switch the default to a v7 generator when the database version provides one. |
| Identity | `users` holds the encrypted phone, an HMAC lookup hash and the age **attestation**. No DOB column (check 1). `display_name` allows letters, spaces and hyphens only. |
| Consents & audit | `user_consents` and `audit_logs` are append-only (trigger raises `APPEND_ONLY`). `current_consents` view = latest row per user and type. `read_p4` audit rows require an actor and a reason (CHECK). |
| Questionnaire immutability | `qv_immutable` blocks UPDATE/DELETE of a published or retired version, except the single transition published → retired. `questions_immutable` / `question_options_immutable` block any change to the children of a published version. Exactly one version can be published (partial unique index). |
| Seat inventory | `hold_seat()` does a conditional `UPDATE … SET seats_sold = seats_sold + 1 WHERE seats_sold < max_seats`. The row lock makes concurrent holds serialise, so overbooking cannot happen. It is idempotent per `(user, idempotency_key)`. Cancellation and hold expiry give the seat back through `release_seat_on_cancel` / `release_expired_holds`. |
| Tables | `capacity BETWEEN 4 AND 6`, `min_quorum = 4`. A table cannot be `locked` below quorum or without a venue. `confirmed_count` is maintained by triggers from current assignments of paid bookings. |
| Money | One successful payment per booking (partial unique index). The sum of live refunds is ≤ the payment (`REFUND_EXCEEDS_PAYMENT`). Goodwill and dispute refunds need two different admins. |
| Policy | `no_show_fee_pct CHECK (= 0)`; `organizer_cancel_refund_pct CHECK (= 100)`. |
| Safety | `report_danger_is_s1`; a ban needs a second approver ≠ actor; the appeal reviewer must be independent of the decider and approver (`check_appeal_reviewer`); blocks are read as mutual (`blocked_pairs`). |

**Error codes raised by functions** (the API maps them to v0.3 §3.1 codes):

| SQLSTATE | Message | API mapping |
|---|---|---|
| P0010 | SESSION_FULL | 409 `SESSION_FULL` |
| P0011 | SESSION_NOT_ON_SALE | 409 `SESSION_NOT_ON_SALE` |
| P0012 | ALREADY_BOOKED | 409 `ALREADY_BOOKED` |
| P0030 / P0031 | NOT_REBOOKABLE / LANGUAGE_CONFLICT | 409 / 422 |
| P0040–P0046 | move_booking_table guards | admin UI error with reason |
| P0050 / P0051 | appeal already decided / reviewer conflict | admin UI error |
| P0001–P0004 | append-only, immutable questionnaire, option mismatch, refund exceeds payment | 500 (should never reach users) / 422 |

## 3.3 Matching engine contract

`run_matching(session_id, mode, rule_version, seed, bookings, block_rows=(), venue_capacity=6, venues=None) -> MatchResult`

| Step | Behaviour |
|---|---|
| Eligibility | Only `paid_awaiting_group`, current consents, age attested, account active, one booking per user. Everything else goes to `ineligible` with a reason. |
| Partition | Cells by `(conversation_language, budget_tier_rank)`. Languages never mix. |
| Order | `stable_shuffle` = SHA-256 of `seed:booking_id`. Reproducible across machines and Python versions. |
| Sizing | Fill-to-capacity (C9): `[cap] * (n // cap)` plus the remainder if ≥ 4. 12 → 6 + 6; 13 → 6 + 6 + 1 leftover; 3 → 3 leftovers. |
| Blocks | A person is never seated with someone they blocked or who blocked them. If no table fits, the reason is `blocked_conflict`. |
| Objective | `baseline_random`: seeded order only. `interest_opt_v1`: deterministic pairwise-swap hill-climbing that accepts only strict improvements of Σ score(G), score = 0.6·I + 0.4·C. Missing Q05 (or `no_pref`) is left out of I and C, never scored as 0. |
| Leftovers | First an open seat at a same-language table whose tier ≤ the person's cap. Then the remaining leftovers of each language are pooled and form tables at the lowest cap among members. Never upward. |
| Venues | Highest venue tier ≤ the table's tier with capacity ≥ size and stock left; otherwise a `no_venue_available` warning. |
| Validation | `validate_tables()` re-checks every hard constraint and raises `MatchingError` if any fails. |
| Output | Tables, leftovers, ineligible, `inputs_hash` (SHA-256 of canonical inputs and parameters), and `explanations` with pseudonymous `P-xxxxxxxx` seat IDs only. |

Test coverage (`27 passed`): 12 → two tables of 6 (both algorithms); 13 → 6 + 6 + 1; 3 → leftovers; blocked pair separated (5 seeds × 2 algorithms); missing answers not penalised (silent member and `no_pref`); no language mixing and downward-only tiers; never upward; determinism under input reordering; optimiser ≥ baseline; ineligible exclusion; pseudonymous explanations; venue tier and capacity 5; invalid inputs rejected; foreign-session booking rejected.
