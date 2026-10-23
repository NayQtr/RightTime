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
# Track 1 — Commercial, legal and compliance

## 1.1 Legal counsel briefing memo (gates O03 and O04)

> **To:** Qatar-qualified legal counsel (to be appointed)  
> **From:** {BRAND} product team  
> **Date:** 2026-10-23  
> **Re:** Pre-launch review under Law No. 13 of 2016 (Personal Data Privacy Protection) — special-nature data (Article 16), retention, and cancellation terms  
> **Status:** Briefing for instruction. Nothing in this memo is legal advice; every proposed value is for counsel to accept, amend or reject.

### 1.1.1 Why we are writing

We plan to run a small paid pilot of a social-dining service in Doha: people answer a short questionnaire, pay an organising fee through a licensed payment provider's hosted checkout, and are seated with 3–5 strangers at a partner café or restaurant. They order and pay for their own food at the venue. Before we collect any personal data or take any payment, Phase 1 requires three written decisions:

| Gate | Decision we need from you |
|---|---|
| **O03** | The classification of the business activity, and which licences or registrations are needed (commercial registration activity, any events or tourism permit, municipal requirements). |
| **O04** | How to handle potential special-nature data under **Article 16**, in particular our question Q07. |
| — | Approval (or redline) of retention durations RET-01 … RET-12 and of the exact cancellation, quorum and no-show wording. |

### 1.1.2 Our reading so far (please correct)

Phase 1 read the copy of the law published by the National Cyber Security Agency (NCSA). That copy says the official reference is the Official Gazette; we could not access the consolidated text on Al Meezan, so **we do not claim to know the current consolidated version or every implementing decision**. Our notes on the provisions we expect to matter:

| Article (as read) | Our working understanding | What we built because of it |
|---|---|---|
| 4 | Processing needs the individual's consent unless it is necessary for a legitimate purpose as the text allows | Separate, versioned consents per purpose in an append-only ledger (`user_consents`) |
| 5 | Rights to withdraw, object, erase, correct | `DELETE /users/me`; consent withdrawal recorded as a new ledger row |
| 9 | Inform the individual of purposes and recipients | Purpose line under every question (`purpose_ar/en`) and a privacy notice version on each consent |
| 10 | Data relevant, accurate, kept no longer than necessary | Retention rules RET-01 … RET-12 (§1.1.4) |
| 11, 13 | Internal procedures, safeguards, oversight of processors | Role-based admin, MFA required, audited P4 reads, encrypted phone and case text |
| 14 | Notify the individual and the competent department of a breach likely to cause serious damage | Incident runbook (not in this package). **We have not assumed a GDPR-style 72-hour deadline.** Please tell us the applicable timing. |
| 15 | Cross-border data flows | Hosting region not yet chosen. Please advise what the current text and guidance require. |
| 16 | Special-nature data (health, physical or psychological condition, religious beliefs, marital relationship, ethnic origin, and others listed) requires a permit; consent alone is not assumed sufficient | Q07 collects **no detail** today; special-data consent type exists but is **disabled** |
| 22 | Prior consent for direct electronic marketing | Marketing consent is separate, off by default, and not required to book |

### 1.1.3 Article 16 and question Q07

**The question as it ships today (v0.3, unchanged):**

| | Arabic (exact) | English |
|---|---|---|
| Question | هل تحتاج إلى ترتيب عملي في المكان أو الوجبة لإتمام الحجز؟ | Do you need a practical venue or meal arrangement to complete your booking? |
| Options | لا · أرغب في تواصل خاص بشأن ترتيب عملي | No · I'd like private contact about a practical arrangement |
| Free text | **None** | **None** |
| Stored | Only the selected option (a request flag), classed P4 | |
| On "private contact" | A private ops case (`support_cases`, type `practical_arrangement_Q07`) is opened. The user sees: `سيتواصل معك فريقنا بشكل خاص قبل اللقاء.` | |

**Why it may still touch Article 16.** A request for a "practical arrangement" can lead to the person telling us about an allergy, a disability, a pregnancy, a religious dietary need or a mobility condition. Even if we never ask for the reason, the follow-up conversation could create special-nature data.

**Options for counsel:**

| Option | What happens | Data we would hold | Our view |
|---|---|---|---|
| **A — Flag only, venue handles the detail** *(recommended for the pilot)* | We record only "private contact requested". Ops calls the user and offers to put them in direct touch with the venue's day-of contact, or tells them the venue's accessibility facts we already hold (`venues.accessibility`). Ops notes only the **outcome** ("arrangement confirmed with venue: yes/no"), never the reason. | Request flag + outcome flag + call timestamp | Lowest data footprint. Needs a written ops script that stops the user if they start giving health or belief details, and a note that we do not record them. |
| B — Collect a structured, minimal need | Fixed options such as "step-free access", "seat near exit", "vegetarian option" | Structured need, P4 | Some options (for example dietary or mobility) may themselves reveal health or belief. Likely needs the Article 16 permit before launch. |
| C — Remove Q07 | No question; users contact support on their own | Whatever the user writes to support | Moves the same risk into unstructured support chats. Not recommended. |

**Questions for counsel on Article 16:**

1. Does Option A (flag plus outcome only, with no reason recorded) avoid processing special-nature data? Or does the request flag itself count, given its context?
2. If a user volunteers health or belief details on the call despite the script, what must we do (delete at once, or record and protect)? How should the ops script word the interruption?
3. If we later want Option B, what does the permit process involve, who issues it today, and how long does it take?
4. Is `venues.accessibility` (facts about the venue, not the person) outside Article 16? We believe so.
5. Is the `special_data` consent type useful at all, or misleading if consent alone is not sufficient?

### 1.1.4 Retention — proposed durations RET-01 … RET-12

These durations are engineering defaults **[PROPOSED]**, chosen to meet the purpose and keep as little as possible (Article 10). Each one is enforced by a nightly deletion or anonymisation job that logs to `audit_logs` (`action = 'retention_purge'`). Please confirm or replace every row.

| Rule | Data | Proposed duration | Mechanism | Reason | Question for counsel |
|---|---|---|---|---|---|
| RET-01 | Identity: encrypted phone, display name | While the account is active. After deletion is requested: grace period 14 days (lets the user cancel the request), then anonymise within 30 days. | Null `phone_e164_enc` and `display_name`; replace `phone_lookup_hash` with a random value. **Exception:** a banned account keeps only `phone_lookup_hash` while the ban is active (blocks re-registration). | Account service; ban enforcement | Is keeping only the hash of a banned user's phone acceptable? For how long? |
| RET-02 | Login metadata (`last_login_at`, sessions) | Rolling 90 days | Overwrite / delete | Security investigation window | — |
| RET-03 | Consent ledger | Account life + 3 years | Delete rows for anonymised users after 3 years | Proof of consent if a complaint or dispute arises | What limitation period should the evidence window follow? |
| RET-04 | OTP challenges | ≤ 24 hours (fixed in v0.3) | Hourly purge | Rate limiting only | — |
| RET-05 | Superseded questionnaire responses | 30 days after being superseded | Delete response and answers | Lets us explain a recent matching decision | — |
| RET-06 | Check-in and attendance | 12 months after the event, then aggregate counts only | Null `checked_in_at`, `no_show` | Attendance and repeat KPIs, disputes | — |
| RET-07 | Matching scores and explanations | Delete when the feedback window closes (event end + 7 days [CONFIG]) | Null `member_score`; drop `explanations` | Keeps the v0.3 rule | — |
| RET-08 | Payments and refunds | **No proposal.** Keep, with no deletion job, until counsel confirms the statutory record-keeping period. | — | Accounting and tax records | What retention period do commercial, tax and accounting law require? (Phase 1: the Timeleft 10-year figure is **not** carried over.) |
| RET-09 | PSP webhook payloads | 90 days after processing (v0.3 [CONFIG]) | Delete row (the `payments`/`refunds` ledger keeps the facts) | Debugging and reconciliation | Should we keep payloads longer for chargeback disputes? |
| RET-10 | Private feedback comments | 12 months; if linked to a safety case, follows RET-11 | Delete text; keep ratings | Venue and service quality | — |
| RET-11 | Safety reports and case notes (P4) | Closed with no action: 12 months after closure. Actioned: 3 years after closure, or while a ban is active if that is longer. Referral to authorities or a legal hold: until legal releases it. | Delete `description_enc`, `rationale_enc`, notes; keep case ref + outcome code | Pattern detection, appeals, safety of other users | Is 3 years proportionate? Any rule on keeping data that was passed to the authorities? |
| RET-12 | Notification payloads | 30 days (v0.3 [CONFIG]) | Delete rows | Delivery debugging | — |

### 1.1.5 Cancellation, quorum and no-show wording for `cancellation_policies`

Version `cxl-qa-1` **[PROPOSED; LEGAL]**. These strings go into `cancellation_policies.text_ar` / `text_en`, appear on SCR-05 before payment, and are stored on every booking (`cancellation_policy_version`). The numbers are the proposed config: `full_refund_until_hours = 48`, `late_cancel_refund_pct = 0`, `organizer_cancel_refund_pct = 100`, `no_show_fee_pct = 0`, choice window 48 h, quorum 4.

**Arabic (text_ar):**

> **سياسة الإلغاء والحد الأدنى للطاولة (الإصدار cxl-qa-1)**
>
> ١. **رسم التنظيم:** تدفع رسم التنظيم المعروض عند الحجز فقط. ثمن الطعام والمشروبات تدفعه أنت مباشرةً للمكان، ولا نحصّله ولا نردّه.
>
> ٢. **إلغاؤك قبل الموعد بـ48 ساعة أو أكثر:** نردّ رسم التنظيم كاملًا إلى وسيلة الدفع الأصلية. يظهر لك الموعد النهائي بالتاريخ والساعة قبل الدفع وفي صفحة حجزك.
>
> ٣. **إلغاؤك بعد ذلك:** لا يُردّ رسم التنظيم، لأن مقعدك محجوز لدى المكان وقد تتأثر طاولتك. يمكنك بدلًا من الإلغاء طلب النقل إلى موعد آخر إن توفّر مقعد.
>
> ٤. **الحد الأدنى للطاولة:** تُعقد الطاولة إذا اكتمل فيها ٤ أشخاص على الأقل، ولا تزيد عن ٦. نتحقق من ذلك قبل الموعد بـ24 ساعة.
>
> ٥. **إذا لم يكتمل الحد الأدنى أو ألغينا نحن:** لا تتحمل أي رسوم. تختار خلال 48 ساعة بين النقل إلى موعد آخر بنفس الرسم، أو استرداد رسم التنظيم كاملًا. إن لم تختر، نردّ المبلغ كاملًا تلقائيًا.
>
> ٦. **عدم الحضور:** لا نفرض أي غرامة على عدم الحضور. رسم التنظيم في هذه الحالة يخضع للبند ٣.
>
> ٧. **مدة ظهور المبلغ المسترد:** نرسل طلب الاسترداد فور استحقاقه، وقد يستغرق ظهوره في حسابك حتى {refund_days} أيام عمل حسب البنك.

**English (text_en):**

> **Cancellation and minimum-table policy (version cxl-qa-1)**
>
> 1. **Organising fee:** You pay only the organising fee shown at booking. You pay for food and drinks directly to the venue; we do not collect or refund them.
>
> 2. **If you cancel 48 hours or more before the start:** we refund the organising fee in full to your original payment method. The exact deadline (date and time) is shown before you pay and on your booking page.
>
> 3. **If you cancel after that:** the organising fee is not refunded, because your seat is reserved with the venue and your table may be affected. Instead of cancelling, you can ask to move to another session if a seat is available.
>
> 4. **Minimum table:** a table goes ahead with at least 4 and at most 6 people. We check this 24 hours before the start.
>
> 5. **If the minimum is not reached, or if we cancel:** you pay nothing. Within 48 hours you choose either a move to another session with the same fee, or a full refund of the organising fee. If you don't choose, we refund you in full automatically.
>
> 6. **No-shows:** we charge no penalty for not showing up. The organising fee in that case follows clause 3.
>
> 7. **Refund timing:** we send the refund as soon as it is due. It may take up to {refund_days} business days to appear, depending on your bank.

**Questions for counsel:** (a) Is a 0 % late-cancellation refund enforceable and fair for a consumer service in Qatar? (b) Must the policy say anything about force majeure, such as weather or public events? (c) Should clause 3's "move instead" be a right or a goodwill option?

### 1.1.6 Other questions (O03 and general)

1. **Activity classification (O03).** We take a fee for organising a seat and matching people. We do not sell food, hold customer money for venues, or run a wallet. Which commercial-registration activity fits? Does any events, tourism or municipal permit apply to recurring small group dinners held in licensed venues? (Phase 1 notes the Qatar Tourism page covers business-event organisers. We do not assume it applies.)
2. **Payments.** Phase 1's working assumption is merchant acceptance through a licensed PSP's hosted checkout, with no stored cards and no funds held for others. Does this need any licence of our own?
3. **Women-only or other restricted tables.** Not in the pilot. If they are proposed later, what constraints apply?
4. **Age eligibility.** We collect an attestation, not a date of birth. Is an attestation enough for an 18+ service in Qatar?
5. **Authorities' requests.** Who may lawfully request safety-case data, and through what process? (Ops routes every request to legal.)
## 1.2 Venue partner pitch and terms sheet (gate O05)

One page per language, for cafés and restaurants in Lusail, Msheireb and West Bay. Commercial terms are left as **[COMMERCIAL]** fields: this package assumes no commission, no guaranteed volume and no payment either way. Fill them in only after a conversation with the venue.

### 1.2.1 English

> **{BRAND} — small tables of strangers, at your venue**
>
> **What we do.** We bring together small groups of 4 to 6 adults who want to meet new people over coffee or dinner. Each guest answers a short questionnaire and pays us an organising fee in advance. We form the table and send the guests to you. **Each guest orders and pays for their own food and drinks, directly to you.**
>
> **What you get**
> - Guests who have already committed in advance, arriving at a set time on a day you agree.
> - A final head-count 24 hours before every session, so you can plan staff and stock.
> - Hosts who know the format: guests are told the "leave anytime" norm, the no-photos rule and our code of conduct before they arrive.
> - A single day-of coordinator to call if anything happens.
>
> **What we ask (pilot terms)**
>
> | # | Term | Detail |
> |---|---|---|
> | 1 | Reserved table | One table for up to **6** guests per session, reserved under a table code (e.g. `T01`) that guests give on arrival. |
> | 2 | Separate bills | Each guest receives and pays their **own bill**. *(Our system records this as `separate_bills_confirmed = true`; we cannot list a venue without it.)* |
> | 3 | No minimum spend on us | No minimum spend, deposit or cover charge charged to {BRAND}. If the venue has a per-person minimum for all customers, it must be stated in writing so we can show it to guests before they pay. |
> | 4 | Atmosphere | The table is in a **quiet or moderate** area where 6 people can talk without raising their voices (not next to speakers, a stage or the kitchen pass). |
> | 5 | Head-count & release | We confirm the final count at **T-24 h**. If a table does not reach 4 guests, we cancel it and tell you **immediately** so you can release the table. |
> | 6 | Day-of contact | You name one contact (name, role, phone) reachable from **T-3 h until the end of service**. Our coordinator confirms the booking with them at T-3 h. |
> | 7 | Incidents | If a guest feels unsafe, staff help them first (a quiet space, a taxi). In any emergency, staff call **999**. Staff then call our coordinator. |
> | 8 | Guest privacy | You receive only the **table code and head-count**. We do not share guests' names or phone numbers. Please do not photograph guests for marketing without their consent. |
> | 9 | Accessibility facts | You tell us honestly about step-free access, accessible toilets and parking, so we can tell guests before they book. |
> | 10 | Commercial terms | [COMMERCIAL] — sessions per week, days and times, any fee or commission (none assumed), term and notice period. |
>
> **Day-of protocol**
>
> | Time | Venue | {BRAND} |
> |---|---|---|
> | T-24 h | Receives the final count per table (or a release) | Locks tables, sends guests the venue and table code |
> | T-3 h | Confirms the reservation to the coordinator | Calls the day-of contact; marks `venue_confirmed_at` |
> | Arrival | Seats guests who give the table code; brings separate menus and bills | Coordinator on duty; guests check in in the app |
> | Problem | Staff assist the guest; 999 in any emergency; then call the coordinator | Coordinator handles it, contacting the guest only through the app |
> | After | — | Guests rate the venue privately; we share aggregated feedback with you if you want it |
>
> *This is a pilot proposal, not a contract. Signed terms will follow legal review.*

### 1.2.2 العربية

> **{BRAND} — طاولات صغيرة لأشخاص يتعارفون، في مكانكم**
>
> **ماذا نفعل؟** نجمع مجموعات صغيرة من ٤ إلى ٦ بالغين يرغبون في التعرّف على أشخاص جدد على قهوة أو عشاء. يجيب كل ضيف عن استبيان قصير ويدفع لنا رسم تنظيم مسبقًا، ثم نكوّن الطاولة ونرسل الضيوف إليكم. **يطلب كل ضيف طعامه ومشروباته ويدفع ثمنها لكم مباشرة.**
>
> **ما الذي تحصلون عليه؟**
> - ضيوف ملتزمون مسبقًا يصلون في موعد محدد وفي يوم نتفق عليه.
> - عدد نهائي للضيوف قبل كل موعد بـ24 ساعة، لتخطيط الطاقم والمخزون.
> - ضيوف يعرفون طبيعة اللقاء: نبلغهم قبل الوصول بحرية المغادرة في أي وقت، وبمنع التصوير، وبقواعد السلوك.
> - منسّق واحد في يوم اللقاء تتصلون به عند أي طارئ.
>
> **ما الذي نطلبه (شروط التجربة)**
>
> | # | البند | التفاصيل |
> |---|---|---|
> | ١ | طاولة محجوزة | طاولة واحدة لحتى **٦** ضيوف في كل موعد، محجوزة برمز (مثل `T01`) يذكره الضيوف عند الوصول. |
> | ٢ | فواتير منفصلة | يستلم كل ضيف **فاتورته الخاصة** ويدفعها. *(يسجّل نظامنا ذلك بالقيمة `separate_bills_confirmed = true`، ولا يمكننا إدراج مكان بدونها.)* |
> | ٣ | لا حدّ أدنى للإنفاق علينا | لا حدّ أدنى للإنفاق ولا عربون ولا رسم خدمة يُفرض على {BRAND}. إن كان لدى المكان حدّ أدنى للفرد يطبَّق على جميع الزبائن، فيُكتب ذلك لنعرضه على الضيوف قبل الدفع. |
> | ٤ | الأجواء | الطاولة في منطقة **هادئة أو متوسطة الهدوء** يستطيع فيها ٦ أشخاص الحديث دون رفع أصواتهم (بعيدًا عن السمّاعات والمسرح وممر المطبخ). |
> | ٥ | العدد وتحرير الطاولة | نؤكد العدد النهائي قبل الموعد بـ**24 ساعة**. إذا لم يكتمل الحد الأدنى (٤ ضيوف) نلغي الطاولة ونخبركم **فورًا** لتحريرها. |
> | ٦ | جهة التواصل يوم اللقاء | تحددون شخصًا واحدًا (الاسم، الصفة، الهاتف) متاحًا من **3 ساعات قبل الموعد حتى نهاية الخدمة**. يؤكد منسّقنا الحجز معه قبل الموعد بـ3 ساعات. |
> | ٧ | الطوارئ | إذا شعر ضيف بعدم الأمان، يساعده الطاقم أولًا (مكان هادئ، سيارة أجرة). في أي حالة طارئة يتصل الطاقم بـ**999**، ثم يتصل بمنسّقنا. |
> | ٨ | خصوصية الضيوف | تستلمون **رمز الطاولة والعدد فقط**. لا نشارك أسماء الضيوف أو أرقامهم. نرجو عدم تصوير الضيوف لأغراض تسويقية دون موافقتهم. |
> | ٩ | معلومات الوصول | تزوّدوننا بمعلومات دقيقة عن الدخول دون درج ودورات المياه المهيأة والمواقف، لنعرضها على الضيوف قبل الحجز. |
> | ١٠ | الشروط التجارية | [COMMERCIAL] — عدد المواعيد أسبوعيًا، الأيام والأوقات، أي رسم أو عمولة (لا نفترض وجودها)، المدة ومهلة الإنهاء. |
>
> **بروتوكول يوم اللقاء**
>
> | الوقت | المكان | {BRAND} |
> |---|---|---|
> | قبل 24 ساعة | يستلم العدد النهائي لكل طاولة (أو إشعار التحرير) | نثبّت الطاولات ونرسل للضيوف المكان ورمز الطاولة |
> | قبل 3 ساعات | يؤكد الحجز للمنسّق | نتصل بجهة التواصل ونسجّل `venue_confirmed_at` |
> | الوصول | يُجلس الضيوف الذين يذكرون رمز الطاولة؛ قوائم وفواتير منفصلة | منسّق مناوب؛ الضيوف يسجّلون حضورهم في التطبيق |
> | مشكلة | يساعد الطاقم الضيف؛ 999 في أي طارئ؛ ثم الاتصال بالمنسّق | يتابع المنسّق ويتواصل مع الضيف عبر التطبيق فقط |
> | بعد اللقاء | — | يقيّم الضيوف المكان بشكل خاص؛ نشارككم ملخصًا مجمّعًا إن رغبتم |
>
> *هذا عرض تجريبي وليس عقدًا. تُوقَّع الشروط النهائية بعد المراجعة القانونية.*

### 1.2.3 How a signed sheet maps to the database

| Term | Column | Rule enforced |
|---|---|---|
| Separate bills | `venues.separate_bills_confirmed` | `venue_signed_requirements` CHECK: a venue cannot be `signed` without it |
| No minimum spend on us | `venues.min_spend_policy` (written text) | Must be non-empty to sign; shown on SCR-05 |
| Quiet / moderate | `venues.noise_level` 1 = quiet, 2 = moderate, 3 = lively | Pilot assigns only 1–2 [CONFIG] |
| Table for 6 | `venues.seats_per_table_max ≥ 6`, `total_bookable_tables` | CHECK `seats_per_table_max >= 6` |
| Day-of contact | `venue_contacts.is_day_of_contact = true` (phone encrypted) | Live board turns amber if `venue_confirmed_at` is missing at T-3 h |
| Active | `venues.is_active` | Only `signed` venues can be active (`venue_active_requires_signed`) |

## 1.3 PSP technical integration checklist (gate O05)

