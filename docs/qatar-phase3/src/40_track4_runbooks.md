# Track 4 — Operations and QA simulations

## 4.0 Conventions for both runbooks

| Item | Rule |
|---|---|
| User API | `https://api.{domain}/api/v1`, bearer access token. **`user_id` is always taken from the token**; no request body carries a user id. |
| Admin API | `https://admin.{domain}/admin/v1`, admin SSO token with MFA; every call writes `audit_logs`. Endpoints marked *(v0.4)* are new in this package (C14). |
| Idempotency | Every POST carries `Idempotency-Key: <uuid>`. A replay returns the first result. |
| Database | The SQL files under `qatar/ops/` **are** the expected state transitions. Each runbook ends with a `99_verify.sql` that raises on the first mismatch. |
| Clock | Simulations set the live sessions' start to `T = now() + 24 h` (rounded to the minute), so "now" is `lock_at` (T-24 h). Earlier events (T-48 h, T-25 h) are written with explicit timestamps. |
| Test data | All seeded people, phones, venues and PSP IDs are fake (`example.test`, `TEST Venue …`, `test_psp`). |

### 4.0.1 Templates used (AR / EN)

v0.3 §4.3 templates are used unchanged. The three marked *(v0.4)* are new (C13). **[LEGAL]** review applies to all of them.

| Key | Arabic | English |
|---|---|---|
| `TABLE_LOCKED` | طاولتك مؤكدة! سنكشف المكان في {reveal_at}. | Your table is confirmed! We'll reveal the venue at {reveal_at}. |
| `VENUE_REVEALED` | المكان: {venue} في {district}. رمز طاولتك {code}. | Venue: {venue}, {district}. Your table code is {code}. |
| `QUORUM_FAIL_CHOICE` | نعتذر، لم يكتمل الحد الأدنى لطاولتك يوم {date}. اختر موعدًا آخر أو استردادًا كاملًا قبل {deadline}. | Sorry, your table on {date} didn't reach the minimum. Choose another date or a full refund before {deadline}. |
| `MOVED_TABLE` | غيّرنا طاولتك داخل الموعد نفسه لتكتمل المجموعة. الموعد واللغة والميزانية كما هي. | We moved you to another table in the same session so it's complete. Time, language and budget are unchanged. |
| `WAITLIST_OFFER` | توفر مقعد في {date}! أكّد خلال {window} للحجز والدفع. | A seat opened on {date}! Confirm within {window} to book and pay. |
| `REFUND_DONE` | تم رد {amount} إلى وسيلة دفعك. قد يستغرق ظهوره {days} أيام عمل. | {amount} has been refunded to your payment method. It may take {days} business days to appear. |
| `REPORT_RECEIVED` | وصلنا بلاغك ({case}). لن نكشف هويتك للشخص المُبلَّغ عنه. | We received your report ({case}). We won't reveal your identity to the person reported. |
| `REPORT_OUTCOME` | راجعنا بلاغك واتخذنا الإجراء المناسب وفق قواعد السلوك. | We reviewed your report and took appropriate action under our conduct rules. |
| `CONDUCT_DECISION` *(v0.4)* | وصلنا بلاغ بشأن سلوكك في لقاء {date} (الفئة: {category}). بعد المراجعة قررنا: {decision}. يمكنك الاعتراض مرة واحدة قبل {appeal_until}. | We received a report about your conduct at the event on {date} (category: {category}). After review, our decision is: {decision}. You may appeal once before {appeal_until}. |
| `APPEAL_DECISION` *(v0.4)* | راجع اعتراضَك مراجعٌ مستقل. القرار النهائي: {decision}. | Your appeal was reviewed by an independent reviewer. Final decision: {decision}. |
| `VENUE_TABLE_RELEASED` *(v0.4, to the venue contact)* | نعتذر، أُلغيت الطاولة {code} ليوم {date} لعدم اكتمال العدد. الطاولة متاحة لكم. | Sorry — table {code} for {date} is cancelled (minimum not reached). The table is released back to you. |

