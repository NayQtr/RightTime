# Track 1 — Commercial, legal and compliance

## 1.1 Legal counsel briefing memo (gates O03 and O04)

> **To:** Qatar-qualified legal counsel (to be appointed)  
> **From:** Rightime product team  
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

Version `cxl-qa-1` — **48 h window approved by the product owner on 2026-10-23 as the [CONFIG] default; final wording pending legal sign-off (O04) [LEGAL]**. These strings go into `cancellation_policies.text_ar` / `text_en`, appear on SCR-05 before payment, and are stored on every booking (`cancellation_policy_version`). The numbers are the proposed config: `full_refund_until_hours = 48`, `late_cancel_refund_pct = 0`, `organizer_cancel_refund_pct = 100`, `no_show_fee_pct = 0`, choice window 48 h, quorum 4.

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