Candidates named in the brief: **QPay**, **Dibsy**, **Fatora**, **Tap**. This checklist is what we must **confirm in writing and in a sandbox** for each one. We record no capability as present until we have evidence. QPay is the national debit-card scheme route, so first confirm whether it is integrated directly or through an acquiring bank or gateway.

### 1.3.1 Capability matrix (fill in with evidence)

Mark each cell ✅ with a link to documentation or a sandbox test ID, ❌ if absent, or ❓ while unknown. All cells start ❓.

| # | Capability | Why we need it | QPay | Dibsy | Fatora | Tap |
|---|---|---|---|---|---|---|
| P1 | Hosted checkout or redirect page (no card data touches our servers) | PCI scope, v0.3 C6 | ❓ | ❓ | ❓ | ❓ |
| P2 | 3-D Secure 2 on cards, with a clear result on return | Fraud, liability shift, E-PAY-2 | ❓ | ❓ | ❓ | ❓ |
| P3 | Apple Pay on the hosted page | Conversion on iOS | ❓ | ❓ | ❓ | ❓ |
| P4 | Google Pay on the hosted page | Conversion on Android | ❓ | ❓ | ❓ | ❓ |
| P5 | Local debit (NAPS / QPay) accepted | Local reach | ❓ | ❓ | ❓ | ❓ |
| P6 | QAR settlement to a Qatari bank account | Accounting | ❓ | ❓ | ❓ | ❓ |
| P7 | Server-to-server webhooks for payment success, failure and refund | Source of truth (v0.3 §3) | ❓ | ❓ | ❓ | ❓ |
| P8 | Webhook signature: HMAC (algorithm, header, signed fields, timestamp) | Reject forged events | ❓ | ❓ | ❓ | ❓ |
| P9 | Webhook retries with backoff, and a unique event ID | Our dedupe key `(psp, psp_event_id)` | ❓ | ❓ | ❓ | ❓ |
| P10 | Idempotency key on create-payment and create-refund | No double charge or double refund | ❓ | ❓ | ❓ | ❓ |
| P11 | Payment intent or session expiry we can set (≥ 10 min seat hold) | Match the seat-hold timer | ❓ | ❓ | ❓ | ❓ |
| P12 | Full refund by API | Organizer cancel, quorum fail | ❓ | ❓ | ❓ | ❓ |
| P13 | Partial refund by API, multiple partials up to the captured amount | Goodwill, policy % | ❓ | ❓ | ❓ | ❓ |
| P14 | Refund status by webhook (pending → succeeded / failed) | Refund tracker UI | ❓ | ❓ | ❓ | ❓ |
| P15 | Settlement / payout report (API or file) with fees per transaction | Daily reconciliation | ❓ | ❓ | ❓ | ❓ |
| P16 | Dispute / chargeback notification and evidence upload | Disputes screen | ❓ | ❓ | ❓ | ❓ |
| P17 | Sandbox with test cards for 3DS success, fail and challenge | QA before launch | ❓ | ❓ | ❓ | ❓ |
| P18 | Arabic hosted page, or a locale parameter | AR-first UX | ❓ | ❓ | ❓ | ❓ |
| P19 | Return / cancel URLs carrying our reference | SCR-05P | ❓ | ❓ | ❓ | ❓ |
| P20 | Pricing: MDR, fixed fee, refund fee, chargeback fee | [COMMERCIAL] | ❓ | ❓ | ❓ | ❓ |
| P21 | Onboarding requirements (CR, bank letter, website policies) and lead time | Launch plan | ❓ | ❓ | ❓ | ❓ |

**Hard gates.** A PSP is eligible only with ✅ on P1, P2, P6, P7, P8, P9, P10, P12 and P17. Without P13 we restrict policy refunds to 0 % or 100 %. Without P3/P4 we launch without wallets (v0.3 C6: "wallet buttons only if the PSP offers them").

### 1.3.2 Our side of the integration (must pass before launch)

| # | Requirement | Acceptance test |
|---|---|---|
| I1 | `POST /bookings` holds a seat (`hold_seat`) and creates a PSP session with idempotency key = `bookings.idempotency_key` | Two identical requests return the same booking and the same checkout URL. One seat is used (schema check 3). |
| I2 | Webhook endpoint `POST /payments/webhooks/{psp}` verifies the signature **before** parsing. It rejects a missing or invalid signature and a stale timestamp (> 5 min [CONFIG]) with `401`. | Replay a captured event with one byte changed → 401, nothing stored except a `signature_valid = false` row. |
| I3 | Deduplicate on `UNIQUE (psp, psp_event_id)`; processing is idempotent | Send the same event 3 times → one state change. |
| I4 | Never trust the browser return: SCR-05P polls our API, which reflects only webhook-confirmed state | Close the browser after paying → booking still becomes `paid_awaiting_group`. |
| I5 | Amount and currency in the webhook must equal `bookings.price_minor` and QAR, otherwise flag an anomaly | Tampered amount → booking stays `payment_pending`; finance alert. |
| I6 | A payment that succeeds after the hold expired → automatic full refund (E-PAY-5, reason `seat_unavailable`) | Simulate a late webhook → refund created with the idempotency key `late-<payment_id>`. |
| I7 | A second successful payment for the same booking is refunded at once (`payments_one_success_per_booking`) | Unique index blocks the second `succeeded` row; the anomaly job refunds it with reason `duplicate_charge`. |
| I8 | Refunds: idempotency key per refund; the sum of live refunds never exceeds the payment | Schema check 9 (`REFUND_EXCEEDS_PAYMENT`). |
| I9 | Goodwill and dispute refunds need maker + checker | Schema check 10. |
| I10 | Daily reconciliation: settlement report vs `payments`/`refunds` | Missing-in-ledger / missing-in-PSP / amount mismatch each raise an item; unresolved > 2 days alerts finance. |
| I11 | Secrets (API keys, webhook secret) only in the server's secret store; rotated at least every 90 days [CONFIG] | No PSP secret in the client bundle or the repository (secret scan in CI). |
| I12 | No PAN, CVV or full card data is ever logged; only `method_brand` and `card_last4` | Log scan in staging shows no 13–19-digit card-like sequences. |

### 1.3.3 Webhook verification reference (provider-neutral)

Exact header names, signed fields and encodings differ by provider. Fill in the three constants from the chosen PSP's documentation; the logic stays the same.

```python
import hashlib
import hmac
import time

SIGNATURE_HEADER = "X-Signature"        # replace with the PSP's header name
TIMESTAMP_HEADER = "X-Timestamp"        # replace (or None if the PSP signs without a timestamp)
MAX_SKEW_SECONDS = 300


def verify_webhook(raw_body: bytes, headers: dict, secret: bytes) -> bool:
    """Constant-time HMAC-SHA256 check over 'timestamp.body' (adjust the signed string to the PSP's spec)."""
    sig = headers.get(SIGNATURE_HEADER, "")
    ts = headers.get(TIMESTAMP_HEADER, "")
    if not sig or not ts or not ts.isdigit():
        return False
    if abs(time.time() - int(ts)) > MAX_SKEW_SECONDS:
        return False
    expected = hmac.new(secret, ts.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
```
# Track 2 — UX research and design system

## 2.1 Design tokens (Figma-ready)

The source of truth is `qatar/design/tokens.json`, written in the W3C Design Tokens format. Import it with Tokens Studio, or map it to Figma Variables collections `color/light`, `color/dark`, `type/ar`, `type/en`, `space`, `radius`, `elevation` and `motion`. The full file is in Appendix A.4. `qatar/design/contrast_check.py` recomputes every contrast ratio below from the file.

### 2.1.1 Colour (light / dark) with measured contrast

| Token | Light | Dark | Use | Contrast (light / dark) |
|---|---|---|---|---|
| `bg` | `#FBF8F4` | `#141210` | App background | — |
| `surface` | `#FFFFFF` | `#1E1B18` | Cards, inputs, sheets | — |
| `text` | `#1C1A17` | `#F3EEE7` | Body and headings | 17.36 / 14.85 on surface |
| `textMuted` | `#5C554C` | `#B9B0A4` | Helper text, purposes | 7.35 / 8.01 on surface |
| `textDisabled` | `#8F877C` | `#7D756B` | Disabled labels | 3.54 / 3.78 (disabled is exempt; kept ≥ 3:1) |
| `primary` | `#7A1F3D` | `#E7A3B8` | Primary action, selection | 10.04 / 8.43 on surface |
| `onPrimary` | `#FFFFFF` | `#3A0A1A` | Label on primary | 10.04 / 8.34 |
| `primarySubtle` | `#F6E7EC` | `#3A1A25` | Selected option-card fill | (paired with `text`) |
| `borderStrong` | `#8C8478` | `#8A8176` | Input and option-card boundary | 3.69 / 4.47 (UI ≥ 3:1) |
| `border` | `#D9D2C7` | `#423C35` | Decorative divider only | 1.50 / 1.57 (not a UI boundary) |
| `focus` | `#1F4FA8` | `#8DB4FF` | 2 px focus ring + 2 px offset | 7.66 / 8.25 |
| `success` / `warning` / `danger` / `info` | `#1F6B45` / `#8A5A00` / `#B3261E` / `#1F4FA8` | `#7FD3A7` / `#F2C46D` / `#FF9A8F` / `#8DB4FF` | Status text and icons | all ≥ 5.9 / ≥ 8.2 |

Status is never shown by colour alone: every badge carries a word and an icon.

### 2.1.2 Type scale — RTL (Arabic) and LTR (English)

| Role | Arabic (IBM Plex Sans Arabic) size / line-height / weight | English (IBM Plex Sans) size / line-height / weight | Notes |
|---|---|---|---|
| display | 32 / 1.40 / 700 | 30 / 1.20 / 700 | Onboarding hero only |
| h1 | 26 / 1.45 / 700 | 24 / 1.25 / 700 | One per screen |
| h2 | 21 / 1.50 / 600 | 20 / 1.30 / 600 | Card titles, section heads |
| body | 17 / 1.70 / 400 | 16 / 1.50 / 400 | Arabic needs taller line-height for diacritics and descenders |
| label | 16 / 1.50 / 500 | 15 / 1.40 / 500 | Buttons, inputs, options |
| caption | 14 / 1.60 / 400 | 13 / 1.45 / 400 | Purpose lines, timestamps |

RTL rules:

- Use logical properties everywhere (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`), so one stylesheet mirrors itself.
- Mirror direction icons: back, forward and chevrons. Do **not** mirror clocks, media controls, checkmarks or brand marks.
- Never letter-space Arabic.
- Prices, times, booking refs (`RT-7KQ4M2`) and OTP digits use the numeric family with tabular figures and Western digits (v0.3 `DIGIT_STYLE`). Wrap them in `<bdi>` (or `unicode-bidi: isolate`) so `59 ر.ق` and `RT-…` don't reorder.
- In AR mode, an English token inside an Arabic sentence (for example a district name typed by ops) is isolated the same way.

### 2.1.3 Spacing, radius, elevation, motion

| Group | Tokens |
|---|---|
| Space (4 px base) | 0, 4, 8, 12, 16, 20, 24, 32, 40, 48 · `gutter` 16 · `touchTarget` 48 |
| Radius | `sm` 6 (badges) · `md` 10 (inputs, buttons) · `lg` 16 (cards, option cards) · `xl` 24 (sheet top corners) · `pill` |
| Elevation | 0 flat (cards use a border) · 1 raised card / sticky price strip · 2 menus, toasts · 3 sheets, dialogs + 40 % scrim. Dark theme: lighten the surface one step instead of using shadows. |
| Motion | fast 120 ms · base 200 ms · slow 320 ms · easing `cubic-bezier(0.2, 0, 0, 1)`. Reduced motion: transitions 0 ms, except opacity fades ≤ 120 ms; the success check is static. |

### 2.1.4 Component state matrix (SCR-01 … SCR-10)

States: **D** default · **H/P** hover / pressed · **F** focus-visible · **X** disabled · **L** loading · **E** error · **Ø** empty · **S** success. ✓ = must be designed and built; — = not applicable.

| Screen | Component | D | H/P | F | X | L | E | Ø | S | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| SCR-01 Onboarding | Card carousel + dots | ✓ | ✓ | ✓ | — | — | — | — | — | Dots are buttons with `aria-label "3 / 1"`; swipe mirrors in RTL |
| | Language toggle ع / EN | ✓ | ✓ | ✓ | — | — | — | — | — | Switches `dir` and `lang` on `<html>` |
| | Primary CTA | ✓ | ✓ | ✓ | — | — | — | — | — | |
| SCR-02a Phone | Phone input (+974 fixed) | ✓ | — | ✓ | ✓ | — | ✓ | — | — | E: `UNSUPPORTED_COUNTRY`, invalid length |
| | Send-code button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | X until valid; L while requesting; E rate-limited with countdown |
| SCR-02b OTP | 6-cell OTP | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | `autocomplete="one-time-code"`; E wrong code (attempts left), expired (E-OTP-1..3) |
| | Resend link | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | X with visible timer |
| SCR-02c Consents | Eligibility checkbox (18+) | ✓ | ✓ | ✓ | — | — | ✓ | — | — | No DOB field anywhere |
| | Consent rows (terms, conduct, privacy; marketing optional) | ✓ | ✓ | ✓ | — | — | ✓ | — | — | Each links the document version |
| | Continue | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | E: `CONSENT_REQUIRED`, `DOCUMENT_VERSION_OUTDATED` |
| SCR-03 Questionnaire | Progress (`n / 6`) | ✓ | — | — | — | — | — | — | — | `role="progressbar"` with values |
| | Option card (radio / checkbox) | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | Selected = `primarySubtle` fill + `primary` border + check icon; X when max 3 is reached (Q05) |
| | Exclusive "لا تفضيل" | ✓ | ✓ | ✓ | — | — | — | — | — | Clears the others; announced via live region |
| | Purpose line | ✓ | — | — | — | — | — | — | — | `textMuted` caption under each question |
| | Summary + edit links | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | E: `VALIDATION_FAILED` highlights the cards |
| SCR-04 Session pick | Experience toggle (coffee / dinner) | ✓ | ✓ | ✓ | ✓ | — | — | — | — | |
| | Session card | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | Ø: E-LANG-1 (no session in your language); "Full" badge (E-FULL-1) |
| | Alternates checklist (Q02) | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | |
| | Sticky price strip | ✓ | — | — | — | — | — | — | — | `رسم التنظيم 59 ر.ق · الطعام يُدفع للمكان` |
| | Continue to payment | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | E: 409 `SESSION_FULL`, 422 `LANGUAGE_CONFLICT` / `BUDGET_CONFLICT` |
| SCR-05 Summary & checkout | Price breakdown | ✓ | — | — | — | — | — | — | — | Fee now · food at venue · expected total range |
| | Policy box (absolute deadline) | ✓ | — | ✓ | — | — | — | — | — | Expandable; shows version `cxl-qa-1` |
| | Hold timer | ✓ | — | — | — | — | ✓ | — | — | `aria-live="polite"` at 2 min and 30 s only; E = E-PAY-4 |
| | Pay button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | Idempotent; L after tap ("don't close"); E-PAY-1..3 |
| SCR-05P Processing | Status panel | — | — | — | — | ✓ | ✓ | — | ✓ | S: static check if reduced motion |
| SCR-06 Dashboard | Next-event hero card | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | One card per booking status (v0.3 status table); Ø: "Book your first table" |
| | Countdown | ✓ | — | — | — | — | — | — | — | `aria-live="off"` |
| | Action banners (0–2) | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ | Rebook offer, refund tracker, feedback request |
| SCR-07 Event details | Status badge + timeline stepper | ✓ | — | — | — | ✓ | — | — | — | Lock and reveal times are exact |
| | Venue block | ✓ | ✓ | ✓ | — | — | — | ✓ | — | Ø before reveal: district + price band + accessibility only |
| | Check-in "أنا هنا" | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | X before `check_in_opens_at` |
| | Support / private report links | ✓ | ✓ | ✓ | — | — | — | — | — | Report is always reachable, never hidden behind ratings |
| SCR-08a/b Cancel | Outcome panel | ✓ | — | — | — | ✓ | — | — | — | Computed by server from policy + time |
| | Choice cards (rebook / refund) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | Ø: no eligible session → refund only |
| | Destructive confirm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Red outline, not filled |
| | Refund tracker | ✓ | — | — | — | ✓ | ✓ | — | ✓ | requested → processing → refunded / failed |
| SCR-09 Feedback | Star rows (overall, comfort, venue) | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ | Radio group semantics, not icons only |
| | Contact picker per tablemate (Q08) | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | Ø if Q08 = no sharing; "no" is never shown to others |
| SCR-10 Private report | Category radios | ✓ | ✓ | ✓ | — | — | ✓ | — | — | |
| | Immediate-danger toggle → 999 screen | ✓ | ✓ | ✓ | — | — | — | — | — | Full-screen, call button first, then "continue report" |
| | Submit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | S: `REPORT_RECEIVED` with the case ref |
## 2.2 Cognitive interview moderator guide (45 min, AR + EN)

### 2.2.1 Method and set-up

| Item | Plan |
|---|---|
| Method | Cognitive interviewing in the CDC / Willis tradition: concurrent think-aloud plus scripted **verbal probes**. Probes cover the four response stages (comprehension, retrieval, judgement, response mapping), here grouped as comprehension, retrieval, comfort (judgement and sensitivity) and utility. Followed by a short task-based usability walk-through of SCR-01 → SCR-05 on the clickable prototype. |
| Participants | 12 adults in Doha. Proposed screener mix **[PROPOSED]**: 6 who prefer Arabic and 6 who prefer English for group conversation; each half includes people new to Doha (< 2 years) and long-term residents, and people who have and have not attended a social event with strangers. Everyone is 18+ by attestation (no date of birth is asked). |
| Language | The interview runs in the participant's preferred language. Only the matching script column is read. One moderator, one note-taker. |
| Materials | Prototype on a phone (participant's choice of iOS or Android frame), printed Q01–Q08 cards in both languages, consent form, note template (§2.2.5). |
| Recording | Audio only, and only with separate opt-in consent. Screen recording of the prototype. No video of faces. |
| Data protection | Participant IDs P01–P12. No real phone numbers are entered in the prototype (use the dummy `+974 5555 0000`). **If a participant starts describing health, religious, marital or ethnic details (most likely at Q07), the moderator stops gently and does not note the detail** (O04 is open; see §1.1.3). |
| Incentive | [CONFIG] — a fixed thank-you voucher, the same for everyone, paid even if they stop early. |
| Sample caveat | 12 interviews find comprehension and friction problems. They **do not** measure prevalence or price acceptance. No percentages are reported from this study. |

### 2.2.2 Timeline

| Min | Block | Goal |
|---|---|---|
| 0–4 | Welcome, consent, warm-up | Trust; explain think-aloud |
| 4–6 | Think-aloud practice | One neutral practice question |
| 6–24 | Q01–Q08 cognitive probes | About 2 min per question |
| 24–36 | SCR-01 → SCR-05 tasks | Usability of the booking path |
| 36–42 | Price-sensitivity probes | Reactions to the 59 QAR fee, with food paid separately |
| 42–45 | Wrap-up | Overall comfort, last words, thanks |

### 2.2.3 Script

**Block 0 — Welcome (read as written)**

| English | العربية |
|---|---|
| Thank you for coming. Today we are testing **our app, not you**. There are no right or wrong answers, and you can't make a mistake. | شكرًا لحضورك. نحن اليوم نختبر **التطبيق وليس أنت**. لا توجد إجابة صحيحة أو خاطئة، ولا يمكنك أن تخطئ. |
| I'll ask you to think out loud: say whatever goes through your mind as you read and answer. | سأطلب منك أن تفكّر بصوت مرتفع: قل كل ما يخطر ببالك وأنت تقرأ وتجيب. |
| You can skip any question, take a break, or stop at any time. You'll still receive the thank-you voucher. | يمكنك تخطّي أي سؤال أو أخذ استراحة أو التوقف في أي وقت، وستحصل على قسيمة الشكر في كل الأحوال. |
| Please don't tell us any personal health or medical details. We don't need them for this study. | نرجو ألا تذكر أي تفاصيل صحية أو طبية شخصية؛ لا نحتاجها في هذه الدراسة. |
| May we record the audio? It is only for our notes and is deleted after analysis. (Yes / No) | هل تسمح بتسجيل الصوت؟ هو لملاحظاتنا فقط ويُحذف بعد التحليل. (نعم / لا) |

**Block 1 — Practice (2 min)**

| English | العربية |
|---|---|
| "How many windows are there in the place where you live?" Please think out loud while you work it out. | «كم نافذة في المكان الذي تسكن فيه؟» فكّر بصوت مرتفع وأنت تحسبها. |

Coach once if needed: *"What are you thinking right now?"* / *«بماذا تفكّر الآن؟»*

**Block 2 — Question-by-question probes (Q01–Q08)**

The participant reads each card and answers aloud. Ask the scripted probes after the answer. Ask **spontaneous probes** only when you see hesitation, a re-read, a laugh or a changed answer. Write down which probe you used. The question wording below is the v0.3 text.

**Q01 — Language** · ما اللغة التي ترتاح لإجراء محادثة جماعية كاملة بها؟ / *In which language can you comfortably hold a full group conversation?*

| Probe | English | العربية |
|---|---|---|
| Comprehension | What does "comfortably hold a **full** group conversation" mean to you? | ماذا تعني لك عبارة «ترتاح لإجراء محادثة جماعية **كاملة**»؟ |
| Retrieval | How did you decide? Did you think of a particular situation? | كيف قررت؟ هل فكّرت في موقف معيّن؟ |
| Comfort | If you ticked both, would you be equally happy at an Arabic table and at an English table? | إن اخترت اللغتين، هل ستكون مرتاحًا بنفس القدر على طاولة عربية وعلى طاولة إنجليزية؟ |
| Utility | Why do you think we ask this? | لماذا تظن أننا نسأل هذا؟ |

**Q02 — Session and alternates** (asked on SCR-04)

| Probe | English | العربية |
|---|---|---|
| Comprehension | What do you expect happens if you tick "other sessions I could attend"? | ماذا تتوقع أن يحدث إذا اخترت «مواعيد أخرى أستطيع حضورها»؟ |
| Comfort | Would you expect to be moved automatically, or asked first? | هل تتوقع أن يُنقل حجزك تلقائيًا، أم أن نسألك أولًا؟ |
| Utility | Would ticking alternates make you more or less likely to book? Why? | هل اختيار مواعيد بديلة يجعلك أكثر أو أقل رغبة في الحجز؟ لماذا؟ |

**Q03 — Experience (coffee / dinner)** (asked on SCR-04)

| Probe | English | العربية |
|---|---|---|
| Comprehension | What do you picture for "coffee" vs "dinner": time of day, length, cost? | ماذا تتخيّل في «قهوة» مقابل «عشاء»: الوقت، المدة، التكلفة؟ |
| Retrieval | What made you choose this one today? | ما الذي جعلك تختار هذا اليوم؟ |
| Utility | Is anything missing that would help you choose? | هل ينقص شيء يساعدك على الاختيار؟ |

**Q04 — Food and drink budget cap** · ما الحد الأعلى المناسب لإنفاقك على الطعام والمشروبات، بخلاف رسم الخدمة الظاهر؟

| Probe | English | العربية |
|---|---|---|
| Comprehension | In your own words, what is this asking? Does the amount include the 59 QAR fee? | بكلماتك، عمّ يسأل هذا السؤال؟ هل المبلغ يشمل رسم 59 ر.ق؟ |
| Retrieval | How did you arrive at that band? Did you think of a recent meal out? | كيف وصلت إلى هذه الفئة؟ هل فكّرت في وجبة حديثة خارج المنزل؟ |
| Comfort | How comfortable are you telling us your budget? Would you be comfortable if others at the table knew it? | ما مدى ارتياحك لإخبارنا بميزانيتك؟ وهل ترتاح إن عرفها الآخرون على الطاولة؟ |
| Comfort (cultural) | Is there anything awkward about choosing the lowest band? | هل في اختيار الفئة الأدنى أي حرج؟ |
| Utility | What do you expect us to do with this answer? | ماذا تتوقع أن نفعل بهذه الإجابة؟ |

**Q05 — Topics (up to 3)** · اختر حتى ثلاثة موضوعات تستمتع بالحديث عنها.

| Probe | English | العربية |
|---|---|---|
| Comprehension | What would "creative hobbies" or "books and culture" include for you? | ماذا تشمل «هوايات إبداعية» أو «كتب وثقافة» بالنسبة لك؟ |
| Retrieval | Was choosing only three easy or hard? Which one did you drop? | هل كان اختيار ثلاثة فقط سهلًا أم صعبًا؟ ما الذي استبعدته؟ |
| Comfort | Is any topic you'd expect missing, or one you'd prefer not to be offered? | هل هناك موضوع توقعته وغير موجود، أو موضوع تفضّل ألا يُعرض؟ |
| Utility | Do you think shared topics would make a first dinner easier? | هل تظن أن المواضيع المشتركة تجعل العشاء الأول أسهل؟ |

**Q06 — What helps you participate comfortably**

| Probe | English | العربية |
|---|---|---|
| Comprehension | What do you imagine "an opening question" or "turn-taking for everyone" looks like at the table? | كيف تتخيّل «سؤالًا افتتاحيًا» أو «إتاحة الدور للجميع» على الطاولة؟ |
| Retrieval | Think of the last time you met a group of new people. What helped? | تذكّر آخر مرة قابلت فيها مجموعة جديدة. ما الذي ساعدك؟ |
| Comfort | Would you mind if the table saw which option you chose? | هل يزعجك أن يرى الآخرون اختيارك؟ |
| Utility | Would you use a conversation-starter card if it were on the table? | هل ستستخدم بطاقة لبدء الحديث إن وُجدت على الطاولة؟ |

**Q07 — Practical arrangement (handle with care)** · هل تحتاج إلى ترتيب عملي في المكان أو الوجبة لإتمام الحجز؟

| Probe | English | العربية |
|---|---|---|
| Comprehension | What kinds of "practical arrangement" come to mind? *(If they start giving a personal medical detail, say: "Thank you — we don't need the details, just the kind of thing.")* | ما أنواع «الترتيب العملي» التي تخطر ببالك؟ *(إن بدأ بذكر تفصيل طبي شخصي: «شكرًا، لا نحتاج التفاصيل، يكفينا نوع الأمر بشكل عام.»)* |
| Comfort | How do you feel about choosing "private contact" instead of writing it here? | ما شعورك تجاه اختيار «تواصل خاص» بدلًا من كتابة طلبك هنا؟ |
| Comfort | Who would you be comfortable speaking with: our team, the venue directly, or nobody? | مع من ترتاح للحديث: فريقنا، أم المكان مباشرة، أم لا أحد؟ |
| Utility | What would you expect to happen after you choose it, and how soon? | ماذا تتوقع أن يحدث بعد اختيارك، وخلال كم من الوقت؟ |

**Q08 — Contact after the event** · كيف تفضل إتاحة التواصل بعد اللقاء؟

| Probe | English | العربية |
|---|---|---|
| Comprehension | What does "contact after mutual agreement" mean? Who sees what? | ماذا تعني «تواصل بعد موافقة متبادلة»؟ من يرى ماذا؟ |
| Comfort | If you said "no" to someone, would you worry they'd find out? | إن رفضت التواصل مع شخص، هل تقلق أن يعرف ذلك؟ |
| Utility | Is "no sharing" as a default right for you? | هل خيار «لا مشاركة» كإعداد افتراضي مناسب لك؟ |

**Block 3 — Booking-flow tasks (SCR-01 → SCR-05)**

Read the task, then stay silent. Record success / assisted / fail, the time taken, and every hesitation.

| # | Task (EN) | المهمة (AR) | Success criterion | Probe afterwards |
|---|---|---|---|---|
| T1 | "Open the app and get to the point where you'd enter your phone number." | «افتح التطبيق وتابع حتى تصل إلى إدخال رقم هاتفك.» | Reaches SCR-02a | "What did the first three cards tell you?" / «ماذا أخبرتك البطاقات الثلاث الأولى؟» |
| T2 | "Sign up with this test number and code 123456." | «سجّل بهذا الرقم التجريبي والرمز 123456.» | Passes OTP + consents | "Which of these agreements did you feel you had to accept, and which were optional?" / «أي الموافقات شعرت أنها إلزامية وأيها اختيارية؟» |
| T3 | "Book a dinner next week in a language that suits you." | «احجز عشاءً الأسبوع القادم بلغة تناسبك.» | Reaches SCR-05 with a session selected | "Where will this dinner take place?" (tests the reveal concept) / «أين سيكون هذا العشاء؟» |
| T4 | "Before paying, find out what happens if you cancel two days before." | «قبل الدفع، اعرف ماذا يحدث إن ألغيت قبل يومين.» | Opens the policy box and states the rule | "Was the deadline clear? In your own words?" / «هل كان الموعد النهائي واضحًا؟ بكلماتك؟» |
| T5 | "Tell me how much in total you expect to spend on this evening." | «أخبرني كم تتوقع أن تنفق إجمالًا في هذه الأمسية.» | States fee + food range | (leads into Block 4) |

**Block 4 — Price-sensitivity probes (59 QAR is a placeholder, not a decided price)**

| # | English | العربية |
|---|---|---|
| PS1 | The screen shows "Organising fee 59 QAR · food paid to the venue". What are you paying 59 QAR **for**? | تعرض الشاشة «رسم التنظيم 59 ر.ق · الطعام يُدفع للمكان». مقابل **ماذا** تدفع 59 ر.ق؟ |
| PS2 | And who do you pay for the food, and when? | ولمن تدفع ثمن الطعام، ومتى؟ |
| PS3 | Thinking only about the organising fee, not the food: at what fee would it feel **so cheap** you'd doubt the quality? | بالتفكير في رسم التنظيم فقط دون الطعام: عند أي رسم ستشعر أنه **رخيص جدًا** لدرجة الشك في الجودة؟ |
| PS4 | At what fee would it feel like **a bargain**? | عند أي رسم ستشعر أنه **صفقة جيدة**؟ |
| PS5 | At what fee would it start to feel **expensive**, though you'd still consider it? | عند أي رسم سيبدأ يبدو **مرتفعًا** مع أنك قد تفكّر فيه؟ |
| PS6 | At what fee would it be **too expensive** to consider? | عند أي رسم سيكون **مرتفعًا جدًا** فلا تفكّر فيه؟ |
| PS7 | Would your answer change for coffee vs dinner? | هل تتغير إجابتك بين القهوة والعشاء؟ |
| PS8 | Fee plus food, what total would you expect for a dinner like this? Does paying separately feel normal or odd? | الرسم مع الطعام: ما الإجمالي الذي تتوقعه لعشاء كهذا؟ وهل الدفع المنفصل يبدو طبيعيًا أم غريبًا؟ |
| PS9 | If the table didn't reach 4 people, what would you expect to happen to your 59 QAR? | إن لم تكتمل الطاولة بـ٤ أشخاص، ماذا تتوقع أن يحدث لـ59 ر.ق؟ |

PS3–PS6 follow the Van Westendorp question form, used **qualitatively** here: note each person's four amounts and their reasons. With n = 12, do not draw price curves or report an "optimal price".

**Block 5 — Wrap-up**

| English | العربية |
|---|---|
| On a scale of 1 to 5, how comfortable would you feel going to the first dinner? What would move it up by one? | من 1 إلى 5، ما مدى ارتياحك للذهاب إلى العشاء الأول؟ ما الذي يرفعه درجة واحدة؟ |
| Which question today felt the most personal? | أي سؤال اليوم شعرت أنه الأكثر خصوصية؟ |
| Anything we should have asked but didn't? | هل هناك شيء كان يجب أن نسأل عنه ولم نفعل؟ |
| Thank you. Here is your voucher. | شكرًا لك. هذه قسيمتك. |

### 2.2.4 Moderator rules

1. Never explain what a question "really means" before the participant answers. Explaining afterwards is allowed and is noted.
2. Don't defend the design. Answer "why does it do that?" with "What would you expect it to do?"
3. Keep to the time-box. If you are behind at minute 24, skip the Q03 and Q06 retrieval probes, never the comfort probes.
4. Write down the participant's exact words for every misunderstanding; they feed D08.
5. If the participant becomes distressed, stop the session and pay the voucher.

### 2.2.5 Note template (one row per question per participant)

| Pid | Lang | Q | Answer given | Hesitation (Y/N) | Probe used | Verbatim | Problem type (C / R / J / M / Comfort / Utility / none) | Severity (1 cosmetic · 2 slows · 3 wrong answer · 4 drop-off risk) |
|---|---|---|---|---|---|---|---|---|
| P01 | ar | Q04 | | | | | | |

## 2.3 D08 — Question Adaptation Log

**How the log works.** Every observed problem gets a row. A wording change creates a new **draft** questionnaire version; published versions are immutable (DB trigger `qv_immutable`). A change is published only after the product owner approves it, plus the legal reviewer for anything touching P3/P4 data. Then `questionnaire_versions.change_log_ref` points to the D08 IDs it contains.

**Columns:** ID · Question · Version found in · Source (study, participant, language) · What was observed (verbatim) · Problem type · Severity · Proposed change (AR / EN) · Data / matching impact · Decision · Approved by · Released in version · Status.

> **TRAINING EXAMPLES — hypothetical.** The three rows below show researchers how to fill in the log. They are **not** research findings. No interviews had been run when this package was written. Delete these rows before the first real entry.

| ID | Q | Found in | Source | Observed (verbatim) | Type | Sev | Proposed change | Impact | Decision | Approved by | Released in | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D08-TRAIN-01 | Q04 | QA-2026-01 | TRAINING EXAMPLE · ar | «يعني 100 مع الـ59؟» ("so 100 including the 59?") — the participant added the fee to the food budget and picked a band one level lower than intended. | Comprehension (response mapping) | 3 | AR: «ما الحد الأعلى لإنفاقك على الطعام والمشروبات **في المكان**؟ (رسم التنظيم 59 ر.ق منفصل ولا يدخل في هذا المبلغ)» · EN: "What is the most you'd spend on food and drinks **at the venue**? (The 59 QAR organising fee is separate and not part of this amount.)" | Users may be matched to a lower venue tier than they can afford. No data-class change (P3). | Accept. Re-test with 3 more participants before release. | Product owner | QA-2026-02 | Training |
| D08-TRAIN-02 | Q04 | QA-2026-01 | TRAINING EXAMPLE · en | "I don't want people to think I'm cheap — I'll pick the middle one." The participant chose a band above their real cap because of perceived social visibility. | Comfort (social desirability) | 3 | Add a privacy line under the question: AR «لا يرى أحد على الطاولة إجابتك.» · EN "No one at your table sees this answer." Keep the band labels neutral (no "economy" wording). | Over-stated caps place users at venues above their budget (a fairness and churn risk). Labels in `budget_tiers` are updated in config, not in the published questionnaire. | Accept the copy change. Label change goes through the venue-tier config review. | Product owner | QA-2026-02 | Training |
| D08-TRAIN-03 | Q07 | QA-2026-01 | TRAINING EXAMPLE · ar | «طيب أكتب لكم إن عندي حساسية من…» — the participant tried to write a medical detail and looked for a text box. The moderator stopped the disclosure (detail not recorded). | Comfort + legal (Art. 16 risk) | 4 | **No free-text field (unchanged).** Add a reassurance line: AR «لا تكتب تفاصيل هنا؛ سيتواصل معك فريقنا بشكل خاص، ويمكنه ربطك بالمكان مباشرة.» · EN "Please don't write details here — our team will contact you privately and can put you in touch with the venue directly." | Keeps Q07 a P4 request flag only; supports Option A in the legal memo (§1.1.3). | Accept, **conditional on counsel's O04 answer**. Legal reviewer must sign before release. | Product owner + Legal reviewer | QA-2026-02 (blocked until O04) | Training |
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

# Appendix A — Full source (copy-paste ready)

Each block below is the exact file that was executed in §0.4.

## A.1 Database migration

### `qatar/db/migrations/001_init.sql`

```sql
-- =====================================================================================
-- 001_init.sql — Qatar social-dining platform, initial schema (v0.4)
-- Source of truth: Qatar_Phase2_Completion_v0.3 §2 (data dictionary).
-- Target: PostgreSQL 15+ (gen_random_uuid() is built in since PG13).
-- Run inside a transaction:   psql -v ON_ERROR_STOP=1 -1 -f 001_init.sql
-- Business rules enforced here: table size 4–6, one conversation language per session,
-- no date of birth stored, append-only consent & audit ledgers, immutable published
-- questionnaires, atomic seat hold, refund total never exceeds the payment.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS app;
SET search_path = app, public;

-- ---------------------------------------------------------------- enums
CREATE TYPE user_status        AS ENUM ('active','suspended','banned','deletion_requested','deleted');
CREATE TYPE consent_type       AS ENUM ('terms','conduct','privacy_notice','marketing','contact_after_event','special_data');
CREATE TYPE client_source      AS ENUM ('app_web','app_ios','app_android','admin');
CREATE TYPE qv_status          AS ENUM ('draft','review','published','retired');
CREATE TYPE question_scope     AS ENUM ('profile','booking');
CREATE TYPE answer_type        AS ENUM ('single','multi','tier','contact_request');
CREATE TYPE matching_use       AS ENUM ('hard_constraint','soft_factor','event_prep','ops_only','none');
CREATE TYPE privacy_class      AS ENUM ('P0','P1','P2','P3','P4');
CREATE TYPE response_status    AS ENUM ('draft','submitted','superseded');
CREATE TYPE venue_type         AS ENUM ('cafe','restaurant');
CREATE TYPE experience_type    AS ENUM ('coffee','dinner');
CREATE TYPE contract_status    AS ENUM ('prospect','offer_received','signed','paused','terminated');
CREATE TYPE session_status     AS ENUM ('draft','on_sale','sold_out','locked','in_progress','completed','cancelled');
CREATE TYPE table_status       AS ENUM ('planned','forming','locked','cancelled_quorum','cancelled_venue','completed');
CREATE TYPE booking_status     AS ENUM ('payment_pending','paid_awaiting_group','group_locked','revealed','checked_in',
                                        'completed','waitlisted','cancelled_by_user','cancelled_by_organizer',
                                        'payment_failed','expired');
CREATE TYPE cancel_actor       AS ENUM ('user','organizer','system');
CREATE TYPE waitlist_status    AS ENUM ('waiting','offered','accepted','expired','left');
CREATE TYPE matching_mode      AS ENUM ('dry_run','published');
CREATE TYPE payment_status     AS ENUM ('created','requires_action','processing','succeeded','failed','cancelled',
                                        'expired','partially_refunded','refunded','disputed');
CREATE TYPE payment_failure    AS ENUM ('declined','insufficient_funds','3ds_failed','expired_card','timeout','other');
CREATE TYPE refund_status      AS ENUM ('requested','processing','refunded','failed');
CREATE TYPE refund_reason      AS ENUM ('user_cancel_in_window','organizer_cancel','seat_unavailable','duplicate_charge',
                                        'goodwill','dispute');
CREATE TYPE report_category    AS ENUM ('harassment','threat_violence','photo_without_consent','stalking_unwanted_contact',
                                        'fraud','disruptive');
CREATE TYPE report_timing      AS ENUM ('during','after');
CREATE TYPE report_status      AS ENUM ('new','triaged','investigating','actioned','closed_no_action','appealed','closed');
CREATE TYPE report_action_type AS ENUM ('interim_block','temporary_suspension','warning','suspension','ban','no_action',
                                        'referral_authorities','appeal_upheld','appeal_rejected');
CREATE TYPE block_source       AS ENUM ('user','safety_case');
CREATE TYPE admin_role         AS ENUM ('owner','ops','finance','trust_safety','analyst','researcher','developer');
CREATE TYPE admin_status       AS ENUM ('active','disabled');
CREATE TYPE notify_channel     AS ENUM ('push','sms','email','in_app');
CREATE TYPE notify_status      AS ENUM ('queued','sent','failed','cancelled');
CREATE TYPE support_case_type  AS ENUM ('practical_arrangement_Q07','payment','refund','general');
CREATE TYPE support_case_status AS ENUM ('new','in_progress','waiting_user','resolved','closed');
CREATE TYPE legal_doc_type     AS ENUM ('terms','conduct','privacy','marketing','cancellation');

-- ---------------------------------------------------------------- shared trigger: updated_at
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- append-only guard (consent ledger, audit log)
CREATE FUNCTION forbid_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY: % rows cannot be updated or deleted', TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$;

-- ================================================================ reference & admin
CREATE TABLE cities (
  id          varchar(10) PRIMARY KEY,
  name_ar     varchar(60) NOT NULL,
  name_en     varchar(60) NOT NULL,
  timezone    varchar(40) NOT NULL DEFAULT 'Asia/Qatar',
  is_active   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE legal_documents (
  version       varchar(20) PRIMARY KEY,
  type          legal_doc_type NOT NULL,
  text_ar       text NOT NULL,
  text_en       text NOT NULL,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(254) NOT NULL UNIQUE,
  name          varchar(80)  NOT NULL,
  role          admin_role   NOT NULL,
  mfa_enabled   boolean      NOT NULL DEFAULT false,
  status        admin_status NOT NULL DEFAULT 'active',
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_active_requires_mfa CHECK (status <> 'active' OR mfa_enabled)
);

-- ================================================================ identity & consent
CREATE TABLE users (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164_enc               bytea        NOT NULL,              -- AES-256-GCM ciphertext (app-side, KMS key)
  phone_lookup_hash            char(64)     NOT NULL UNIQUE,       -- HMAC-SHA256(phone, pepper), hex
  display_name                 varchar(30),
  locale                       varchar(2)   NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  age_eligibility_confirmed_at timestamptz,                        -- attestation only; NO date of birth column
  status                       user_status  NOT NULL DEFAULT 'active',
  registration_completed_at    timestamptz,
  last_login_at                timestamptz,
  deleted_at                   timestamptz,
  created_at                   timestamptz  NOT NULL DEFAULT now(),
  updated_at                   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT users_display_name_chars CHECK (display_name IS NULL OR display_name ~ '^[[:alpha:] \-]{1,30}$'),
  CONSTRAINT users_hash_hex CHECK (phone_lookup_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT users_registration_needs_age CHECK (registration_completed_at IS NULL OR age_eligibility_confirmed_at IS NOT NULL)
);

CREATE TABLE user_consents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  consent_type     consent_type NOT NULL,
  document_version varchar(20)  NOT NULL REFERENCES legal_documents(version),
  granted          boolean      NOT NULL,
  recorded_at      timestamptz  NOT NULL DEFAULT now(),
  source           client_source NOT NULL,
  ip_trunc         inet,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX user_consents_latest ON user_consents (user_id, consent_type, recorded_at DESC);
CREATE TRIGGER user_consents_append_only BEFORE UPDATE OR DELETE ON user_consents
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE VIEW current_consents AS
SELECT DISTINCT ON (user_id, consent_type) user_id, consent_type, document_version, granted, recorded_at
FROM user_consents ORDER BY user_id, consent_type, recorded_at DESC, created_at DESC;

CREATE TABLE otp_challenges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_lookup_hash char(64)    NOT NULL,
  code_hash         char(60)    NOT NULL,                  -- bcrypt
  attempts          smallint    NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  request_ip_trunc  inet,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_expiry_after_create CHECK (expires_at > created_at)
);
CREATE INDEX otp_by_phone_recent ON otp_challenges (phone_lookup_hash, created_at DESC);

-- ================================================================ questionnaire (versioned)
CREATE TABLE questionnaire_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(20) NOT NULL UNIQUE,
  status         qv_status   NOT NULL DEFAULT 'draft',
  published_at   timestamptz,
  retired_at     timestamptz,
  approved_by    uuid REFERENCES admin_users(id),
  change_log_ref varchar(50),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qv_published_needs_approval CHECK (status NOT IN ('published','retired') OR (approved_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT qv_retired_needs_ts CHECK (status <> 'retired' OR retired_at IS NOT NULL)
);
-- exactly one published version at a time
CREATE UNIQUE INDEX qv_one_published ON questionnaire_versions ((true)) WHERE status = 'published';

CREATE TABLE questions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_version_id uuid NOT NULL REFERENCES questionnaire_versions(id) ON DELETE CASCADE,
  key                      varchar(10)    NOT NULL CHECK (key ~ '^Q[0-9]{2}$'),
  scope                    question_scope NOT NULL,
  text_ar                  text NOT NULL,
  text_en                  text NOT NULL,
  purpose_ar               text NOT NULL,
  purpose_en               text NOT NULL,
  answer_type              answer_type    NOT NULL,
  max_selections           smallint CHECK (max_selections IS NULL OR max_selections >= 1),
  is_required              boolean NOT NULL DEFAULT false,
  matching_use             matching_use   NOT NULL,
  data_class               privacy_class  NOT NULL DEFAULT 'P2',
  sort_order               smallint NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (questionnaire_version_id, key),
  CONSTRAINT q07_is_restricted CHECK (key <> 'Q07' OR data_class = 'P4')
);

CREATE TABLE question_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  key          varchar(30)  NOT NULL,
  label_ar     varchar(120) NOT NULL,
  label_en     varchar(120) NOT NULL,
  is_exclusive boolean NOT NULL DEFAULT false,
  maps_to      jsonb,
  sort_order   smallint NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, key)
);