`CONDUCT_DECISION` and `APPEAL_DECISION` never contain the reporter's identity, the narrative or the names of other tablemates. Runbook B's verification checks this.

## 4.1 Runbook A — Quorum failure at T-24 h

**Objective.** Prove that, at `lock_at`, the system locks tables at quorum, never creates a table of 7, handles a leftover, cancels a below-quorum table kindly, lets members choose rebook or refund, and creates batch refunds with a full audit trail.

**Run:** `PGHOST=… PGUSER=… qatar/ops/runbook_a/run_simulation.sh` → `RUNBOOK A SIMULATION PASSED`.

### 4.1.1 Seed

| Set | Content | File |
|---|---|---|
| Reference | City `doh`; three published budget tiers; three signed test venues (Lusail tier 2, Msheireb tier 1, West Bay tier 3), all with `separate_bills_confirmed = true`; price plan 5900 minor (59 QAR placeholder); policy `cxl-qa-1` (48 h full refund, 0 % after, no-show 0 %); published questionnaire `QA-2026-01` with Q05 options from v0.3; 20 users (AR, tier-2 cap, consents current; u05 left Q05 blank); admins ops / finance / owner / 3 × T&S | `ops/seed_common.sql` |
| S1 | Arabic dinner at T, Lusail hint, `max_seats 18`. **13 paid bookings** (u01–u13), each saved S2 as a Q02 alternate. Seats bought through `hold_seat()`; payment recorded as a signed `payment.succeeded` webhook + `payments` row. | `runbook_a/01_seed_bookings.sql` |
| S2 | Arabic dinner at T, West Bay hint. **5 paid bookings** (u14–u18); u14 saved S3 as an alternate. | same |
| S3 | Arabic dinner at T + 7 days, on sale (rebook target). | `seed_common.sql` |

### 4.1.2 Timeline, actions and expected state