-- Published versions are immutable: only the transition published -> retired (+retired_at) is allowed,
-- and questions/options of a published or retired version cannot be inserted, changed or removed.
CREATE FUNCTION guard_published_questionnaire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('published','retired') THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_IMMUTABLE: version % is %', OLD.code, OLD.status USING ERRCODE = 'P0002';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('published','retired') THEN
    IF OLD.status = 'published' AND NEW.status = 'retired'
       AND NEW.code = OLD.code AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
       AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
       AND NEW.change_log_ref IS NOT DISTINCT FROM OLD.change_log_ref THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'QUESTIONNAIRE_IMMUTABLE: version % is %', OLD.code, OLD.status USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER qv_immutable BEFORE UPDATE OR DELETE ON questionnaire_versions
  FOR EACH ROW EXECUTE FUNCTION guard_published_questionnaire();

CREATE FUNCTION guard_question_children() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status qv_status; v_qid uuid;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    SELECT status INTO v_status FROM questionnaire_versions
     WHERE id = COALESCE(NEW.questionnaire_version_id, OLD.questionnaire_version_id);
  ELSE
    v_qid := COALESCE(NEW.question_id, OLD.question_id);
    SELECT qv.status INTO v_status FROM questions q JOIN questionnaire_versions qv ON qv.id = q.questionnaire_version_id
     WHERE q.id = v_qid;
  END IF;
  IF v_status IN ('published','retired') THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_IMMUTABLE: % of a % version cannot change', TG_TABLE_NAME, v_status USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER questions_immutable BEFORE INSERT OR UPDATE OR DELETE ON questions
  FOR EACH ROW EXECUTE FUNCTION guard_question_children();
CREATE TRIGGER question_options_immutable BEFORE INSERT OR UPDATE OR DELETE ON question_options
  FOR EACH ROW EXECUTE FUNCTION guard_question_children();

CREATE TABLE questionnaire_responses (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id),
  questionnaire_version_id uuid NOT NULL REFERENCES questionnaire_versions(id),
  status                   response_status NOT NULL DEFAULT 'draft',
  submitted_at             timestamptz,
  completeness_required    smallint NOT NULL DEFAULT 0 CHECK (completeness_required >= 0),
  completeness_optional    smallint NOT NULL DEFAULT 0 CHECK (completeness_optional >= 0),
  idempotency_key          varchar(64),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_submitted_ts CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);
CREATE UNIQUE INDEX qr_one_submitted_per_user ON questionnaire_responses (user_id) WHERE status = 'submitted';
CREATE UNIQUE INDEX qr_one_draft_per_version  ON questionnaire_responses (user_id, questionnaire_version_id) WHERE status = 'draft';
CREATE UNIQUE INDEX qr_idempotency            ON questionnaire_responses (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE answers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES questionnaire_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  option_id   uuid NOT NULL REFERENCES question_options(id),
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id, option_id)
);
-- option must belong to the question it answers
CREATE FUNCTION check_answer_option() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM question_options WHERE id = NEW.option_id AND question_id = NEW.question_id) THEN
    RAISE EXCEPTION 'OPTION_NOT_IN_QUESTION' USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answers_option_matches BEFORE INSERT OR UPDATE ON answers
  FOR EACH ROW EXECUTE FUNCTION check_answer_option();

-- ================================================================ venues, pricing, policy
CREATE TABLE budget_tiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id         varchar(10) NOT NULL REFERENCES cities(id),
  rank            smallint    NOT NULL CHECK (rank >= 1),
  max_spend_minor integer     CHECK (max_spend_minor IS NULL OR max_spend_minor > 0),  -- NULL = open
  label_ar        varchar(60) NOT NULL,
  label_en        varchar(60) NOT NULL,
  status          varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, rank)
);

CREATE TABLE venues (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id                   varchar(10) NOT NULL REFERENCES cities(id),
  name                      varchar(120) NOT NULL,
  district_ar               varchar(60) NOT NULL,
  district_en               varchar(60) NOT NULL,
  address_line              varchar(200) NOT NULL,
  lat                       numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                       numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  google_place_id           varchar(100),
  venue_type                venue_type NOT NULL,
  supported_experiences     experience_type[] NOT NULL CHECK (cardinality(supported_experiences) >= 1),
  total_bookable_tables     smallint NOT NULL CHECK (total_bookable_tables >= 1),
  seats_per_table_max       smallint NOT NULL CHECK (seats_per_table_max >= 6),
  price_band_min_minor      integer  NOT NULL CHECK (price_band_min_minor >= 0),
  price_band_max_minor      integer  NOT NULL,
  budget_tier_id            uuid NOT NULL REFERENCES budget_tiers(id),
  noise_level               smallint NOT NULL CHECK (noise_level BETWEEN 1 AND 3),
  accessibility             jsonb NOT NULL DEFAULT '{}'::jsonb,
  separate_bills_confirmed  boolean NOT NULL DEFAULT false,
  min_spend_policy          varchar(200) NOT NULL,
  arrival_instructions_ar   text NOT NULL,
  arrival_instructions_en   text NOT NULL,
  contract_status           contract_status NOT NULL DEFAULT 'prospect',
  contract_expires_on       date,
  is_active                 boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_price_band CHECK (price_band_max_minor >= price_band_min_minor),
  -- a venue can only be signed (and therefore assigned) with separate bills and written min-spend terms (F06, A06)
  CONSTRAINT venue_signed_requirements CHECK (contract_status <> 'signed' OR (separate_bills_confirmed AND length(trim(min_spend_policy)) > 0)),
  CONSTRAINT venue_active_requires_signed CHECK (NOT is_active OR contract_status = 'signed')
);
CREATE INDEX venues_assignable ON venues (city_id, budget_tier_id) WHERE is_active;

CREATE TABLE venue_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name              varchar(80) NOT NULL,
  phone_e164_enc    bytea NOT NULL,
  role              varchar(40),
  is_day_of_contact boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id           varchar(10) NOT NULL REFERENCES cities(id),
  experience        experience_type NOT NULL,
  service_fee_minor integer NOT NULL CHECK (service_fee_minor > 0),
  currency          char(3) NOT NULL DEFAULT 'QAR' CHECK (currency = 'QAR'),
  valid_from        timestamptz NOT NULL,
  valid_to          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_window CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE cancellation_policies (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                     varchar(20) NOT NULL UNIQUE,
  full_refund_until_hours     smallint NOT NULL CHECK (full_refund_until_hours BETWEEN 0 AND 720),
  late_cancel_refund_pct      smallint NOT NULL CHECK (late_cancel_refund_pct BETWEEN 0 AND 100),
  organizer_cancel_refund_pct smallint NOT NULL DEFAULT 100 CHECK (organizer_cancel_refund_pct = 100),
  no_show_fee_pct             smallint NOT NULL DEFAULT 0 CHECK (no_show_fee_pct = 0),   -- non-punitive by design (v0.3, F11)
  text_ar                     text NOT NULL,
  text_en                     text NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ================================================================ sessions, tables, bookings
CREATE TABLE event_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id                varchar(10) NOT NULL REFERENCES cities(id),
  experience             experience_type NOT NULL,
  conversation_language  char(2) NOT NULL CHECK (conversation_language IN ('ar','en')),   -- one language per session (F04)
  starts_at              timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL,
  district_hint_ar       varchar(60) NOT NULL,
  district_hint_en       varchar(60) NOT NULL,
  price_plan_id          uuid NOT NULL REFERENCES price_plans(id),
  cancellation_policy_id uuid NOT NULL REFERENCES cancellation_policies(id),
  max_seats              smallint NOT NULL CHECK (max_seats >= 4),
  seats_sold             smallint NOT NULL DEFAULT 0,
  booking_opens_at       timestamptz NOT NULL,
  booking_closes_at      timestamptz NOT NULL,
  lock_at                timestamptz NOT NULL,
  reveal_at              timestamptz NOT NULL,
  check_in_opens_at      timestamptz NOT NULL,
  status                 session_status NOT NULL DEFAULT 'draft',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_seats CHECK (seats_sold BETWEEN 0 AND max_seats),
  CONSTRAINT session_window CHECK (ends_at > starts_at AND booking_opens_at < booking_closes_at
                                   AND booking_closes_at <= starts_at AND lock_at <= reveal_at
                                   AND reveal_at <= starts_at AND check_in_opens_at <= starts_at)
);
CREATE INDEX sessions_on_sale ON event_sessions (city_id, starts_at) WHERE status = 'on_sale';

CREATE TABLE event_tables (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  venue_id           uuid REFERENCES venues(id),
  table_code         varchar(10) NOT NULL,
  capacity           smallint NOT NULL DEFAULT 6 CHECK (capacity BETWEEN 4 AND 6),
  min_quorum         smallint NOT NULL DEFAULT 4 CHECK (min_quorum = 4),
  confirmed_count    smallint NOT NULL DEFAULT 0,
  status             table_status NOT NULL DEFAULT 'planned',
  venue_confirmed_at timestamptz,
  locked_at          timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      varchar(40) CHECK (cancel_reason IS NULL OR cancel_reason IN ('below_quorum','venue_unavailable','safety','force_majeure')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, table_code),
  CONSTRAINT table_count CHECK (confirmed_count BETWEEN 0 AND capacity),
  CONSTRAINT table_lock_quorum CHECK (status <> 'locked' OR (confirmed_count >= min_quorum AND venue_id IS NOT NULL AND locked_at IS NOT NULL)),
  CONSTRAINT table_cancel_reason CHECK (status NOT IN ('cancelled_quorum','cancelled_venue') OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
);

CREATE TABLE bookings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref                 varchar(12) NOT NULL UNIQUE CHECK (booking_ref ~ '^RT-[A-HJ-NP-Z2-9]{6}$'),
  user_id                     uuid NOT NULL REFERENCES users(id),      -- always from the JWT, never the request body
  session_id                  uuid NOT NULL REFERENCES event_sessions(id),
  alternate_session_ids       uuid[] NOT NULL DEFAULT '{}',
  conversation_language       char(2) NOT NULL CHECK (conversation_language IN ('ar','en')),
  budget_tier_id              uuid NOT NULL REFERENCES budget_tiers(id),
  questionnaire_response_id   uuid NOT NULL REFERENCES questionnaire_responses(id),
  status                      booking_status NOT NULL DEFAULT 'payment_pending',
  hold_expires_at             timestamptz,
  price_minor                 integer NOT NULL CHECK (price_minor > 0),
  currency                    char(3) NOT NULL DEFAULT 'QAR' CHECK (currency = 'QAR'),
  cancellation_policy_version varchar(20) NOT NULL REFERENCES cancellation_policies(version),
  cancelled_at                timestamptz,
  cancel_actor                cancel_actor,
  cancel_reason_code          varchar(30),
  checked_in_at               timestamptz,
  no_show                     boolean,
  idempotency_key             varchar(64),
  rebooked_from_booking_id    uuid UNIQUE REFERENCES bookings(id),   -- v0.4 addition: SCR-08b "ننقل رسمك كما هو" fee transfer
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_hold CHECK (status <> 'payment_pending' OR hold_expires_at IS NOT NULL),
  CONSTRAINT booking_cancel_fields CHECK (status NOT IN ('cancelled_by_user','cancelled_by_organizer') OR (cancelled_at IS NOT NULL AND cancel_actor IS NOT NULL)),
  CONSTRAINT booking_alt_not_primary CHECK (NOT (session_id = ANY (alternate_session_ids)))
);
-- one active booking per user per session
CREATE UNIQUE INDEX bookings_one_active_per_session ON bookings (user_id, session_id)
  WHERE status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed');
CREATE UNIQUE INDEX bookings_idempotency ON bookings (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX bookings_session_status ON bookings (session_id, status);
CREATE INDEX bookings_hold_expiry ON bookings (hold_expires_at) WHERE status = 'payment_pending';

CREATE TABLE matching_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES event_sessions(id),
  mode                     matching_mode NOT NULL,
  rule_version             varchar(20) NOT NULL,
  questionnaire_version_id uuid NOT NULL REFERENCES questionnaire_versions(id),
  algorithm                varchar(20) NOT NULL CHECK (algorithm IN ('baseline_random','interest_opt_v1')),
  seed                     bigint NOT NULL,
  inputs_hash              char(64) NOT NULL,
  result_summary           jsonb NOT NULL,
  explanations             jsonb,
  run_by                   uuid REFERENCES admin_users(id),        -- NULL = system job
  published_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT run_published_ts CHECK (mode <> 'published' OR published_at IS NOT NULL)
);

CREATE TABLE table_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id),
  table_id        uuid NOT NULL REFERENCES event_tables(id),
  matching_run_id uuid NOT NULL REFERENCES matching_runs(id),
  is_current      boolean NOT NULL DEFAULT true,
  member_score    numeric(5,4) CHECK (member_score IS NULL OR member_score BETWEEN 0 AND 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assignments_one_current_per_booking ON table_assignments (booking_id) WHERE is_current;
CREATE INDEX assignments_by_table ON table_assignments (table_id) WHERE is_current;

CREATE TABLE waitlist_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  session_id       uuid NOT NULL REFERENCES event_sessions(id),
  position         integer NOT NULL CHECK (position >= 1),
  status           waitlist_status NOT NULL DEFAULT 'waiting',
  offer_expires_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_offer_ts CHECK (status <> 'offered' OR offer_expires_at IS NOT NULL)
);
CREATE UNIQUE INDEX waitlist_one_open ON waitlist_entries (user_id, session_id) WHERE status IN ('waiting','offered');

-- ================================================================ payments & refunds
CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL REFERENCES bookings(id),
  user_id               uuid NOT NULL REFERENCES users(id),
  psp                   varchar(30) NOT NULL,
  psp_payment_intent_id varchar(100) NOT NULL UNIQUE,
  amount_minor          integer NOT NULL CHECK (amount_minor > 0),
  currency              char(3) NOT NULL DEFAULT 'QAR' CHECK (currency = 'QAR'),
  status                payment_status NOT NULL DEFAULT 'created',
  failure_code          payment_failure,
  method_brand          varchar(20),
  card_last4            char(4) CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  idempotency_key       varchar(64) NOT NULL UNIQUE,
  succeeded_at          timestamptz,
  fee_minor             integer CHECK (fee_minor IS NULL OR fee_minor >= 0),
  reconciled_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_failed_code CHECK (status <> 'failed' OR failure_code IS NOT NULL),
  CONSTRAINT payment_success_ts CHECK (status NOT IN ('succeeded','partially_refunded','refunded') OR succeeded_at IS NOT NULL)
);
CREATE INDEX payments_by_booking ON payments (booking_id);
-- at most one successful (or later-refunded) payment per booking: duplicates must be refunded, never kept
CREATE UNIQUE INDEX payments_one_success_per_booking ON payments (booking_id)
  WHERE status IN ('succeeded','partially_refunded','refunded','disputed');

CREATE TABLE refunds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid NOT NULL REFERENCES payments(id),
  booking_id      uuid NOT NULL REFERENCES bookings(id),
  amount_minor    integer NOT NULL CHECK (amount_minor > 0),
  reason          refund_reason NOT NULL,
  status          refund_status NOT NULL DEFAULT 'requested',
  psp_refund_id   varchar(100) UNIQUE,
  initiated_by    uuid REFERENCES admin_users(id),     -- NULL = system policy refund
  approved_by     uuid REFERENCES admin_users(id),
  idempotency_key varchar(64) NOT NULL UNIQUE,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- maker-checker for discretionary refunds
  CONSTRAINT refund_manual_needs_checker CHECK (reason NOT IN ('goodwill','dispute') OR (initiated_by IS NOT NULL AND approved_by IS NOT NULL AND approved_by <> initiated_by)),
  CONSTRAINT refund_done_ts CHECK (status <> 'refunded' OR completed_at IS NOT NULL)
);
CREATE INDEX refunds_by_payment ON refunds (payment_id);

-- total of live refunds never exceeds the captured payment (R07)
CREATE FUNCTION check_refund_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_paid integer; v_refunded integer;
BEGIN
  SELECT amount_minor INTO v_paid FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT COALESCE(sum(amount_minor),0) INTO v_refunded FROM refunds
   WHERE payment_id = NEW.payment_id AND status IN ('requested','processing','refunded') AND id <> NEW.id;
  IF NEW.status IN ('requested','processing','refunded') AND v_refunded + NEW.amount_minor > v_paid THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAYMENT: % + % > %', v_refunded, NEW.amount_minor, v_paid USING ERRCODE = 'P0004';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refunds_total_guard BEFORE INSERT OR UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION check_refund_total();

CREATE TABLE payment_webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  psp              varchar(30) NOT NULL,
  psp_event_id     varchar(100) NOT NULL,
  event_type       varchar(60) NOT NULL,
  signature_valid  boolean NOT NULL,
  payload          jsonb NOT NULL,
  processed_at     timestamptz,
  processing_error text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (psp, psp_event_id)
);
CREATE INDEX webhooks_unprocessed ON payment_webhook_events (created_at) WHERE processed_at IS NULL;

-- ================================================================ feedback, connections, safety
CREATE TABLE event_feedback (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid NOT NULL UNIQUE REFERENCES bookings(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  table_id         uuid NOT NULL REFERENCES event_tables(id),
  venue_id         uuid NOT NULL REFERENCES venues(id),
  overall_rating   smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  comfort_rating   smallint NOT NULL CHECK (comfort_rating BETWEEN 1 AND 5),
  venue_rating     smallint CHECK (venue_rating BETWEEN 1 AND 5),
  would_book_again boolean,
  comment_private  varchar(500),
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE MATERIALIZED VIEW venue_scores AS
SELECT venue_id,
       count(*)                                   AS n,
       round(avg(venue_rating)::numeric, 2)        AS avg_venue_rating,
       round(avg(comfort_rating)::numeric, 2)      AS avg_comfort,
       count(*) FILTER (WHERE submitted_at > now() - interval '90 days') AS last_90d_n
FROM event_feedback GROUP BY venue_id;
CREATE UNIQUE INDEX venue_scores_pk ON venue_scores (venue_id);

CREATE TABLE connection_consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     uuid NOT NULL REFERENCES event_tables(id),
  from_user_id uuid NOT NULL REFERENCES users(id),
  to_user_id   uuid NOT NULL REFERENCES users(id),
  choice       boolean NOT NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, from_user_id, to_user_id),
  CONSTRAINT connection_not_self CHECK (from_user_id <> to_user_id)
);
CREATE VIEW mutual_connections AS
SELECT a.table_id, a.from_user_id AS user_a, a.to_user_id AS user_b
FROM connection_consents a JOIN connection_consents b
  ON b.table_id = a.table_id AND b.from_user_id = a.to_user_id AND b.to_user_id = a.from_user_id
WHERE a.choice AND b.choice AND a.from_user_id < a.to_user_id;

CREATE TABLE safety_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref         varchar(14) NOT NULL UNIQUE CHECK (case_ref ~ '^TS-[0-9]{4}-[0-9]{4}$'),
  reporter_user_id uuid NOT NULL REFERENCES users(id),
  reported_user_id uuid REFERENCES users(id),
  booking_id       uuid REFERENCES bookings(id),
  table_id         uuid REFERENCES event_tables(id),
  category         report_category NOT NULL,
  timing           report_timing   NOT NULL,
  immediate_danger boolean NOT NULL DEFAULT false,
  description_enc  bytea,                                   -- encrypted app-side (P4)
  severity         smallint CHECK (severity BETWEEN 1 AND 4),
  status           report_status NOT NULL DEFAULT 'new',
  assigned_to      uuid REFERENCES admin_users(id),
  sla_due_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_not_self CHECK (reported_user_id IS NULL OR reported_user_id <> reporter_user_id),
  CONSTRAINT report_danger_is_s1 CHECK (NOT immediate_danger OR severity IS NULL OR severity = 1)
);
CREATE SEQUENCE safety_case_seq;

CREATE TABLE report_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid NOT NULL REFERENCES safety_reports(id),
  action           report_action_type NOT NULL,
  actor_id         uuid REFERENCES admin_users(id),         -- NULL = automatic interim action
  second_approver  uuid REFERENCES admin_users(id),
  effective_from   timestamptz NOT NULL DEFAULT now(),
  effective_to     timestamptz,
  rationale_enc    bytea,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ban_needs_second_approver CHECK (action <> 'ban' OR (actor_id IS NOT NULL AND second_approver IS NOT NULL AND second_approver <> actor_id)),
  CONSTRAINT appeal_needs_reviewer CHECK (action NOT IN ('appeal_upheld','appeal_rejected') OR actor_id IS NOT NULL)
);

CREATE TABLE user_blocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id uuid NOT NULL REFERENCES users(id),
  blocked_user_id uuid NOT NULL REFERENCES users(id),
  source          block_source NOT NULL,
  report_id       uuid REFERENCES safety_reports(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_user_id, blocked_user_id),
  CONSTRAINT block_not_self CHECK (blocker_user_id <> blocked_user_id),
  CONSTRAINT block_case_link CHECK (source <> 'safety_case' OR report_id IS NOT NULL)
);
-- matching reads blocks as mutual
CREATE VIEW blocked_pairs AS
SELECT LEAST(blocker_user_id, blocked_user_id) AS user_a, GREATEST(blocker_user_id, blocked_user_id) AS user_b
FROM user_blocks GROUP BY 1, 2;

-- ================================================================ audit, notifications, support
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES admin_users(id),               -- NULL = system
  action      varchar(60) NOT NULL,                         -- e.g. 'read_p4', 'refund_create', 'table_cancel'
  entity      varchar(60) NOT NULL,
  entity_id   uuid,
  reason_code varchar(40),
  before_hash char(64),
  after_hash  char(64),
  ip_trunc    inet,
  at          timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p4_read_needs_reason CHECK (action <> 'read_p4' OR (actor_id IS NOT NULL AND reason_code IS NOT NULL))
);
CREATE INDEX audit_by_entity ON audit_logs (entity, entity_id, at DESC);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TABLE notifications_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  channel      notify_channel NOT NULL,
  template_key varchar(40) NOT NULL,
  locale       varchar(2) NOT NULL CHECK (locale IN ('ar','en')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  send_after   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  status       notify_status NOT NULL DEFAULT 'queued',
  provider_ref varchar(100),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_due ON notifications_outbox (send_after) WHERE status = 'queued';

CREATE TABLE support_cases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  booking_id   uuid REFERENCES bookings(id),
  type         support_case_type NOT NULL,
  status       support_case_status NOT NULL DEFAULT 'new',
  assigned_to  uuid REFERENCES admin_users(id),
  notes_enc    bytea,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ================================================================ updated_at triggers (every table with the column)
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
           WHERE c.table_schema = 'app' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
             AND c.table_name NOT IN ('user_consents','audit_logs')
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()',
                   t.table_name || '_updated_at', t.table_name);
  END LOOP;
END $$;

-- ================================================================ functions: booking ref, seat hold, holds release, table counts
CREATE FUNCTION gen_booking_ref() RETURNS varchar LANGUAGE plpgsql AS $$
DECLARE alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r text;
BEGIN
  LOOP
    r := 'RT-';
    FOR i IN 1..6 LOOP r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM bookings WHERE booking_ref = r);
  END LOOP;
  RETURN r;
END $$;

-- Atomic seat hold (v0.3 §2.29). Raises SQLSTATE 'P0010' SESSION_FULL, 'P0011' SESSION_NOT_ON_SALE,
-- 'P0012' ALREADY_BOOKED. Idempotent per (user, idempotency_key): a replay returns the existing booking.
CREATE FUNCTION hold_seat(p_user_id uuid, p_session_id uuid, p_budget_tier_id uuid, p_response_id uuid,
                          p_alternates uuid[] DEFAULT '{}', p_idempotency_key varchar DEFAULT NULL,
                          p_hold_minutes integer DEFAULT 10)
RETURNS bookings LANGUAGE plpgsql AS $$
DECLARE s event_sessions; b bookings; v_price integer; v_policy varchar;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO b FROM bookings WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN b; END IF;
  END IF;

  SELECT * INTO s FROM event_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.status <> 'on_sale' OR now() NOT BETWEEN s.booking_opens_at AND s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings WHERE user_id = p_user_id AND session_id = p_session_id
             AND status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed')) THEN
    RAISE EXCEPTION 'ALREADY_BOOKED' USING ERRCODE = 'P0012';
  END IF;

  UPDATE event_sessions SET seats_sold = seats_sold + 1
   WHERE id = p_session_id AND status = 'on_sale' AND seats_sold < max_seats;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010';
  END IF;

  SELECT pp.service_fee_minor, cp.version INTO v_price, v_policy
    FROM price_plans pp, cancellation_policies cp
   WHERE pp.id = s.price_plan_id AND cp.id = s.cancellation_policy_id;

  INSERT INTO bookings (booking_ref, user_id, session_id, alternate_session_ids, conversation_language,
                        budget_tier_id, questionnaire_response_id, status, hold_expires_at, price_minor,
                        cancellation_policy_version, idempotency_key)
  VALUES (gen_booking_ref(), p_user_id, p_session_id, COALESCE(p_alternates,'{}'), s.conversation_language,
          p_budget_tier_id, p_response_id, 'payment_pending', now() + make_interval(mins => p_hold_minutes),
          v_price, v_policy, p_idempotency_key)
  RETURNING * INTO b;

  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_session_id AND seats_sold = max_seats;
  RETURN b;
END $$;

-- Releases expired holds; each release gives the seat back in the same transaction. Returns rows released.
CREATE FUNCTION release_expired_holds() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id, session_id FROM bookings
           WHERE status = 'payment_pending' AND hold_expires_at < now()
           FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = r.id;
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = r.session_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Cancelling a booking frees its session seat (user or organizer cancellation), keeping seats_sold exact.
CREATE FUNCTION release_seat_on_cancel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('cancelled_by_user','cancelled_by_organizer','payment_failed')
     AND OLD.status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed') THEN
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_release_seat AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION release_seat_on_cancel();

-- Keeps event_tables.confirmed_count = current assignments whose booking is paid and not cancelled.
CREATE FUNCTION refresh_table_count(p_table_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE event_tables t SET confirmed_count = (
    SELECT count(*) FROM table_assignments a JOIN bookings b ON b.id = a.booking_id
     WHERE a.table_id = t.id AND a.is_current
       AND b.status IN ('paid_awaiting_group','group_locked','revealed','checked_in','completed'))
  WHERE t.id = p_table_id;
$$;

CREATE FUNCTION on_assignment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM refresh_table_count(OLD.table_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM refresh_table_count(NEW.table_id); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER assignments_count AFTER INSERT OR UPDATE OR DELETE ON table_assignments
  FOR EACH ROW EXECUTE FUNCTION on_assignment_change();

CREATE FUNCTION on_booking_status_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t uuid;
BEGIN
  SELECT table_id INTO t FROM table_assignments WHERE booking_id = NEW.id AND is_current;
  IF t IS NOT NULL THEN PERFORM refresh_table_count(t); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER bookings_status_count AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION on_booking_status_count();

-- Safety case reference TS-YYYY-NNNN
CREATE FUNCTION next_case_ref() RETURNS varchar LANGUAGE sql AS $$
  SELECT 'TS-' || to_char(now() AT TIME ZONE 'Asia/Qatar', 'YYYY') || '-' || lpad(nextval('app.safety_case_seq')::text, 4, '0');
$$;

-- ================================================================ ops functions (v0.4, used by Runbook A)
-- Cancels a table that missed quorum at lock_at, atomically: table -> cancelled_quorum, every paid member ->
-- cancelled_by_organizer (seat released by trigger), one QUORUM_FAIL_CHOICE per member in their locale, audit row.
-- Returns the number of bookings cancelled. Refunds are NOT created here: the member chooses rebook or refund
-- until the choice deadline; no choice => automatic full refund (see refund_unresolved_organizer_cancels).
CREATE FUNCTION cancel_table_quorum(p_table_id uuid, p_actor uuid, p_choice_hours integer DEFAULT 48)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE t event_tables; s event_sessions; n integer := 0; r record; v_deadline timestamptz;
BEGIN
  SELECT * INTO t FROM event_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'P0020'; END IF;
  IF t.status NOT IN ('planned','forming') THEN
    RAISE EXCEPTION 'TABLE_NOT_CANCELLABLE: status %', t.status USING ERRCODE = 'P0021';
  END IF;
  IF t.confirmed_count >= t.min_quorum THEN
    RAISE EXCEPTION 'TABLE_HAS_QUORUM: % confirmed', t.confirmed_count USING ERRCODE = 'P0022';
  END IF;
  SELECT * INTO s FROM event_sessions WHERE id = t.session_id;
  v_deadline := now() + make_interval(hours => p_choice_hours);

  FOR r IN SELECT b.id, b.user_id, u.locale FROM table_assignments a
             JOIN bookings b ON b.id = a.booking_id JOIN users u ON u.id = b.user_id
            WHERE a.table_id = p_table_id AND a.is_current
              AND b.status IN ('paid_awaiting_group','group_locked')
  LOOP
    UPDATE bookings SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
                        cancel_reason_code = 'below_quorum'
     WHERE id = r.id;
    INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
    VALUES (r.user_id, 'push', 'QUORUM_FAIL_CHOICE', r.locale,
            jsonb_build_object('booking_id', r.id, 'date', s.starts_at, 'deadline', v_deadline));
    n := n + 1;
  END LOOP;

  UPDATE event_tables SET status = 'cancelled_quorum', cancelled_at = now(), cancel_reason = 'below_quorum'
   WHERE id = p_table_id;
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
  VALUES (p_actor, 'table_cancel', 'event_tables', p_table_id, 'below_quorum');
  RETURN n;
END $$;

-- Member choice "rebook": moves an organizer-cancelled booking's fee to a new session (same language,
-- venue tier <= the member's cap, seat available). p_user_id comes from the JWT; ownership is enforced here.
-- Raises P0030 NOT_REBOOKABLE, P0031 LANGUAGE_CONFLICT, P0010 SESSION_FULL, P0011 SESSION_NOT_ON_SALE.
CREATE FUNCTION rebook_booking(p_booking_id uuid, p_user_id uuid, p_target_session uuid)
RETURNS bookings LANGUAGE plpgsql AS $$
DECLARE old bookings; s event_sessions; nb bookings;
BEGIN
  SELECT * INTO old FROM bookings WHERE id = p_booking_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR old.status <> 'cancelled_by_organizer' THEN
    RAISE EXCEPTION 'NOT_REBOOKABLE' USING ERRCODE = 'P0030';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE rebooked_from_booking_id = old.id)
     OR EXISTS (SELECT 1 FROM refunds WHERE booking_id = old.id AND status <> 'failed') THEN
    RAISE EXCEPTION 'NOT_REBOOKABLE: already resolved' USING ERRCODE = 'P0030';
  END IF;
  SELECT * INTO s FROM event_sessions WHERE id = p_target_session;
  IF NOT FOUND OR s.status <> 'on_sale' OR now() > s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;
  IF s.conversation_language <> old.conversation_language THEN
    RAISE EXCEPTION 'LANGUAGE_CONFLICT' USING ERRCODE = 'P0031';
  END IF;
  UPDATE event_sessions SET seats_sold = seats_sold + 1
   WHERE id = p_target_session AND status = 'on_sale' AND seats_sold < max_seats;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010'; END IF;

  INSERT INTO bookings (booking_ref, user_id, session_id, conversation_language, budget_tier_id,
                        questionnaire_response_id, status, price_minor, cancellation_policy_version,
                        idempotency_key, rebooked_from_booking_id)
  VALUES (gen_booking_ref(), old.user_id, p_target_session, old.conversation_language, old.budget_tier_id,
          old.questionnaire_response_id, 'paid_awaiting_group', old.price_minor, old.cancellation_policy_version,
          'rebook-' || old.id, old.id)
  RETURNING * INTO nb;
  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_target_session AND seats_sold = max_seats;
  RETURN nb;
END $$;

-- After the choice deadline: every organizer-cancelled booking with neither a rebook nor a live refund
-- gets a full automatic refund (reason organizer_cancel, no approval). Returns refunds created.
CREATE FUNCTION refund_unresolved_organizer_cancels(p_cancelled_before timestamptz)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT b.id AS booking_id, p.id AS payment_id, p.amount_minor
             FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.status = 'succeeded'
            WHERE b.status = 'cancelled_by_organizer' AND b.cancelled_at < p_cancelled_before
              AND NOT EXISTS (SELECT 1 FROM bookings c WHERE c.rebooked_from_booking_id = b.id)
              AND NOT EXISTS (SELECT 1 FROM refunds f WHERE f.booking_id = b.id AND f.status <> 'failed')
  LOOP
    INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
    VALUES (r.payment_id, r.booking_id, r.amount_minor, 'organizer_cancel', 'requested', 'auto-oc-' || r.booking_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Same-session move (decision-tree step 1 MERGE, or an admin manual adjust). Re-validates every hard
-- constraint; queues MOVED_TABLE; audits with a reason code. Never moves across sessions or languages.
CREATE FUNCTION move_booking_table(p_booking_id uuid, p_to_table uuid, p_actor uuid, p_reason varchar)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE b bookings; cur table_assignments; dst event_tables; v_member_rank smallint; v_venue_rank smallint; v_locale varchar;
BEGIN
  IF p_reason NOT IN ('quorum_merge','friend_request_separate','accessibility_fit','ops_balance','other') THEN
    RAISE EXCEPTION 'REASON_CODE_REQUIRED' USING ERRCODE = 'P0040';
  END IF;
  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT * INTO cur FROM table_assignments WHERE booking_id = p_booking_id AND is_current FOR UPDATE;
  SELECT * INTO dst FROM event_tables WHERE id = p_to_table FOR UPDATE;
  IF b.id IS NULL OR cur.id IS NULL OR dst.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0041'; END IF;
  IF dst.session_id <> b.session_id THEN RAISE EXCEPTION 'CROSS_SESSION_MOVE_FORBIDDEN' USING ERRCODE = 'P0042'; END IF;
  IF dst.status NOT IN ('planned','forming') THEN RAISE EXCEPTION 'TABLE_NOT_OPEN' USING ERRCODE = 'P0043'; END IF;
  IF dst.confirmed_count >= dst.capacity THEN RAISE EXCEPTION 'TABLE_FULL' USING ERRCODE = 'P0044'; END IF;
  SELECT rank INTO v_member_rank FROM budget_tiers WHERE id = b.budget_tier_id;
  SELECT bt.rank INTO v_venue_rank FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id WHERE v.id = dst.venue_id;
  IF v_venue_rank IS NOT NULL AND v_venue_rank > v_member_rank THEN
    RAISE EXCEPTION 'TIER_ABOVE_CAP' USING ERRCODE = 'P0045';
  END IF;
  IF EXISTS (SELECT 1 FROM table_assignments a JOIN bookings ob ON ob.id = a.booking_id
              JOIN user_blocks ub ON (ub.blocker_user_id = ob.user_id AND ub.blocked_user_id = b.user_id)
                                  OR (ub.blocked_user_id = ob.user_id AND ub.blocker_user_id = b.user_id)
             WHERE a.table_id = p_to_table AND a.is_current) THEN
    RAISE EXCEPTION 'BLOCKED_PAIR' USING ERRCODE = 'P0046';
  END IF;
  UPDATE table_assignments SET is_current = false WHERE id = cur.id;
  INSERT INTO table_assignments (booking_id, table_id, matching_run_id, is_current)
  VALUES (p_booking_id, p_to_table, cur.matching_run_id, true);
  SELECT locale INTO v_locale FROM users WHERE id = b.user_id;
  INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
  VALUES (b.user_id, 'push', 'MOVED_TABLE', v_locale, jsonb_build_object('booking_id', b.id));
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
  VALUES (p_actor, 'table_move', 'table_assignments', p_booking_id, p_reason);
END $$;

-- Matching input for one session as JSON (consumed by qatar/matching/publish_run.py).
-- Only pseudonymous-safe fields leave the database: ids, language, tier rank, Q05 option keys, flags.
CREATE FUNCTION matching_input(p_session uuid) RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'session_id', s.id,
    'questionnaire_version_id', (SELECT id FROM questionnaire_versions WHERE status = 'published'),
    'bookings', COALESCE((
      SELECT json_agg(json_build_object(
        'booking_id', b.id, 'user_id', b.user_id, 'session_id', b.session_id, 'status', b.status,
        'conversation_language', b.conversation_language, 'budget_tier_rank', bt.rank,
        'q05_topics', (SELECT json_agg(o.key ORDER BY o.key) FROM answers a
                         JOIN questions q ON q.id = a.question_id AND q.key = 'Q05'
                         JOIN question_options o ON o.id = a.option_id
                        WHERE a.response_id = b.questionnaire_response_id),
        'consents_current', (SELECT count(*) = 3 FROM current_consents c
                              WHERE c.user_id = b.user_id AND c.granted
                                AND c.consent_type IN ('terms','conduct','privacy_notice')),
        'age_attested', u.age_eligibility_confirmed_at IS NOT NULL,
        'account_active', u.status = 'active') ORDER BY b.id)
      FROM bookings b JOIN users u ON u.id = b.user_id JOIN budget_tiers bt ON bt.id = b.budget_tier_id
      WHERE b.session_id = s.id AND b.status = 'paid_awaiting_group'), '[]'::json),
    'blocks', COALESCE((SELECT json_agg(json_build_array(ub.blocker_user_id, ub.blocked_user_id))
                          FROM user_blocks ub), '[]'::json),
    'venues', COALESCE((SELECT json_agg(json_build_object('venue_id', v.id, 'tier_rank', bt.rank,
                                 'capacity', LEAST(v.seats_per_table_max, 6), 'tables_available', v.total_bookable_tables)
                                 ORDER BY v.id)
                          FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id
                         WHERE v.city_id = s.city_id AND v.is_active AND s.experience = ANY (v.supported_experiences)),
                       '[]'::json))
  FROM event_sessions s WHERE s.id = p_session;
$$;

-- Appeals are reviewed by someone who neither decided nor second-approved the case (v0.3 §4.4.2 step 7),
-- and a case gets one appeal decision only.
CREATE FUNCTION check_appeal_reviewer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('appeal_upheld','appeal_rejected') THEN
    IF EXISTS (SELECT 1 FROM report_actions
                WHERE report_id = NEW.report_id AND action IN ('appeal_upheld','appeal_rejected')) THEN
      RAISE EXCEPTION 'APPEAL_ALREADY_DECIDED' USING ERRCODE = 'P0050';
    END IF;
    IF EXISTS (SELECT 1 FROM report_actions
                WHERE report_id = NEW.report_id
                  AND action IN ('warning','suspension','ban','no_action','referral_authorities')
                  AND (actor_id = NEW.actor_id OR second_approver = NEW.actor_id)) THEN
      RAISE EXCEPTION 'APPEAL_REVIEWER_CONFLICT' USING ERRCODE = 'P0051';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_actions_appeal_guard BEFORE INSERT ON report_actions
  FOR EACH ROW EXECUTE FUNCTION check_appeal_reviewer();
```

## A.2 Schema behaviour checks

### `qatar/db/tests/001_init_checks.sql`

```sql
-- Behaviour checks for 001_init.sql. Run on a scratch DB after the migration:
--   psql -v ON_ERROR_STOP=1 -1 -f 001_init_checks.sql      (rolls back nothing; use a throwaway DB)
-- Every check raises if the guarded behaviour is missing; the script ends with 'ALL CHECKS PASSED'.
SET search_path = app, public;

-- minimal reference data
INSERT INTO cities (id, name_ar, name_en, is_active) VALUES ('doh', 'الدوحة', 'Doha', true);
INSERT INTO legal_documents (version, type, text_ar, text_en, published_at) VALUES ('terms-1', 'terms', 'نص', 'text', now());
INSERT INTO admin_users (id, email, name, role, mfa_enabled) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'ops@example.test',  'Ops One',  'ops', true),
  ('00000000-0000-0000-0000-00000000a002', 'fin@example.test',  'Fin One',  'finance', true),
  ('00000000-0000-0000-0000-00000000a003', 'own@example.test',  'Owner One','owner', true);
INSERT INTO budget_tiers (id, city_id, rank, max_spend_minor, label_ar, label_en, status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'doh', 1, NULL, 'الفئة 1', 'Tier 1', 'published');
INSERT INTO price_plans (id, city_id, experience, service_fee_minor, valid_from) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'doh', 'dinner', 5900, now() - interval '1 day');
INSERT INTO cancellation_policies (id, version, full_refund_until_hours, late_cancel_refund_pct, text_ar, text_en) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'cxl-1', 48, 0, 'نص', 'text');
INSERT INTO questionnaire_versions (id, code, status) VALUES ('00000000-0000-0000-0000-0000000000e1', 'QV-TEST', 'draft');

-- users (no DOB column exists — asserted below)
INSERT INTO users (id, phone_e164_enc, phone_lookup_hash, display_name, age_eligibility_confirmed_at, registration_completed_at)
SELECT ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, '\x00'::bytea,
       encode(sha256(('phone' || g)::bytea), 'hex'), 'User ' || chr(64 + g), now(), now()
FROM generate_series(1, 8) g;

INSERT INTO questionnaire_responses (id, user_id, questionnaire_version_id, status, submitted_at)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000000e1', 'submitted', now()
FROM generate_series(1, 8) g;

INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, booking_opens_at, booking_closes_at, lock_at, reveal_at, check_in_opens_at, status)
VALUES ('00000000-0000-0000-0000-0000000000f1', 'doh', 'dinner', 'ar', now() + interval '3 days', now() + interval '3 days 2 hours',
  'لوسيل', 'Lusail', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 6,
  now() - interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '2 days',
  now() + interval '3 days' - interval '30 minutes', 'on_sale');