| # | Time | Actor | Action (API / admin UI / job) | Expected database state |
|---|---|---|---|---|
| A1 | T-14 d … T-48 h | Users | `POST /bookings {session_id, budget_tier_id, alternate_session_ids}` → hosted checkout → PSP webhook `POST /payments/webhooks/test_psp` | 18 bookings `payment_pending` → `paid_awaiting_group`; S1 `seats_sold = 13`, S2 `= 5`; 18 `payments` `succeeded` |
| A2 | T-48 h | Matching job (or ops: **Matching → Session → Publish**) | `psql -Atc "SELECT app.matching_input('<S>')" \| python3 publish_run.py --rule-version r1-interest --seed 20261023 --mode published \| psql -1` for S1, then S2 | S1: `matching_runs` (published, seed, `inputs_hash`), tables **T01 = 6, T02 = 6**, 1 leftover (`cell_below_quorum`, no assignment). S2: T01 = 5. All tables `forming`. |
| A3 | T-25 h | u17, u18 | `POST /bookings/{id}/cancel {reason:"schedule_changed"}` | Both `cancelled_by_user` (`cancel_actor = user`, `cancelled_at = T-25h`). **No refund** (after the 48 h deadline). S2 `seats_sold 5 → 3`; S2-T01 `confirmed_count 5 → 3`. |
| A4 | T-24 h (`lock_at`) | System + ops on call | **Session board → Decision cards** (`03_lock_t24.sql` §3.1) | Board: S1-T01 LOCK, S1-T02 LOCK, S2-T01 BELOW_QUORUM |
| A5 | T-24 h | System | Lock tables at quorum. Admin: `POST /admin/v1/tables/{id}:lock` *(v0.4)* | S1-T01/T02 `locked`, `locked_at`, `venue_confirmed_at`; 12 bookings `group_locked`; 12 × `TABLE_LOCKED`; 2 × audit `table_lock` |
| A6 | T-24 h | Ops | Leftover in S1. Decision-tree step 3 (down-tier seat in the same session): **none**, both tables are full and locked. `POST /admin/v1/bookings/{id}:cancel-organizer {reason:"no_table_formed"}` *(v0.4)* | Leftover booking `cancelled_by_organizer` (`cancel_reason_code = no_table_formed`); `QUORUM_FAIL_CHOICE` with `rebook_options = [S2, S3]` (alternates first); audit `booking_cancel_organizer`. S1 `seats_sold 13 → 12`. |
| A7 | T-24 h | Ops | S2-T01 decision tree. Step 1 MERGE within S2: **0 candidates** (one table). Step 2 FILL by invitation: individual offers to S2's Q02-alternate holders (the S1 leftover above); window 30 min [CONFIG], lock decision held ≤ 60 min. Simulation: no seat taken in time. | — |
| A8 | T-24 h + ≤ 60 min | Ops | **Table → Cancel for quorum**: `POST /admin/v1/tables/{id}:cancel-quorum {choice_hours:48}` *(v0.4)* → `app.cancel_table_quorum()` | S2-T01 `cancelled_quorum` (`cancel_reason = below_quorum`); u14–u16 `cancelled_by_organizer`; 3 × `QUORUM_FAIL_CHOICE`; audit `table_cancel`; S2 `seats_sold 3 → 0`. Venue called; `VENUE_TABLE_RELEASED` sent to the venue contact; audit `venue_notified`. |
| A9 | T-24 h + ≤ 60 min | System | Session states and reveal | S1 `locked`, S2 `cancelled`. Only locked tables are revealed: 12 bookings `revealed` + 12 × `VENUE_REVEALED` (venue, district, table code). No reveal for S2. |
| A10 | Choice window | u14 | `POST /bookings/{id}/resolution {"choice":"rebook","session_id":"<S3>"}` *(v0.4)* → `app.rebook_booking()` | New S3 booking `paid_awaiting_group`, same price, `rebooked_from_booking_id` → old booking; S3 `seats_sold +1`; **no new charge, no refund** |
| A11 | Choice window | S1 leftover | Same call, S3 (its first alternate, S2, was cancelled) | Second S3 booking; S3 `seats_sold = 2` |
| A12 | Choice window | u15 | `POST /bookings/{id}/resolution {"choice":"refund"}` | `refunds` row: 5900, `organizer_cancel`, `requested`, idempotency key `choice-refund-<booking>` |
| A13 | Choice window | u16 | No answer | — |
| A14 | Deadline | Job | `app.refund_unresolved_organizer_cancels(now() - interval '48 hours')` | 1 automatic refund for u16 (`auto-oc-<booking>`). Rebooked members get none. |
| A15 | Deadline | Finance | **Payments → Batch refunds → Approve**: `POST /admin/v1/refund-batches/{id}:approve` *(v0.4)* | 2 refunds `processing`, `approved_by = finance`; 2 × audit `refund_batch_approve` |
| A16 | +minutes | PSP | `refund.succeeded` webhooks (deduped on `(psp, psp_event_id)`) | refunds `refunded` (`psp_refund_id`, `completed_at`); payments `refunded`; 2 × `REFUND_DONE` |

### 4.1.3 Pass criteria (asserted in `runbook_a/99_verify.sql`)

| Check | Expected |
|---|---|
| S1 tables | `T01:6:locked, T02:6:locked`; no table anywhere above 6 |
| S2 table | `cancelled_quorum` |
| Revealed | 12 S1 bookings `revealed`; none in S2 |
| Late cancels | 2 `cancelled_by_user`, **no** refunds for them |
| Refunds | u15 and u16: 5900 each, `refunded` |
| Rebooks | 2 S3 bookings with `rebooked_from_booking_id`, from `below_quorum` and `no_table_formed` |
| Seats | `seats_sold` S1 = 12, S2 = 0, S3 = 2 |
| Notifications | `QUORUM_FAIL_CHOICE = 4`, `REFUND_DONE = 2`, `TABLE_LOCKED = 12`, `VENUE_REVEALED = 12` |
| Audit | `booking_cancel_organizer = 1`, `refund_batch_approve = 2`, `table_cancel = 1`, `table_lock = 2`, `venue_notified = 1` |