DO $$
DECLARE b app.bookings; n int; ok boolean;
BEGIN
  -- 1. no date-of-birth column anywhere
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'app' AND (column_name ILIKE '%birth%' OR column_name ILIKE 'dob%');
  IF n <> 0 THEN RAISE EXCEPTION 'CHECK 1 failed: DOB-like column exists'; END IF;

  -- 2. hold_seat: 6 seats sell, 7th raises SESSION_FULL, session flips to sold_out
  FOR i IN 1..6 LOOP
    PERFORM app.hold_seat(('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid,
                          '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1',
                          ('00000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid, '{}', 'idem-' || i);
  END LOOP;
  IF (SELECT status FROM app.event_sessions WHERE id = '00000000-0000-0000-0000-0000000000f1') <> 'sold_out' THEN
    RAISE EXCEPTION 'CHECK 2 failed: not sold_out'; END IF;
  ok := false;
  BEGIN
    PERFORM app.hold_seat('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-0000000000f1',
                          '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000207');
  EXCEPTION WHEN SQLSTATE 'P0011' OR SQLSTATE 'P0010' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 2 failed: 7th seat was sold'; END IF;

  -- 3. idempotent replay returns the same booking, no extra seat
  b := app.hold_seat('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000f1',
                     '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000201', '{}', 'idem-1');
  SELECT count(*) INTO n FROM app.bookings WHERE user_id = '00000000-0000-0000-0000-000000000101';
  IF n <> 1 OR (SELECT seats_sold FROM app.event_sessions WHERE id = '00000000-0000-0000-0000-0000000000f1') <> 6 THEN
    RAISE EXCEPTION 'CHECK 3 failed: idempotent replay created a booking'; END IF;

  -- 4. user cancel frees a seat and reopens sale
  UPDATE app.bookings SET status = 'cancelled_by_user', cancelled_at = now(), cancel_actor = 'user'
   WHERE user_id = '00000000-0000-0000-0000-000000000106';
  IF (SELECT seats_sold || '/' || status FROM app.event_sessions WHERE id = '00000000-0000-0000-0000-0000000000f1') <> '5/on_sale' THEN
    RAISE EXCEPTION 'CHECK 4 failed: seat not released'; END IF;

  -- 5. expired holds are released by the sweeper
  UPDATE app.bookings SET hold_expires_at = now() - interval '1 minute' WHERE user_id = '00000000-0000-0000-0000-000000000105';
  IF app.release_expired_holds() <> 1 THEN RAISE EXCEPTION 'CHECK 5 failed: hold not released'; END IF;

  -- 6. table capacity CHECK 4..6
  ok := false;
  BEGIN
    INSERT INTO app.event_tables (session_id, table_code, capacity) VALUES ('00000000-0000-0000-0000-0000000000f1', 'X7', 7);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 6 failed: capacity 7 accepted'; END IF;

  -- 7. a table cannot lock below quorum
  INSERT INTO app.event_tables (id, session_id, table_code) VALUES ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000000f1', 'T01');
  ok := false;
  BEGIN
    UPDATE app.event_tables SET status = 'locked', locked_at = now() WHERE id = '00000000-0000-0000-0000-0000000003a1';
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 7 failed: locked below quorum'; END IF;

  -- 8. consent ledger is append-only
  INSERT INTO app.user_consents (user_id, consent_type, document_version, granted, source)
  VALUES ('00000000-0000-0000-0000-000000000101', 'terms', 'terms-1', true, 'app_web');
  ok := false;
  BEGIN
    UPDATE app.user_consents SET granted = false;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 8 failed: consent row updated'; END IF;

  -- 9. refunds never exceed the payment
  UPDATE app.bookings SET status = 'paid_awaiting_group', hold_expires_at = NULL WHERE user_id = '00000000-0000-0000-0000-000000000101';
  INSERT INTO app.payments (id, booking_id, user_id, psp, psp_payment_intent_id, amount_minor, status, idempotency_key, succeeded_at)
  SELECT '00000000-0000-0000-0000-0000000004a1', id, user_id, 'test_psp', 'pi_1', 5900, 'succeeded', 'pay-1', now()
    FROM app.bookings WHERE user_id = '00000000-0000-0000-0000-000000000101';
  INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, idempotency_key)
  SELECT '00000000-0000-0000-0000-0000000004a1', booking_id, 3000, 'organizer_cancel', 'rf-1' FROM app.payments WHERE id = '00000000-0000-0000-0000-0000000004a1';
  ok := false;
  BEGIN
    INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, idempotency_key)
    SELECT '00000000-0000-0000-0000-0000000004a1', booking_id, 3000, 'organizer_cancel', 'rf-2' FROM app.payments WHERE id = '00000000-0000-0000-0000-0000000004a1';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 9 failed: over-refund accepted'; END IF;

  -- 10. goodwill refund needs a different approver
  ok := false;
  BEGIN
    INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, idempotency_key, initiated_by, approved_by)
    SELECT '00000000-0000-0000-0000-0000000004a1', booking_id, 100, 'goodwill', 'rf-3',
           '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a002'
      FROM app.payments WHERE id = '00000000-0000-0000-0000-0000000004a1';
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 10 failed: self-approved goodwill refund'; END IF;

  -- 11. published questionnaire is immutable (and its questions too); retire is allowed
  INSERT INTO app.questions (id, questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                             matching_use, data_class, sort_order)
  VALUES ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000e1', 'Q05', 'profile', 'س', 'q', 'غ', 'p',
          'multi', 'soft_factor', 'P3', 5);
  UPDATE app.questionnaire_versions SET status = 'published', published_at = now(), approved_by = '00000000-0000-0000-0000-00000000a003'
   WHERE id = '00000000-0000-0000-0000-0000000000e1';
  ok := false;
  BEGIN
    UPDATE app.questions SET text_en = 'changed' WHERE id = '00000000-0000-0000-0000-0000000005a1';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 11a failed: published question edited'; END IF;
  ok := false;
  BEGIN
    UPDATE app.questionnaire_versions SET code = 'QV-X' WHERE id = '00000000-0000-0000-0000-0000000000e1';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 11b failed: published version edited'; END IF;
  UPDATE app.questionnaire_versions SET status = 'retired', retired_at = now() WHERE id = '00000000-0000-0000-0000-0000000000e1';

  -- 12. Q07 must be P4
  ok := false;
  BEGIN
    INSERT INTO app.questionnaire_versions (id, code) VALUES ('00000000-0000-0000-0000-0000000000e2', 'QV-T2');
    INSERT INTO app.questions (questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                               matching_use, data_class, sort_order)
    VALUES ('00000000-0000-0000-0000-0000000000e2', 'Q07', 'profile', 'س', 'q', 'غ', 'p', 'contact_request', 'ops_only', 'P3', 7);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 12 failed: Q07 stored below P4'; END IF;

  -- 13. audit log is append-only and P4 reads need a reason
  ok := false;
  BEGIN
    INSERT INTO app.audit_logs (actor_id, action, entity) VALUES ('00000000-0000-0000-0000-00000000a001', 'read_p4', 'safety_reports');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 13 failed: P4 read without reason'; END IF;

  -- 14. no-show fee must be 0 (non-punitive)
  ok := false;
  BEGIN
    INSERT INTO app.cancellation_policies (version, full_refund_until_hours, late_cancel_refund_pct, no_show_fee_pct, text_ar, text_en)
    VALUES ('cxl-bad', 48, 0, 50, 'x', 'x');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 14 failed: punitive no-show fee accepted'; END IF;

  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

-- 15. same-session merge (MOVED_TABLE): moves only within a session, validates blocks, requires a reason
INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, booking_opens_at, booking_closes_at, lock_at, reveal_at, check_in_opens_at, status)
VALUES ('00000000-0000-0000-0000-0000000000f2', 'doh', 'dinner', 'ar', now() + interval '3 days', now() + interval '3 days 2 hours',
  'مشيرب', 'Msheireb', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 12,
  now() - interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '2 days',
  now() + interval '3 days' - interval '30 minutes', 'on_sale');
DO $$
DECLARE ok boolean; ids uuid[];
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM app.hold_seat(('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid,
                          '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000b1',
                          ('00000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid);
  END LOOP;
  UPDATE app.bookings SET status = 'paid_awaiting_group', hold_expires_at = NULL
   WHERE session_id = '00000000-0000-0000-0000-0000000000f2';
  SELECT array_agg(id ORDER BY user_id) INTO ids FROM app.bookings WHERE session_id = '00000000-0000-0000-0000-0000000000f2';
  INSERT INTO app.matching_runs (id, session_id, mode, rule_version, questionnaire_version_id, algorithm, seed, inputs_hash,
                                 result_summary, published_at)
  VALUES ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000000f2', 'published', 'r1-baseline',
          '00000000-0000-0000-0000-0000000000e1', 'baseline_random', 1, repeat('0', 64), '{}', now());
  INSERT INTO app.event_tables (id, session_id, table_code, status) VALUES
    ('00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000000f2', 'T01', 'forming'),
    ('00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000000f2', 'T02', 'forming');
  INSERT INTO app.table_assignments (booking_id, table_id, matching_run_id)
  SELECT ids[g], CASE WHEN g <= 3 THEN '00000000-0000-0000-0000-0000000008b1'::uuid ELSE '00000000-0000-0000-0000-0000000008b2'::uuid END,
         '00000000-0000-0000-0000-0000000008a1' FROM generate_series(1, 5) g;

  ok := false;
  BEGIN PERFORM app.move_booking_table(ids[4], '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-00000000a001', 'because');
  EXCEPTION WHEN SQLSTATE 'P0040' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 15a failed: move without a valid reason code'; END IF;

  ok := false;
  BEGIN PERFORM app.move_booking_table(ids[4], '00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-00000000a001', 'quorum_merge');
  EXCEPTION WHEN SQLSTATE 'P0042' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 15b failed: cross-session move accepted'; END IF;

  INSERT INTO app.user_blocks (blocker_user_id, blocked_user_id, source)
  VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000105', 'user');
  ok := false;
  BEGIN PERFORM app.move_booking_table(ids[5], '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-00000000a001', 'quorum_merge');
  EXCEPTION WHEN SQLSTATE 'P0046' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 15c failed: move next to a blocked user accepted'; END IF;

  PERFORM app.move_booking_table(ids[4], '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-00000000a001', 'quorum_merge');
  IF (SELECT confirmed_count FROM app.event_tables WHERE id = '00000000-0000-0000-0000-0000000008b1') <> 4
     OR NOT EXISTS (SELECT 1 FROM app.notifications_outbox WHERE template_key = 'MOVED_TABLE')
     OR NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE action = 'table_move' AND reason_code = 'quorum_merge') THEN
    RAISE EXCEPTION 'CHECK 15d failed: merge did not count, notify or audit';
  END IF;
  RAISE NOTICE 'CHECK 15 PASSED';
END $$;
```

## A.3 Matching engine, tests, bridge

### `qatar/matching/matching_engine.py`

```python
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


def _table_sizes(n: int, max_size: int) -> List[int]:
    """Fill-to-capacity rule (v0.3 §4.4.1 D19: 13 bookings, capacity 6 -> 6 + 6 + 1 leftover).
    Full tables first; a remainder of 4+ forms its own table; a remainder below 4 is left over for
    down-tier placement, waitlist, rebook or refund. Full tables are never split to rescue a remainder."""
    full, rest = divmod(n, max_size)
    return [max_size] * full + ([rest] if rest >= MIN_TABLE else [])


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


def form_groups(cell: List[BookingInput], max_size: int, blocks: Set[FrozenSet[str]], algorithm: str, seed: int):
    ordered = stable_shuffle(cell, seed)
    sizes = _table_sizes(len(ordered), max_size)
    if not sizes:
        return [], [(m, "cell_below_quorum") for m in ordered]
    groups, unseated = _seat_greedy(ordered, sizes, blocks)
    if algorithm == "interest_opt_v1" and len(groups) > 1:
        groups = _optimise(groups, blocks)
    return groups, unseated


def place_leftovers_downward(tables: List[Table], leftovers: List[Leftover], max_size: int,
                             blocks: Set[FrozenSet[str]], algorithm: str, seed: int, next_code) -> Tuple[List[Table], List[Leftover]]:
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
        groups, unseated = form_groups(pool, max_size, blocks, algorithm, seed)
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
                 venue_capacity: int = MAX_TABLE, venues: Optional[Sequence[VenueInput]] = None) -> MatchResult:
    if mode not in MODES:
        raise MatchingError(f"mode must be one of {MODES}")
    if rule_version not in RULE_OBJECTIVES:
        raise MatchingError(f"unknown rule_version {rule_version!r}")
    if not (MIN_TABLE <= venue_capacity <= MAX_TABLE):
        raise MatchingError("venue_capacity must be between 4 and 6")
    if not isinstance(seed, int):
        raise MatchingError("seed must be an integer")
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
        groups, unseated = form_groups(cells[(lang, tier)], venue_capacity, blocks, algorithm, seed)
        for g in groups:
            tables.append(Table(table_code=next_code(), language=lang, tier_rank=tier, members=list(g)))
        leftovers.extend(Leftover(m, r) for m, r in unseated)

    tables, leftovers = place_leftovers_downward(tables, leftovers, venue_capacity, blocks, algorithm, seed, next_code)
    venue_warnings = assign_venues(tables, venues)

    for t in tables:
        t.members.sort(key=lambda m: _stable_key(seed, m.booking_id))
        t.interest, t.cohesion, t.score, t.member_scores = score_group(t.members)

    errors = validate_tables(tables, venue_capacity, blocks)
    if errors:
        raise MatchingError("hard constraint violated: " + "; ".join(errors))

    params = {"session_id": session_id, "rule_version": rule_version, "seed": seed, "venue_capacity": venue_capacity}
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
```

### `qatar/matching/test_matching_engine.py`

```python
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
```

### `qatar/matching/publish_run.py`

```python
"""
publish_run.py — bridge between PostgreSQL and matching_engine (standard library only).

    psql -Atc "SELECT app.matching_input('<session-uuid>')" \
      | python3 publish_run.py --rule-version r1-interest --seed 20261023 --mode published [--actor <admin-uuid>] \
      | psql -v ON_ERROR_STOP=1 -1

Reads app.matching_input() JSON on stdin, runs run_matching(), and writes SQL on stdout:
  * always:          one matching_runs row (dry_run or published) with seed, inputs_hash, explanations;
  * published only:  the previous current assignments are retired, event_tables rows are created
                     ('forming'), and table_assignments rows are inserted.
Leftovers are reported as a SQL comment and on stderr; ops handles them per Runbook A.
"""
import argparse
import json
import sys
import uuid

from matching_engine import BookingInput, VenueInput, run_matching


def q(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--rule-version", required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--mode", choices=["dry_run", "published"], required=True)
    ap.add_argument("--actor", default=None, help="admin_users.id; omit for the system job")
    ap.add_argument("--venue-capacity", type=int, default=6)
    args = ap.parse_args(argv)

    data = json.load(sys.stdin)
    bookings = [BookingInput(
        booking_id=b["booking_id"], user_id=b["user_id"], session_id=b["session_id"], status=b["status"],
        conversation_language=b["conversation_language"], budget_tier_rank=int(b["budget_tier_rank"]),
        q05_topics=frozenset(b["q05_topics"]) if b.get("q05_topics") else None,
        consents_current=bool(b["consents_current"]), age_attested=bool(b["age_attested"]),
        account_active=bool(b["account_active"])) for b in data["bookings"]]
    venues = [VenueInput(v["venue_id"], int(v["tier_rank"]), int(v["capacity"]), int(v["tables_available"]))
              for v in data["venues"]]
    res = run_matching(data["session_id"], args.mode, args.rule_version, args.seed, bookings,
                       block_rows=[tuple(x) for x in data["blocks"]], venue_capacity=args.venue_capacity,
                       venues=venues)

    run_id = str(uuid.uuid4())
    summary = {"tables": len(res.tables), "seated": sum(t.size for t in res.tables),
               "leftovers": len(res.leftovers), "ineligible": len(res.ineligible)}
    out = ["SET search_path = app, public;"]
    out.append(
        "INSERT INTO matching_runs (id, session_id, mode, rule_version, questionnaire_version_id, algorithm, seed, "
        "inputs_hash, result_summary, explanations, run_by, published_at) VALUES ("
        f"{q(run_id)}, {q(res.session_id)}, {q(res.mode)}, {q(res.rule_version)}, {q(data['questionnaire_version_id'])}, "
        f"{q(res.algorithm)}, {res.seed}, {q(res.inputs_hash)}, {q(json.dumps(summary))}::jsonb, "
        f"{q(json.dumps(res.explanations, ensure_ascii=False))}::jsonb, {q(args.actor)}::uuid, "
        f"{'now()' if res.mode == 'published' else 'NULL'});")
    if res.mode == "published":
        out.append("UPDATE table_assignments SET is_current = false WHERE is_current AND booking_id IN "
                   f"(SELECT id FROM bookings WHERE session_id = {q(res.session_id)});")
        for t in res.tables:
            tid = str(uuid.uuid4())
            out.append("INSERT INTO event_tables (id, session_id, venue_id, table_code, capacity, status) VALUES "
                       f"({q(tid)}, {q(res.session_id)}, {q(t.venue_id)}, {q(t.table_code)}, {args.venue_capacity}, 'forming');")
            for m in t.members:
                ms = t.member_scores.get(m.booking_id)
                out.append("INSERT INTO table_assignments (booking_id, table_id, matching_run_id, member_score) VALUES "
                           f"({q(m.booking_id)}, {q(tid)}, {q(run_id)}, {'NULL' if ms is None else round(ms, 4)});")
    for lo in res.leftovers:
        out.append(f"-- leftover booking {lo.booking.booking_id} reason={lo.reason}")
        print(f"leftover {lo.booking.booking_id} {lo.reason}", file=sys.stderr)
    for b, reason in res.ineligible:
        out.append(f"-- ineligible booking {b.booking_id} reason={reason}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
```

## A.4 Design tokens and contrast checker

### `qatar/design/tokens.json`

```json
{
  "$description": "{BRAND} Qatar app — design tokens v0.4 (W3C Design Tokens format). Import into Figma via Tokens Studio or Figma Variables (collections: color/light, color/dark, type/ar, type/en, space, radius, elevation, motion).",
  "$contrastPairs": [
    ["text", "bg", 4.5], ["text", "surface", 4.5], ["textMuted", "bg", 4.5], ["textMuted", "surface", 4.5],
    ["onPrimary", "primary", 4.5], ["primary", "bg", 4.5], ["primary", "surface", 4.5],
    ["success", "surface", 4.5], ["warning", "surface", 4.5], ["danger", "surface", 4.5], ["info", "surface", 4.5],
    ["onDanger", "danger", 4.5], ["border", "surface", 1.5], ["borderStrong", "surface", 3.0],
    ["focus", "bg", 3.0], ["focus", "surface", 3.0], ["textDisabled", "surface", 3.0]
  ],
  "color": {
    "light": {
      "bg":           { "$type": "color", "$value": "#FBF8F4", "$description": "App background (warm off-white)" },
      "surface":      { "$type": "color", "$value": "#FFFFFF", "$description": "Cards, sheets, inputs" },
      "surfaceSunken":{ "$type": "color", "$value": "#F2EDE6", "$description": "Grouped sections, skeletons" },
      "text":         { "$type": "color", "$value": "#1C1A17" },
      "textMuted":    { "$type": "color", "$value": "#5C554C", "$description": "Secondary text, helper text" },
      "textDisabled": { "$type": "color", "$value": "#8F877C", "$description": "Disabled labels only (exempt from 4.5:1, kept ≥ 3:1)" },
      "primary":      { "$type": "color", "$value": "#7A1F3D", "$description": "Maroon — primary actions, selected states" },
      "primaryHover": { "$type": "color", "$value": "#651832" },
      "primarySubtle":{ "$type": "color", "$value": "#F6E7EC", "$description": "Selected option card background" },
      "onPrimary":    { "$type": "color", "$value": "#FFFFFF" },
      "border":       { "$type": "color", "$value": "#D9D2C7", "$description": "Decorative dividers (not a UI boundary)" },
      "borderStrong": { "$type": "color", "$value": "#8C8478", "$description": "Input and option-card boundaries (≥ 3:1)" },
      "focus":        { "$type": "color", "$value": "#1F4FA8", "$description": "2px focus ring + 2px offset" },
      "success":      { "$type": "color", "$value": "#1F6B45" },
      "warning":      { "$type": "color", "$value": "#8A5A00" },
      "danger":       { "$type": "color", "$value": "#B3261E" },
      "onDanger":     { "$type": "color", "$value": "#FFFFFF" },
      "info":         { "$type": "color", "$value": "#1F4FA8" }
    },
    "dark": {
      "bg":           { "$type": "color", "$value": "#141210" },
      "surface":      { "$type": "color", "$value": "#1E1B18" },
      "surfaceSunken":{ "$type": "color", "$value": "#0F0D0B" },
      "text":         { "$type": "color", "$value": "#F3EEE7" },
      "textMuted":    { "$type": "color", "$value": "#B9B0A4" },
      "textDisabled": { "$type": "color", "$value": "#7D756B" },
      "primary":      { "$type": "color", "$value": "#E7A3B8" },
      "primaryHover": { "$type": "color", "$value": "#F0BCCB" },
      "primarySubtle":{ "$type": "color", "$value": "#3A1A25" },
      "onPrimary":    { "$type": "color", "$value": "#3A0A1A" },
      "border":       { "$type": "color", "$value": "#423C35" },
      "borderStrong": { "$type": "color", "$value": "#8A8176" },
      "focus":        { "$type": "color", "$value": "#8DB4FF" },
      "success":      { "$type": "color", "$value": "#7FD3A7" },
      "warning":      { "$type": "color", "$value": "#F2C46D" },
      "danger":       { "$type": "color", "$value": "#FF9A8F" },
      "onDanger":     { "$type": "color", "$value": "#3A0703" },
      "info":         { "$type": "color", "$value": "#8DB4FF" }
    }
  },
  "font": {
    "family": {
      "ar": { "$type": "fontFamily", "$value": ["IBM Plex Sans Arabic", "Noto Sans Arabic", "system-ui", "sans-serif"] },
      "en": { "$type": "fontFamily", "$value": ["IBM Plex Sans", "system-ui", "sans-serif"] },
      "numeric": { "$type": "fontFamily", "$value": ["IBM Plex Sans", "system-ui", "sans-serif"], "$description": "Prices, times, booking refs, OTP (Western digits, tabular) in both locales" }
    },
    "weight": { "regular": { "$type": "fontWeight", "$value": 400 }, "medium": { "$type": "fontWeight", "$value": 500 }, "semibold": { "$type": "fontWeight", "$value": 600 }, "bold": { "$type": "fontWeight", "$value": 700 } }
  },
  "type": {
    "$description": "Arabic runs ~1 step larger with taller line-height than Latin at the same role; letter-spacing is 0 for Arabic (never track Arabic).",
    "ar": {
      "display": { "$type": "typography", "$value": { "fontFamily": "{font.family.ar}", "fontSize": "32px", "lineHeight": 1.4,  "fontWeight": "{font.weight.bold}",     "letterSpacing": "0" } },
      "h1":      { "$type": "typography", "$value": { "fontFamily": "{font.family.ar}", "fontSize": "26px", "lineHeight": 1.45, "fontWeight": "{font.weight.bold}",     "letterSpacing": "0" } },
      "h2":      { "$type": "typography", "$value": { "fontFamily": "{font.family.ar}", "fontSize": "21px", "lineHeight": 1.5,  "fontWeight": "{font.weight.semibold}", "letterSpacing": "0" } },
      "body":    { "$type": "typography", "$value": { "fontFamily": "{font.family.ar}", "fontSize": "17px", "lineHeight": 1.7,  "fontWeight": "{font.weight.regular}",  "letterSpacing": "0" } },
      "label":   { "$type": "typography", "$value": { "fontFamily": "{font.family.ar}", "fontSize": "16px", "lineHeight": 1.5,  "fontWeight": "{font.weight.medium}",   "letterSpacing": "0" } },
      "caption": { "$type": "typography", "$value": { "fontFamily": "{font.family.ar}", "fontSize": "14px", "lineHeight": 1.6,  "fontWeight": "{font.weight.regular}",  "letterSpacing": "0" } }
    },
    "en": {
      "display": { "$type": "typography", "$value": { "fontFamily": "{font.family.en}", "fontSize": "30px", "lineHeight": 1.2,  "fontWeight": "{font.weight.bold}",     "letterSpacing": "-0.01em" } },
      "h1":      { "$type": "typography", "$value": { "fontFamily": "{font.family.en}", "fontSize": "24px", "lineHeight": 1.25, "fontWeight": "{font.weight.bold}",     "letterSpacing": "-0.005em" } },
      "h2":      { "$type": "typography", "$value": { "fontFamily": "{font.family.en}", "fontSize": "20px", "lineHeight": 1.3,  "fontWeight": "{font.weight.semibold}", "letterSpacing": "0" } },
      "body":    { "$type": "typography", "$value": { "fontFamily": "{font.family.en}", "fontSize": "16px", "lineHeight": 1.5,  "fontWeight": "{font.weight.regular}",  "letterSpacing": "0" } },
      "label":   { "$type": "typography", "$value": { "fontFamily": "{font.family.en}", "fontSize": "15px", "lineHeight": 1.4,  "fontWeight": "{font.weight.medium}",   "letterSpacing": "0" } },
      "caption": { "$type": "typography", "$value": { "fontFamily": "{font.family.en}", "fontSize": "13px", "lineHeight": 1.45, "fontWeight": "{font.weight.regular}",  "letterSpacing": "0.005em" } }
    }
  },
  "space": {
    "$description": "4-px base. Use logical properties (padding-inline-start/end) so RTL mirrors automatically.",
    "0": { "$type": "dimension", "$value": "0px" }, "1": { "$type": "dimension", "$value": "4px" }, "2": { "$type": "dimension", "$value": "8px" },
    "3": { "$type": "dimension", "$value": "12px" }, "4": { "$type": "dimension", "$value": "16px" }, "5": { "$type": "dimension", "$value": "20px" },
    "6": { "$type": "dimension", "$value": "24px" }, "8": { "$type": "dimension", "$value": "32px" }, "10": { "$type": "dimension", "$value": "40px" },
    "12": { "$type": "dimension", "$value": "48px" },
    "gutter": { "$type": "dimension", "$value": "16px", "$description": "Screen side padding at 360px" },
    "touchTarget": { "$type": "dimension", "$value": "48px", "$description": "Minimum hit area for every control" }
  },
  "radius": {
    "sm": { "$type": "dimension", "$value": "6px", "$description": "Badges, chips" },
    "md": { "$type": "dimension", "$value": "10px", "$description": "Inputs, buttons" },
    "lg": { "$type": "dimension", "$value": "16px", "$description": "Cards, option cards" },
    "xl": { "$type": "dimension", "$value": "24px", "$description": "Bottom sheets (top corners only)" },
    "pill": { "$type": "dimension", "$value": "999px" }
  },
  "elevation": {
    "0": { "$type": "shadow", "$value": { "color": "#00000000", "offsetX": "0px", "offsetY": "0px", "blur": "0px", "spread": "0px" }, "$description": "Flat (default cards use border, not shadow)" },
    "1": { "$type": "shadow", "$value": { "color": "#1C1A171A", "offsetX": "0px", "offsetY": "1px", "blur": "3px", "spread": "0px" }, "$description": "Raised card, sticky price strip" },
    "2": { "$type": "shadow", "$value": { "color": "#1C1A1724", "offsetX": "0px", "offsetY": "4px", "blur": "12px", "spread": "0px" }, "$description": "Menus, toasts" },
    "3": { "$type": "shadow", "$value": { "color": "#1C1A172E", "offsetX": "0px", "offsetY": "12px", "blur": "32px", "spread": "0px" }, "$description": "Bottom sheets, dialogs (+ scrim #000 40 %)" },
    "darkNote": { "$type": "other", "$value": "In dark theme shadows are not visible; raise surfaces by one step of lightness (surface → #26221E for level 2–3) instead." }
  },
  "motion": {
    "fast":   { "$type": "duration", "$value": "120ms" },
    "base":   { "$type": "duration", "$value": "200ms" },
    "slow":   { "$type": "duration", "$value": "320ms" },
    "easing": { "$type": "cubicBezier", "$value": [0.2, 0, 0, 1] },
    "reduced": { "$type": "other", "$value": "prefers-reduced-motion: all durations → 0ms except opacity fades ≤ 120ms; success check is static." }
  }
}
```

### `qatar/design/contrast_check.py`

```python
"""Checks WCAG 2.1 contrast for every text/background pair declared in tokens.json. Exit 1 on failure."""
import json, sys

def lum(hex_):
    h = hex_.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]

def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

tokens = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "tokens.json"))
fail = 0
for theme in ("light", "dark"):
    c = {k: v["$value"] for k, v in tokens["color"][theme].items()}
    for fg, bg, minimum in tokens["$contrastPairs"]:
        r = ratio(c[fg], c[bg])
        ok = r >= minimum
        fail += not ok
        print(f"{theme:5} {fg:18} on {bg:12} {r:5.2f}:1  need {minimum}  {'PASS' if ok else 'FAIL'}")
sys.exit(1 if fail else 0)
```

## A.5 Runbook simulations

### `qatar/ops/seed_common.sql`

```sql
-- Common reference data for the Runbook A/B simulations (test data only — not real venues or people).
-- Requires 001_init.sql. Clock: both live sessions start at T = date_trunc('minute', now()) + 24h,
-- so lock_at (T-24h) is "now" and the T-24h decision can be executed immediately.
SET search_path = app, public;

INSERT INTO cities (id, name_ar, name_en, is_active) VALUES ('doh', 'الدوحة', 'Doha', true);

INSERT INTO legal_documents (version, type, text_ar, text_en, published_at) VALUES
  ('terms-qa-1',   'terms',        'الشروط (نسخة اختبار)',          'Terms (test copy)',        now()),
  ('conduct-qa-1', 'conduct',      'قواعد السلوك (نسخة اختبار)',    'Code of conduct (test)',   now()),
  ('privacy-qa-1', 'privacy',      'إشعار الخصوصية (نسخة اختبار)', 'Privacy notice (test)',    now()),
  ('cxl-qa-1',     'cancellation', 'سياسة الإلغاء (نسخة اختبار)',   'Cancellation policy (test)', now());

INSERT INTO admin_users (id, email, name, role, mfa_enabled) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'ops.oncall@example.test',  'Ops On-call',  'ops',          true),
  ('00000000-0000-0000-0000-00000000a002', 'finance@example.test',     'Finance Lead', 'finance',      true),
  ('00000000-0000-0000-0000-00000000a003', 'owner@example.test',       'Owner',        'owner',        true),
  ('00000000-0000-0000-0000-00000000a004', 'ts.primary@example.test',  'T&S Primary',  'trust_safety', true),
  ('00000000-0000-0000-0000-00000000a005', 'ts.second@example.test',   'T&S Second',   'trust_safety', true),
  ('00000000-0000-0000-0000-00000000a006', 'ts.appeals@example.test',  'T&S Appeals',  'trust_safety', true);

INSERT INTO budget_tiers (id, city_id, rank, max_spend_minor, label_ar, label_en, status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'doh', 1, 10000, 'اقتصادي',  'Value',    'published'),
  ('00000000-0000-0000-0000-0000000000b2', 'doh', 2, 20000, 'متوسط',    'Standard', 'published'),
  ('00000000-0000-0000-0000-0000000000b3', 'doh', 3, NULL,  'مرتفع',    'Premium',  'published');

INSERT INTO venues (id, city_id, name, district_ar, district_en, address_line, lat, lng, venue_type, supported_experiences,
                    total_bookable_tables, seats_per_table_max, price_band_min_minor, price_band_max_minor, budget_tier_id,
                    noise_level, separate_bills_confirmed, min_spend_policy, arrival_instructions_ar, arrival_instructions_en,
                    contract_status, is_active) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'doh', 'TEST Venue Lusail',   'لوسيل',          'Lusail',   'Test address 1', 25.420000, 51.490000,
   'restaurant', '{dinner,coffee}', 3, 6, 8000, 15000, '00000000-0000-0000-0000-0000000000b2', 2, true,
   'No minimum spend on the organizer; each guest orders and pays individually', 'اطلب طاولة {code}', 'Ask for table {code}', 'signed', true),
  ('00000000-0000-0000-0000-0000000000c2', 'doh', 'TEST Venue Msheireb', 'مشيرب',          'Msheireb', 'Test address 2', 25.286000, 51.526000,
   'cafe', '{coffee,dinner}', 2, 6, 3000, 8000, '00000000-0000-0000-0000-0000000000b1', 1, true,
   'No minimum spend on the organizer; each guest orders and pays individually', 'اطلب طاولة {code}', 'Ask for table {code}', 'signed', true),
  ('00000000-0000-0000-0000-0000000000c3', 'doh', 'TEST Venue West Bay', 'الخليج الغربي', 'West Bay', 'Test address 3', 25.322000, 51.530000,
   'restaurant', '{dinner}', 2, 6, 15000, 30000, '00000000-0000-0000-0000-0000000000b3', 2, true,
   'No minimum spend on the organizer; each guest orders and pays individually', 'اطلب طاولة {code}', 'Ask for table {code}', 'signed', true);

INSERT INTO price_plans (id, city_id, experience, service_fee_minor, valid_from) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'doh', 'dinner', 5900, now() - interval '30 days');
INSERT INTO cancellation_policies (id, version, full_refund_until_hours, late_cancel_refund_pct, text_ar, text_en) VALUES
  ('00000000-0000-0000-0000-0000000000d2', 'cxl-qa-1', 48, 0, 'انظر وثيقة السياسة cxl-qa-1', 'See policy document cxl-qa-1');

-- questionnaire: Q05 only is needed by the matcher; other questions exist in production (v0.3 §1.2)
INSERT INTO questionnaire_versions (id, code, status) VALUES ('00000000-0000-0000-0000-0000000000e1', 'QA-2026-01', 'draft');
INSERT INTO questions (id, questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                       max_selections, matching_use, data_class, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e1', 'Q05', 'profile',
   'اختر حتى ثلاثة موضوعات تستمتع بالحديث عنها.', 'Choose up to three topics you enjoy discussing.',
   'لنقترح طاولة باهتمامات مشتركة', 'To suggest a table with shared interests', 'multi', 3, 'soft_factor', 'P3', 5);
INSERT INTO question_options (question_id, key, label_ar, label_en, is_exclusive, sort_order)
SELECT '00000000-0000-0000-0000-0000000000e5', k, la, le, k = 'no_pref', o FROM (VALUES
  ('food','طعام','Food',1), ('travel','سفر','Travel',2), ('sport','رياضة','Sport',3),
  ('books_culture','كتب وثقافة','Books & culture',4), ('creative_hobbies','هوايات إبداعية','Creative hobbies',5),
  ('tech','تقنية','Tech',6), ('no_pref','لا تفضيل','No preference',7)
) v(k, la, le, o);
UPDATE questionnaire_versions SET status = 'published', published_at = now(), approved_by = '00000000-0000-0000-0000-00000000a003'
 WHERE id = '00000000-0000-0000-0000-0000000000e1';

-- 20 test users (u01..u20), all AR locale, tier 2 cap, consents current, Q05 answered (u05 left it blank)
INSERT INTO users (id, phone_e164_enc, phone_lookup_hash, display_name, locale, age_eligibility_confirmed_at, registration_completed_at)
SELECT ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, '\x00'::bytea,
       encode(sha256(('+974-test-' || g)::bytea), 'hex'), 'Tester ' || chr(64 + g), 'ar', now() - interval '20 days', now() - interval '20 days'
FROM generate_series(1, 20) g;

INSERT INTO user_consents (user_id, consent_type, document_version, granted, source)
SELECT u.id, c.t::consent_type, c.v, true, 'app_ios'
FROM users u CROSS JOIN (VALUES ('terms','terms-qa-1'), ('conduct','conduct-qa-1'), ('privacy_notice','privacy-qa-1')) c(t, v);

INSERT INTO questionnaire_responses (id, user_id, questionnaire_version_id, status, submitted_at, completeness_required)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000000e1', 'submitted', now() - interval '20 days', 4
FROM generate_series(1, 20) g;

INSERT INTO answers (response_id, question_id, option_id)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000e5', o.id
FROM generate_series(1, 20) g
JOIN question_options o ON o.question_id = '00000000-0000-0000-0000-0000000000e5'
 AND o.key = ANY (CASE g % 4 WHEN 0 THEN ARRAY['food','travel'] WHEN 1 THEN ARRAY['books_culture','tech']
                             WHEN 2 THEN ARRAY['food','creative_hobbies'] ELSE ARRAY['sport','travel'] END)
WHERE g <> 5;

-- sessions: S1 and S2 at T (Arabic dinner, Lusail / West Bay hints); S3 a week later for rebooking
CREATE SCHEMA sim;  -- simulation-only helpers; never create this schema in production
CREATE TABLE sim.clock AS SELECT date_trunc('minute', now()) + interval '24 hours' AS t;
INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, booking_opens_at, booking_closes_at, lock_at, reveal_at, check_in_opens_at, status)
SELECT x.id, 'doh', 'dinner', 'ar', c.t + x.shift, c.t + x.shift + interval '2 hours', x.dar, x.den,
       '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 18,
       c.t + x.shift - interval '14 days', c.t + x.shift - interval '1 hour',
       c.t + x.shift - interval '24 hours', c.t + x.shift - interval '24 hours', c.t + x.shift - interval '30 minutes', 'on_sale'
FROM sim.clock c CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-00000000f001'::uuid, interval '0', 'لوسيل', 'Lusail'),
  ('00000000-0000-0000-0000-00000000f002'::uuid, interval '0', 'الخليج الغربي', 'West Bay'),
  ('00000000-0000-0000-0000-00000000f003'::uuid, interval '7 days', 'مشيرب', 'Msheireb')
) x(id, shift, dar, den);

-- helper used by the seeds: hold a seat through the real function, then record a successful hosted-checkout payment
CREATE FUNCTION sim.book_and_pay(p_user int, p_session uuid, p_alternates uuid[] DEFAULT '{}') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE b app.bookings; uid uuid := ('00000000-0000-0000-0000-0000000001' || lpad(p_user::text, 2, '0'))::uuid;
BEGIN
  b := app.hold_seat(uid, p_session, '00000000-0000-0000-0000-0000000000b2',
                     ('00000000-0000-0000-0000-0000000002' || lpad(p_user::text, 2, '0'))::uuid,
                     p_alternates, 'seed-' || p_user || '-' || p_session);
  INSERT INTO app.payment_webhook_events (psp, psp_event_id, event_type, signature_valid, payload, processed_at)
  VALUES ('test_psp', 'evt_' || b.id, 'payment.succeeded', true,
          jsonb_build_object('payment_intent', 'pi_' || b.id, 'amount', 5900, 'currency', 'QAR'), now());
  INSERT INTO app.payments (booking_id, user_id, psp, psp_payment_intent_id, amount_minor, status, method_brand, card_last4,
                            idempotency_key, succeeded_at)
  VALUES (b.id, uid, 'test_psp', 'pi_' || b.id, 5900, 'succeeded', 'visa', '4242', 'pay-' || b.id, now());
  UPDATE app.bookings SET status = 'paid_awaiting_group', hold_expires_at = NULL WHERE id = b.id;
  RETURN b.id;
END $$;
```

### `qatar/ops/runbook_a/01_seed_bookings.sql`

```sql
-- Runbook A seed: 13 paid bookings in Session 1 (S1), 5 paid bookings in Session 2 (S2).
-- Every S1 member saved S2 as a Q02 alternate; u14 saved S3. Test data only.
SET search_path = app, public;
SELECT count(sim.book_and_pay(g, '00000000-0000-0000-0000-00000000f001',
       ARRAY['00000000-0000-0000-0000-00000000f002'::uuid])) AS booked
FROM generate_series(1, 13) g;
SELECT count(sim.book_and_pay(g, '00000000-0000-0000-0000-00000000f002',
       CASE WHEN g = 14 THEN ARRAY['00000000-0000-0000-0000-00000000f003'::uuid] ELSE '{}' END)) AS booked
FROM generate_series(14, 18) g;
SELECT s.district_hint_en, s.seats_sold, count(b.*) FILTER (WHERE b.status = 'paid_awaiting_group') AS paid
FROM event_sessions s LEFT JOIN bookings b ON b.session_id = s.id GROUP BY 1, 2 ORDER BY 1;
```

### `qatar/ops/runbook_a/02_cancellations_t25.sql`

```sql
-- T-25h: two S2 members cancel (u17, u18). Policy cxl-qa-1: full refund until T-48h, 0 % after,
-- so these late cancellations create no refund. The seat-release trigger gives the seats back.
SET search_path = app, public;
UPDATE bookings b SET status = 'cancelled_by_user', cancelled_at = c.t - interval '25 hours', cancel_actor = 'user',
       cancel_reason_code = 'schedule_changed'
FROM sim.clock c
WHERE b.session_id = '00000000-0000-0000-0000-00000000f002'
  AND b.user_id IN ('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0000-000000000118');
SELECT t.table_code, t.confirmed_count, t.status FROM event_tables t
WHERE t.session_id = '00000000-0000-0000-0000-00000000f002';
```

### `qatar/ops/runbook_a/03_lock_t24.sql`

```sql
-- T-24h (lock_at): decision tree per v0.3 §4.4.1, executed by the on-call ops admin (a001).
SET search_path = app, public;

-- 3.1 Decision board: every forming table whose session reached lock_at
SELECT s.district_hint_en AS session, t.table_code, t.confirmed_count, t.capacity, t.status,
       CASE WHEN t.confirmed_count >= t.min_quorum THEN 'LOCK' ELSE 'BELOW_QUORUM' END AS decision
FROM event_tables t JOIN event_sessions s ON s.id = t.session_id
WHERE s.lock_at <= now() + interval '1 minute' AND t.status = 'forming' ORDER BY 1, 2;

-- 3.2 Lock every table at quorum (S1: T01, T02) and tell members (count only, no identities)
WITH locked AS (
  UPDATE event_tables t SET status = 'locked', locked_at = now(), venue_confirmed_at = now()
  FROM event_sessions s
  WHERE s.id = t.session_id AND s.lock_at <= now() + interval '1 minute'
    AND t.status = 'forming' AND t.confirmed_count >= t.min_quorum
  RETURNING t.id, s.reveal_at
), members AS (
  UPDATE bookings b SET status = 'group_locked'
  FROM table_assignments a, locked l
  WHERE a.booking_id = b.id AND a.is_current AND a.table_id = l.id AND b.status = 'paid_awaiting_group'
  RETURNING b.id, b.user_id, l.reveal_at
)
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT m.user_id, 'push', 'TABLE_LOCKED', u.locale, jsonb_build_object('booking_id', m.id, 'reveal_at', m.reveal_at)
FROM members m JOIN users u ON u.id = m.user_id;

INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a001', 'table_lock', 'event_tables', id, 'quorum_met'
FROM event_tables WHERE status = 'locked' AND locked_at > now() - interval '5 minutes';

-- 3.3 S1 leftover (the one paid member the matcher could not seat). Step 3 MOVE DOWN-TIER: any open seat in a table of the same session,
--     language, venue tier <= cap? (none: both tables are full, and they are locked)
SELECT b.booking_ref, 'no seat in a same-language table at or below cap' AS result
FROM bookings b
WHERE b.session_id = '00000000-0000-0000-0000-00000000f001' AND b.status = 'paid_awaiting_group'
  AND NOT EXISTS (SELECT 1 FROM table_assignments a WHERE a.booking_id = b.id AND a.is_current);

--     → organizer-cancel the leftover booking; QUORUM_FAIL_CHOICE lists its Q02 alternates first (S2, then S3)
WITH lo AS (
  UPDATE bookings b SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
         cancel_reason_code = 'no_table_formed'
  WHERE b.session_id = '00000000-0000-0000-0000-00000000f001' AND b.status = 'paid_awaiting_group'
    AND NOT EXISTS (SELECT 1 FROM table_assignments a WHERE a.booking_id = b.id AND a.is_current)
  RETURNING b.id, b.user_id, b.alternate_session_ids
), n AS (
  INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
  SELECT lo.user_id, 'push', 'QUORUM_FAIL_CHOICE', u.locale,
         jsonb_build_object('booking_id', lo.id, 'date', c.t, 'deadline', now() + interval '48 hours',
                            'rebook_options', to_jsonb(lo.alternate_session_ids || ARRAY['00000000-0000-0000-0000-00000000f003'::uuid]))
  FROM lo JOIN users u ON u.id = lo.user_id CROSS JOIN sim.clock c
)
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a001', 'booking_cancel_organizer', 'bookings', id, 'no_table_formed' FROM lo;

-- 3.4 S2 table below quorum (3 of 4).
--     Step 1 MERGE: another forming table in S2 with the same language and room? (none — S2 has one table)
SELECT count(*) AS merge_candidates FROM event_tables
WHERE session_id = '00000000-0000-0000-0000-00000000f002' AND status = 'forming' AND confirmed_count >= 1
  AND table_code <> 'T01';
--     Step 2 FILL by invitation: Q02-alternate holders for S2 are offered a seat individually (the S1 leftover above).
--     The invitation window is 30 min [CONFIG]; the lock decision may wait at most 60 min.
--     In this simulation nobody takes the seat within the window, so:
--     Step 4 CANCEL the table (atomic: table, bookings, notifications, audit; seats released by trigger)
SELECT cancel_table_quorum(t.id, '00000000-0000-0000-0000-00000000a001', 48) AS bookings_cancelled
FROM event_tables t WHERE t.session_id = '00000000-0000-0000-0000-00000000f002' AND t.status = 'forming';

-- the venue slot is released (call the day-of contact; logged)
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a001', 'venue_notified', 'event_tables', t.id, 'VENUE_TABLE_RELEASED'
FROM event_tables t WHERE t.session_id = '00000000-0000-0000-0000-00000000f002' AND t.status = 'cancelled_quorum';

-- 3.5 Session states: S1 locked (reveal follows), S2 cancelled (no table survived)
UPDATE event_sessions SET status = 'locked' WHERE id = '00000000-0000-0000-0000-00000000f001';
UPDATE event_sessions SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-00000000f002';

-- 3.6 Reveal (only locked tables): group_locked -> revealed, VENUE_REVEALED with venue, district, table code
WITH rv AS (
  UPDATE bookings b SET status = 'revealed'
  FROM table_assignments a JOIN event_tables t ON t.id = a.table_id AND t.status = 'locked'
  WHERE a.booking_id = b.id AND a.is_current AND b.status = 'group_locked'
  RETURNING b.id, b.user_id, t.table_code, t.venue_id
)
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT rv.user_id, 'push', 'VENUE_REVEALED', u.locale,
       jsonb_build_object('booking_id', rv.id, 'venue', v.name, 'district', v.district_ar, 'code', rv.table_code)
FROM rv JOIN users u ON u.id = rv.user_id JOIN venues v ON v.id = rv.venue_id;
```

### `qatar/ops/runbook_a/04_member_choices.sql`

```sql
-- Choice window (T-24h -> +48h). Users act through the API; user_id always comes from the JWT.
SET search_path = app, public;

-- u14 picks its Q02 alternate S3 ("we transfer your fee as-is")
SELECT booking_ref, status FROM rebook_booking(
  (SELECT id FROM bookings WHERE user_id = '00000000-0000-0000-0000-000000000114' AND status = 'cancelled_by_organizer'),
  '00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-00000000f003');

-- the S1 leftover picks S3 (its first alternate, S2, was cancelled)
SELECT r.booking_ref, r.status FROM bookings b,
       LATERAL rebook_booking(b.id, b.user_id, '00000000-0000-0000-0000-00000000f003') r
WHERE b.session_id = '00000000-0000-0000-0000-00000000f001' AND b.cancel_reason_code = 'no_table_formed';