### 4.1.4 The MERGE branch (`MOVED_TABLE`)

In this scenario S2 has one table, so step 1 finds no candidate, and the runbook shows the empty result. The merge path is exercised by schema **check 15**: two forming tables (3 and 2 members) in one session; `app.move_booking_table(booking, to_table, actor, 'quorum_merge')` moves one member.

Expected results:

- target `confirmed_count` 3 → 4;
- one `MOVED_TABLE` notification;
- audit `table_move` with reason `quorum_merge`.

The function also raises in three cases:

- `REASON_CODE_REQUIRED` without a valid reason;
- `CROSS_SESSION_MOVE_FORBIDDEN` across sessions;
- `BLOCKED_PAIR` next to a blocked user.

Admin UI: **Matching → Session → Drag seat → Reason** = `POST /admin/v1/bookings/{id}:move {to_table_id, reason}` *(v0.4)*.

## 4.2 Runbook B — Live S1 safety report (`immediate_danger = true`)

**Objective.** Drill the S1 path end-to-end:

- authorities first (999 screen);
- coordinator paged within minutes;
- automatic interim block and temporary suspension;
- the reporter's identity never disclosed;
- every P4 read audited with a reason;
- ban with a second approver;
- appeal reviewed by a third, independent person.

**Run:** `qatar/ops/runbook_b/run_simulation.sh` → `RUNBOOK B SIMULATION PASSED`.

**Staffing prerequisite (C12).** A confirmed S1 that ends in a ban needs **three distinct T&S people**: the decider, the second approver and the appeal reviewer. The appeal guard trigger rejects an appeal decided by the decider or the second approver. If only two T&S staff exist at launch, the owner role must be trained and given the `trust_safety` appeal duty.

### 4.2.1 Seed

Session S4: Arabic dinner that started 30 minutes ago (`in_progress`), table T01 at the Msheireb test venue, 5 members (u01–u05), all `checked_in`. u02 also holds a paid future booking in S3. Files: `runbook_b/01_seed_live_table.sql`.

### 4.2.2 Timeline

| # | Time | Actor | Action | Expected state / evidence |
|---|---|---|---|---|
| B1 | T+0 | u01 (reporter) | SCR-07 → **إبلاغ خاص** → category `threat_violence`, toggles **"I'm in danger now"**. The app immediately shows the full-screen **999** screen: call button first (`tel:999`), then "continue report". | Client-side. QA: the 999 screen appears **before** submit and stays reachable after it. |
| B2 | T+0 | u01 | `POST /reports {"booking_id":"…","reported_seat":"<pseudonymous seat id>","category":"threat_violence","timing":"during","immediate_danger":true,"description":"…"}` *(v0.4)*. The reporter comes from the JWT; the reported user is resolved server-side from the seat. | `safety_reports`: `case_ref TS-YYYY-0001`, severity **1** (forced by `report_danger_is_s1`), `status new`, `sla_due_at = +24 h`, description stored encrypted (`description_enc`) |
| B3 | T+0 (same transaction) | System | Interim measures | `user_blocks` (reporter → reported, `source safety_case`, `report_id`), read as **mutual** via `blocked_pairs`; `report_actions`: `interim_block`, `temporary_suspension` (actor NULL = automatic); reported user `status suspended`; any mutual connection deleted silently; `REPORT_RECEIVED` to the reporter; audit `report_intake`, `user_block_auto`, `user_suspend_interim` |
| B4 | T+0 | System | Page the on-call coordinator (push + SMS through the paging tool) | audit `coordinator_paged` (`push_and_sms`). QA: time-to-acknowledge recorded on the drill sheet. |
| B5 | T+2 min | Coordinator (ops) | **Live board** pin shows case ref, category, severity, table code, district; **no narrative** for ops. One-click masked call to the venue day-of contact: staff assist, offer a safe exit (quiet space, taxi). In-app check-in with the reporter. | audit `venue_contact_called` (`S1_assist`), `reporter_checkin` (`safe_exit_offered`) |
| B6 | T+10 min | T&S primary | Opens the case (P4 read) → triage: confirms S1, checks for earlier cases on the same user (count only), assigns to self | audit `read_p4` (reason `case_triage`); status `triaged` → `investigating`; `assigned_to` |
| B7 | T+10 min | T&S primary | Checks that the suspended user's future bookings are held: the matcher's input shows `account_active = false`, so they are excluded from any run | Query in `03_coordinator_and_triage.sql`. "Hear the other side" (step 4) is **deferred for S1** because notifying could create risk; audit `reported_notice_deferred` (`S1_risk`). |
| B8 | ≤ 24 h | T&S primary + second approver | Decision: confirmed S1 → **permanent ban**. `POST /admin/v1/cases/{id}/actions {"action":"ban","second_approver":"<admin>"}` *(v0.4)*. The second approver's read is audited. | `report_actions` `ban` (actor ≠ second approver, CHECK); temporary suspension closed (`effective_to`); user `banned`; status `actioned`; held future booking `cancelled_by_organizer` (`account_banned`) with a full refund requested; audit `read_p4` (`second_approval`), `sanction_ban`, `sanction_approve` |
| B9 | ≤ 24 h | System | Notices | Reporter: `REPORT_OUTCOME` (generic). Reported user: `CONDUCT_DECISION` (date, category, decision, appeal deadline). **No reporter identity.** |
| B10 | Day +3 | Reported user | Appeals once: `POST /cases/{case_ref}/appeal` *(v0.4)* | status `appealed` |
| B11 | Day +3 | **Negative test** | The decider tries to review the appeal | Trigger raises `APPEAL_REVIEWER_CONFLICT` (P0051); the simulation asserts the refusal |
| B12 | ≤ Day +14 | Independent T&S reviewer | Reviews (P4 read audited) → `appeal_rejected` (ban upheld). `POST /admin/v1/cases/{id}/appeal-decision` *(v0.4)* | `report_actions` `appeal_rejected`; status `closed`; `APPEAL_DECISION` to the reported user; audit `read_p4` (`appeal_review`). A second appeal decision would raise `APPEAL_ALREADY_DECIDED`. |
| B13 | Close | T&S + ops | Tag the root cause (venue / matching / policy gap) for the D23 risk register | Case tags (outside this schema) |

### 4.2.3 Pass criteria (asserted in `runbook_b/99_verify.sql`)

| Check | Expected |
|---|---|
| Case ref | `TS-<year>-0001` |
| Block | Pair present in `blocked_pairs` (mutual); stays permanent regardless of outcome |
| Account | Reported user `banned`; temporary suspension closed with `effective_to` |
| Actions | `interim_block`, `temporary_suspension`, `ban`, `appeal_rejected` |
| Privacy | No notification to the reported user contains the reporter's id or display name |
| P4 audit | Exactly three `read_p4` rows: `case_triage`, `second_approval`, `appeal_review`, each with an actor |
| Bookings | Reported user's future booking cancelled (`account_banned`) with a 5900 refund requested |
| Matching | The banned user is not eligible in `matching_input()` for S3 |
| Notices | `REPORT_RECEIVED`, `REPORT_OUTCOME`, `CONDUCT_DECISION`, `APPEAL_DECISION` |

### 4.2.4 Drill sheet (fill in during a live rehearsal)

| Measure | Target [PROPOSED] | Observed |
|---|---|---|
| Report submit → coordinator acknowledged | ≤ 2 min | |
| Coordinator → venue contact reached | ≤ 5 min | |
| 999 screen shown before the submit button | Always | |
| Report → T&S triage | ≤ 15 min (S1) | |
| Report → decision | ≤ 24 h | |
| Reporter identity visible anywhere in the reported user's app, email or SMS | Never | |