-- u15 picks a full refund (organizer_cancel: automatic, no approval needed)
INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
SELECT p.id, b.id, p.amount_minor, 'organizer_cancel', 'requested', 'choice-refund-' || b.id
FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.status = 'succeeded'
WHERE b.user_id = '00000000-0000-0000-0000-000000000115' AND b.status = 'cancelled_by_organizer';

-- u16 does not answer.
```

### `qatar/ops/runbook_a/05_after_deadline_refunds.sql`

```sql
-- After choice_deadline: automatic refunds for members who did not choose, then the finance batch.
-- Production call: refund_unresolved_organizer_cancels(now() - interval '48 hours').
-- Simulation: the deadline is treated as passed for everything cancelled so far.
SET search_path = app, public;
SELECT refund_unresolved_organizer_cancels(clock_timestamp()) AS auto_refunds_created;

-- Batch: finance (a002) approves every requested organizer_cancel refund -> processing
WITH batch AS (
  UPDATE refunds SET status = 'processing', approved_by = '00000000-0000-0000-0000-00000000a002'
  WHERE status = 'requested' AND reason = 'organizer_cancel'
  RETURNING id
)
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a002', 'refund_batch_approve', 'refunds', id, 'organizer_cancel' FROM batch;

-- PSP confirms each refund (in production: refund.succeeded webhook, deduplicated on (psp, psp_event_id))
INSERT INTO payment_webhook_events (psp, psp_event_id, event_type, signature_valid, payload, processed_at)
SELECT 'test_psp', 'evt_rf_' || r.id, 'refund.succeeded', true, jsonb_build_object('refund', 're_' || r.id), now()
FROM refunds r WHERE r.status = 'processing';

WITH done AS (
  UPDATE refunds SET status = 'refunded', psp_refund_id = 're_' || id, completed_at = now()
  WHERE status = 'processing'
  RETURNING id, payment_id, booking_id, amount_minor
), pay AS (
  UPDATE payments p SET status = 'refunded'
  FROM done WHERE p.id = done.payment_id
  RETURNING p.user_id, done.amount_minor, done.booking_id
)
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT pay.user_id, 'push', 'REFUND_DONE', u.locale,
       jsonb_build_object('booking_id', pay.booking_id, 'amount_minor', pay.amount_minor, 'days', 10)
FROM pay JOIN users u ON u.id = pay.user_id;
```

### `qatar/ops/runbook_a/99_verify.sql`

```sql
-- Expected end state of the Runbook A simulation (raises on the first mismatch).
SET search_path = app, public;
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(table_code || ':' || confirmed_count || ':' || status, ',' ORDER BY table_code) INTO v
    FROM event_tables WHERE session_id = '00000000-0000-0000-0000-00000000f001';
  IF v <> 'T01:6:locked,T02:6:locked' THEN RAISE EXCEPTION 'S1 tables: %', v; END IF;
  IF EXISTS (SELECT 1 FROM event_tables WHERE confirmed_count > 6) THEN RAISE EXCEPTION 'table above 6'; END IF;

  SELECT string_agg(status::text, ',') INTO v FROM event_tables WHERE session_id = '00000000-0000-0000-0000-00000000f002';
  IF v <> 'cancelled_quorum' THEN RAISE EXCEPTION 'S2 table: %', v; END IF;

  IF (SELECT count(*) FROM bookings WHERE session_id = '00000000-0000-0000-0000-00000000f001' AND status = 'revealed') <> 12
    THEN RAISE EXCEPTION 'S1 revealed count'; END IF;
  IF (SELECT count(*) FROM bookings WHERE status = 'cancelled_by_user') <> 2 THEN RAISE EXCEPTION 'late cancels'; END IF;
  IF EXISTS (SELECT 1 FROM refunds r JOIN bookings b ON b.id = r.booking_id WHERE b.status = 'cancelled_by_user')
    THEN RAISE EXCEPTION 'late cancel was refunded (policy is 0 %% after T-48h)'; END IF;

  SELECT string_agg(right(b.user_id::text, 2) || ':' || r.amount_minor || ':' || r.status, ',' ORDER BY b.user_id) INTO v
    FROM refunds r JOIN bookings b ON b.id = r.booking_id;
  IF v <> '15:5900:refunded,16:5900:refunded' THEN RAISE EXCEPTION 'refunds: %', v; END IF;

  SELECT string_agg(o.cancel_reason_code || ':' || n.status, ',' ORDER BY o.cancel_reason_code) INTO v
    FROM bookings n JOIN bookings o ON o.id = n.rebooked_from_booking_id
   WHERE n.session_id = '00000000-0000-0000-0000-00000000f003';
  IF v <> 'below_quorum:paid_awaiting_group,no_table_formed:paid_awaiting_group' THEN RAISE EXCEPTION 'S3 rebooks: %', v; END IF;
  IF (SELECT count(*) FROM bookings WHERE session_id = '00000000-0000-0000-0000-00000000f003' AND rebooked_from_booking_id IS NULL) <> 0
    THEN RAISE EXCEPTION 'rebook without source booking'; END IF;

  SELECT string_agg(seats_sold::text, ',' ORDER BY id) INTO v FROM event_sessions;
  IF v <> '12,0,2' THEN RAISE EXCEPTION 'seats_sold S1,S2,S3: %', v; END IF;

  SELECT string_agg(template_key || '=' || n, ',' ORDER BY template_key) INTO v
    FROM (SELECT template_key, count(*) n FROM notifications_outbox GROUP BY 1) x;
  IF v <> 'QUORUM_FAIL_CHOICE=4,REFUND_DONE=2,TABLE_LOCKED=12,VENUE_REVEALED=12' THEN RAISE EXCEPTION 'notifications: %', v; END IF;

  SELECT string_agg(action || '=' || n, ',' ORDER BY action) INTO v
    FROM (SELECT action, count(*) n FROM audit_logs GROUP BY 1) x;
  IF v <> 'booking_cancel_organizer=1,refund_batch_approve=2,table_cancel=1,table_lock=2,venue_notified=1'
    THEN RAISE EXCEPTION 'audit: %', v; END IF;

  RAISE NOTICE 'RUNBOOK A SIMULATION PASSED';
END $$;
```

### `qatar/ops/runbook_b/01_seed_live_table.sql`

```sql
-- Runbook B seed: a live Arabic dinner (started 30 min ago) with one locked table of 5 (u01..u05),
-- all checked in. Test data only. Requires 001_init.sql + seed_common.sql.
SET search_path = app, public;

INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, seats_sold, booking_opens_at, booking_closes_at, lock_at, reveal_at,
  check_in_opens_at, status)
VALUES ('00000000-0000-0000-0000-00000000f004', 'doh', 'dinner', 'ar', now() - interval '30 minutes', now() + interval '90 minutes',
  'مشيرب', 'Msheireb', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 6, 5,
  now() - interval '10 days', now() - interval '2 hours', now() - interval '24 hours 30 minutes',
  now() - interval '24 hours 30 minutes', now() - interval '60 minutes', 'in_progress');

INSERT INTO bookings (id, booking_ref, user_id, session_id, conversation_language, budget_tier_id, questionnaire_response_id,
                      status, price_minor, cancellation_policy_version, checked_in_at)
SELECT ('00000000-0000-0000-0000-0000000004' || lpad(g::text, 2, '0'))::uuid, 'RT-LVXZ' || chr(64 + g) || 'Q',
       ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000f004', 'ar',
       '00000000-0000-0000-0000-0000000000b2', ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       'checked_in', 5900, 'cxl-qa-1', now() - interval '35 minutes'
FROM generate_series(1, 5) g;

INSERT INTO matching_runs (id, session_id, mode, rule_version, questionnaire_version_id, algorithm, seed, inputs_hash,
                           result_summary, published_at)
VALUES ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-00000000f004', 'published', 'r1-interest',
        '00000000-0000-0000-0000-0000000000e1', 'interest_opt_v1', 20261023, repeat('0', 64), '{"tables":1}', now() - interval '2 days');
INSERT INTO event_tables (id, session_id, venue_id, table_code, status, venue_confirmed_at)
VALUES ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000c2',
        'T01', 'forming', now() - interval '1 day');
INSERT INTO table_assignments (booking_id, table_id, matching_run_id)
SELECT ('00000000-0000-0000-0000-0000000004' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000006b1',
       '00000000-0000-0000-0000-0000000005b1'
FROM generate_series(1, 5) g;
UPDATE event_tables SET status = 'locked', locked_at = now() - interval '24 hours 30 minutes'
 WHERE id = '00000000-0000-0000-0000-0000000006b1';

-- u02 also holds a future booking (S3 next week) that must be held by the suspension
SELECT sim.book_and_pay(2, '00000000-0000-0000-0000-00000000f003') IS NOT NULL AS future_booking_created;
```

### `qatar/ops/runbook_b/02_intake_s1.sql`

```sql
-- T+0: u01 submits a private report about u02 with immediate_danger = true (category threat_violence).
-- API: POST /v1/reports — reporter_user_id is taken from the JWT; reported_user_id is resolved server-side
-- from the tablemate seat the reporter picked (the client never sends a user_id).
-- Client: before and after submit, the "call 999" screen is shown (authorities first).
SET search_path = app, public;

INSERT INTO safety_reports (id, case_ref, reporter_user_id, reported_user_id, booking_id, table_id, category, timing,
                            immediate_danger, description_enc, severity, status, sla_due_at)
VALUES ('00000000-0000-0000-0000-0000000007c1', next_case_ref(),
        '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
        '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-0000000006b1',
        'threat_violence', 'during', true,
        '\x454e43525950544544'::bytea,           -- ciphertext produced by the app (KMS); never plaintext in SQL
        1, 'new', now() + interval '24 hours');

-- automatic interim measures (same transaction as intake)
INSERT INTO user_blocks (blocker_user_id, blocked_user_id, source, report_id)
VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'safety_case',
        '00000000-0000-0000-0000-0000000007c1');                     -- read as mutual via blocked_pairs
INSERT INTO report_actions (report_id, action, actor_id) VALUES
  ('00000000-0000-0000-0000-0000000007c1', 'interim_block', NULL),
  ('00000000-0000-0000-0000-0000000007c1', 'temporary_suspension', NULL);
UPDATE users SET status = 'suspended' WHERE id = '00000000-0000-0000-0000-000000000102';
-- a mutual connection between the two, if any, is removed silently
DELETE FROM connection_consents
 WHERE (from_user_id, to_user_id) IN (('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid),
                                      ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000101'::uuid));

INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT id, 'push', 'REPORT_RECEIVED', locale,
       jsonb_build_object('case', (SELECT case_ref FROM safety_reports WHERE id = '00000000-0000-0000-0000-0000000007c1'))
FROM users WHERE id = '00000000-0000-0000-0000-000000000101';

INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code) VALUES
  (NULL, 'report_intake',          'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'S1_immediate_danger'),
  (NULL, 'user_block_auto',        'user_blocks',    '00000000-0000-0000-0000-0000000007c1', 'safety_case'),
  (NULL, 'user_suspend_interim',   'users',          '00000000-0000-0000-0000-000000000102', 'S1_pending_review'),
  (NULL, 'coordinator_paged',      'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'push_and_sms');
```

### `qatar/ops/runbook_b/03_coordinator_and_triage.sql`

```sql
-- T+2 min: coordinator (ops a001) calls the venue day-of contact (masked dial-out), asks staff to assist,
-- offers the reporter a safe exit. Ops sees category + table only (no narrative):
SET search_path = app, public;
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'venue_contact_called', 'event_tables', '00000000-0000-0000-0000-0000000006b1', 'S1_assist'),
  ('00000000-0000-0000-0000-00000000a001', 'reporter_checkin',     'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'safe_exit_offered');

SELECT s.case_ref, s.category, s.severity, t.table_code, v.district_en, s.status   -- live board pin (ops view)
FROM safety_reports s JOIN event_tables t ON t.id = s.table_id JOIN venues v ON v.id = t.venue_id
WHERE s.status IN ('new','triaged','investigating');

-- T+10 min: T&S primary (a004) opens the case. Every P4 read is audited with a reason.
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a004', 'read_p4', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'case_triage');
UPDATE safety_reports SET status = 'triaged', assigned_to = '00000000-0000-0000-0000-00000000a004'
 WHERE id = '00000000-0000-0000-0000-0000000007c1';

-- pattern check: earlier cases about the same reported user (count only)
SELECT count(*) AS earlier_cases FROM safety_reports
WHERE reported_user_id = '00000000-0000-0000-0000-000000000102' AND id <> '00000000-0000-0000-0000-0000000007c1';

-- the suspended user's future bookings are held: matching skips them (account_active = false)
SELECT b.booking_ref, b.status, (SELECT status FROM users WHERE id = b.user_id) AS account
FROM bookings b JOIN event_sessions s ON s.id = b.session_id
WHERE b.user_id = '00000000-0000-0000-0000-000000000102' AND s.starts_at > now();

UPDATE safety_reports SET status = 'investigating' WHERE id = '00000000-0000-0000-0000-0000000007c1';
-- Step 4 "hear the other side" is skipped for S1 (risk); recorded:
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a004', 'reported_notice_deferred', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'S1_risk');
```

### `qatar/ops/runbook_b/04_decision_and_appeal.sql`

```sql
-- Within 24 h: decision. Confirmed S1 -> permanent ban (sanction ladder) with a second approver.
SET search_path = app, public;
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a005', 'read_p4', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'second_approval');

INSERT INTO report_actions (report_id, action, actor_id, second_approver, rationale_enc)
VALUES ('00000000-0000-0000-0000-0000000007c1', 'ban', '00000000-0000-0000-0000-00000000a004',
        '00000000-0000-0000-0000-00000000a005', '\x454e43525950544544'::bytea);
UPDATE report_actions SET effective_to = now()
 WHERE report_id = '00000000-0000-0000-0000-0000000007c1' AND action = 'temporary_suspension';
UPDATE users SET status = 'banned' WHERE id = '00000000-0000-0000-0000-000000000102';
UPDATE safety_reports SET status = 'actioned' WHERE id = '00000000-0000-0000-0000-0000000007c1';

-- held future bookings are cancelled by the organizer with a full refund (the banned user is not penalised twice
-- financially; refund approved by policy)
WITH c AS (
  UPDATE bookings b SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
         cancel_reason_code = 'account_banned'
  FROM event_sessions s
  WHERE s.id = b.session_id AND s.starts_at > now() AND b.user_id = '00000000-0000-0000-0000-000000000102'
    AND b.status IN ('payment_pending','paid_awaiting_group','group_locked','revealed')
  RETURNING b.id
)
INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
SELECT p.id, c.id, p.amount_minor, 'organizer_cancel', 'requested', 'ban-refund-' || c.id
FROM c JOIN payments p ON p.booking_id = c.id AND p.status = 'succeeded';

-- notices: reporter gets the generic outcome; the reported user gets the decision with category + appeal link,
-- never the reporter's identity
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT '00000000-0000-0000-0000-000000000101', 'push', 'REPORT_OUTCOME', 'ar',
       jsonb_build_object('case', case_ref) FROM safety_reports WHERE id = '00000000-0000-0000-0000-0000000007c1';
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT '00000000-0000-0000-0000-000000000102', 'email', 'CONDUCT_DECISION', 'ar',
       jsonb_build_object('case', s.case_ref, 'date', (SELECT starts_at FROM event_sessions WHERE id = '00000000-0000-0000-0000-00000000f004'),
                          'category', 'threat_violence', 'decision', 'ban', 'appeal_until', now() + interval '14 days')
FROM safety_reports s WHERE s.id = '00000000-0000-0000-0000-0000000007c1';
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code) VALUES
  ('00000000-0000-0000-0000-00000000a004', 'sanction_ban',  'users', '00000000-0000-0000-0000-000000000102', 'S1_confirmed'),
  ('00000000-0000-0000-0000-00000000a005', 'sanction_approve', 'report_actions', '00000000-0000-0000-0000-0000000007c1', 'second_approver');

-- Day +3: the reported user appeals (one appeal within 14 days)
UPDATE safety_reports SET status = 'appealed' WHERE id = '00000000-0000-0000-0000-0000000007c1';

-- the decider cannot review the appeal (guard raises APPEAL_REVIEWER_CONFLICT):
DO $$ BEGIN
  INSERT INTO app.report_actions (report_id, action, actor_id)
  VALUES ('00000000-0000-0000-0000-0000000007c1', 'appeal_rejected', '00000000-0000-0000-0000-00000000a004');
  RAISE EXCEPTION 'guard missing: decider reviewed own appeal';
EXCEPTION WHEN SQLSTATE 'P0051' THEN RAISE NOTICE 'appeal guard OK: decider refused';
END $$;

-- an independent reviewer (a006) decides; the decision is final
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a006', 'read_p4', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'appeal_review');
INSERT INTO report_actions (report_id, action, actor_id, rationale_enc)
VALUES ('00000000-0000-0000-0000-0000000007c1', 'appeal_rejected', '00000000-0000-0000-0000-00000000a006', '\x454e43525950544544'::bytea);
UPDATE safety_reports SET status = 'closed' WHERE id = '00000000-0000-0000-0000-0000000007c1';
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
VALUES ('00000000-0000-0000-0000-000000000102', 'email', 'APPEAL_DECISION', 'ar',
        jsonb_build_object('decision', 'upheld_ban'));
```

### `qatar/ops/runbook_b/99_verify.sql`

```sql
SET search_path = app, public;
DO $$
DECLARE v text; reporter uuid := '00000000-0000-0000-0000-000000000101'; reported uuid := '00000000-0000-0000-0000-000000000102';
BEGIN
  IF (SELECT case_ref FROM safety_reports WHERE id = '00000000-0000-0000-0000-0000000007c1') !~ '^TS-[0-9]{4}-0001$'
    THEN RAISE EXCEPTION 'case_ref format'; END IF;
  IF NOT EXISTS (SELECT 1 FROM blocked_pairs WHERE user_a = LEAST(reporter, reported) AND user_b = GREATEST(reporter, reported))
    THEN RAISE EXCEPTION 'mutual block missing'; END IF;
  IF (SELECT status FROM users WHERE id = reported) <> 'banned' THEN RAISE EXCEPTION 'reported user not banned'; END IF;
  SELECT string_agg(action::text, ',' ORDER BY action) INTO v FROM report_actions WHERE report_id = '00000000-0000-0000-0000-0000000007c1';
  IF v <> 'interim_block,temporary_suspension,ban,appeal_rejected' THEN RAISE EXCEPTION 'actions: %', v; END IF;
  IF EXISTS (SELECT 1 FROM report_actions WHERE action = 'temporary_suspension' AND effective_to IS NULL)
    THEN RAISE EXCEPTION 'temporary suspension not closed'; END IF;
  -- the reporter's identity never appears in anything sent to the reported user
  IF EXISTS (SELECT 1 FROM notifications_outbox WHERE user_id = reported
             AND (payload::text LIKE '%' || reporter::text || '%' OR payload::text ILIKE '%Tester A%'))
    THEN RAISE EXCEPTION 'reporter identity leaked'; END IF;
  -- every P4 read carries an actor and a reason (also enforced by CHECK)
  SELECT string_agg(reason_code, ',' ORDER BY reason_code) INTO v FROM audit_logs WHERE action = 'read_p4';
  IF v <> 'appeal_review,case_triage,second_approval' THEN RAISE EXCEPTION 'p4 reads: %', v; END IF;
  -- held future booking cancelled with a full refund requested
  IF NOT EXISTS (SELECT 1 FROM bookings b JOIN refunds r ON r.booking_id = b.id
                 WHERE b.user_id = reported AND b.cancel_reason_code = 'account_banned' AND r.amount_minor = 5900)
    THEN RAISE EXCEPTION 'future booking not released'; END IF;
  -- the matcher would exclude the banned user from any future pool
  IF EXISTS (SELECT 1 FROM json_array_elements(matching_input('00000000-0000-0000-0000-00000000f003')->'bookings') e
             WHERE e->>'user_id' = reported::text AND (e->>'account_active')::boolean)
    THEN RAISE EXCEPTION 'banned user still eligible'; END IF;
  SELECT string_agg(template_key, ',' ORDER BY template_key) INTO v FROM notifications_outbox
   WHERE template_key IN ('REPORT_RECEIVED','REPORT_OUTCOME','CONDUCT_DECISION','APPEAL_DECISION');
  IF v <> 'APPEAL_DECISION,CONDUCT_DECISION,REPORT_OUTCOME,REPORT_RECEIVED' THEN RAISE EXCEPTION 'notices: %', v; END IF;
  RAISE NOTICE 'RUNBOOK B SIMULATION PASSED';
END $$;
```

### `qatar/ops/runbook_a/run_simulation.sh`

```bash
#!/usr/bin/env bash
# Runbook A end-to-end simulation on a throwaway database.
# Usage: PGHOST=/tmp PGPORT=5433 PGUSER=app ./run_simulation.sh [dbname]
set -euo pipefail
DB="${1:-runbook_a_sim}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/001_init.sql"
"${PSQL[@]}" -1 -f "$ROOT/ops/seed_common.sql"
"${PSQL[@]}" -1 -f "$HERE/01_seed_bookings.sql"
# T-48h: matching publishes S1 and S2 (seeded, reproducible)
for S in 00000000-0000-0000-0000-00000000f001 00000000-0000-0000-0000-00000000f002; do
  "${PSQL[@]}" -At -c "SELECT app.matching_input('$S')" \
    | (cd "$ROOT/matching" && python3 publish_run.py --rule-version r1-interest --seed 20261023 --mode published) \
    | "${PSQL[@]}" -1
done
"${PSQL[@]}" -1 -f "$HERE/02_cancellations_t25.sql"
"${PSQL[@]}" -1 -f "$HERE/03_lock_t24.sql"
"${PSQL[@]}" -1 -f "$HERE/04_member_choices.sql"
"${PSQL[@]}" -1 -f "$HERE/05_after_deadline_refunds.sql"
"${PSQL[@]}" -1 -f "$HERE/99_verify.sql"
```

### `qatar/ops/runbook_b/run_simulation.sh`

```bash
#!/usr/bin/env bash
# Runbook B end-to-end simulation on a throwaway database.
# Usage: PGHOST=/tmp PGPORT=5433 PGUSER=app ./run_simulation.sh [dbname]
set -euo pipefail
DB="${1:-runbook_b_sim}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/001_init.sql"
"${PSQL[@]}" -1 -f "$ROOT/ops/seed_common.sql"
for f in 01_seed_live_table 02_intake_s1 03_coordinator_and_triage 04_decision_and_appeal 99_verify; do
  "${PSQL[@]}" -1 -f "$HERE/$f.sql"
done
```
