# Qatar Social-Dining Platform — Phase 2 Completion Package (v0.3)

**Scope:** fills the five gaps left by *Phase 2 Deliverables v0.2*. Covers D14 (wireframes and UI states), D17 (data dictionary), D18 (API specification), D19 (admin panel and operations playbook) and D12 (customer journey map).
**Builds on:** Phase 1 Report v0.1 (22 Oct 2026), Phase 1 Workbook (v01/v02), Phase 2 Deliverables v0.2.
**Currency:** QAR. **Timezone:** `Asia/Qatar` (UTC+3, no DST). **Primary language:** Arabic (RTL); English (LTR) is the second supported language.

> **Status of this package.** This is an implementation-ready *specification*. It is not evidence that the market, price or matching works. Every operational number below that Phase 1 did not decide is marked **[CONFIG]**, with a proposed default where the team needs one to build. Phase 1 gates still apply before any real payment or meeting:
> - **O03 / R05:** a written classification of the business activity and its licensing.
> - **O04 / R03:** the Article 16 decision on special-nature data.
> - **O05:** written offers from venues and a qualified payment provider (PSP).
> - **A11:** licensing.
>
> Nothing here overrides those gates.

---

## 0. Conventions used throughout

| Item | Rule |
|---|---|
| IDs | `UUID` (v7 recommended for sortable keys). Public-facing booking references use a separate short code (`booking_ref`, e.g. `RT-7KQ4M2`). |
| Money | Integer **minor units**: 1 QAR = 100 dirham. Fields end with `_minor` plus `currency = 'QAR'`. Never use floats for money. |
| Time | Store `timestamptz` in UTC. Render in `Asia/Qatar`. API timestamps are ISO-8601 with offset. |
| Phone | E.164 (`+974XXXXXXXX`). Stored encrypted, plus a keyed hash for lookup. Never displayed to other users. |
| Locale | `ar` (default) / `en`. All user-facing strings exist in both. Arabic copy is primary; the English is a parity draft. Phase 1 Q-bank English is "مسودة تكافؤ", not an approved translation. |
| Question IDs | `Q01`–`Q08` keep the Phase 1 wording exactly (workbook sheet `أسئلة_أولية`). Every question and option is versioned; published options are immutable. |
| Evidence tags | `S`, `F`, `A`, `D`, `R`, `Q`, `O` identifiers refer to the Phase 1 workbook. |
| Table size | Capacity **6**; quorum **4 confirmed paid seats** (F02, A04). A table never forms below 4 and never exceeds venue capacity. |
| Hard constraints (never broken to fill seats) | Same session; a shared conversation language; venue within the declared food & drink budget cap; no blocked pairs; approved age eligibility; current consents (Phase 1 §7). |

### 0.1 Corrections to v0.2 applied in this package

| # | v0.2 statement | Problem | v0.3 rule |
|---|---|---|---|
| C1 | `POST /api/v1/bookings` body contains `"user_id"` | Client-supplied identity allows booking as another user. | User identity comes **only** from the access token. Body carries `session_id`, not `event_date`. See §3.5. |
| C2 | Budget bands fixed at "<100 / 100–200 / open" | Phase 1 (Q04, workbook) says bands are set **after venue offers**. | `budget_tiers` is a config table (§2.11); bands are published per city once O05 closes. The v0.2 bands may seed the config as a draft. |
| C3 | Tables "from 5 to 6" while the loop allows ≥4 | Internal inconsistency. | Capacity 6, quorum 4, target 6 (F02/A04). |
| C4 | Venue revealed 24 h before | Phase 1 F07: reveal timing is a hypothesis; area, price and access should be visible earlier. | Area (district), price band and accessibility summary are shown at booking. Name, address, map and table code are shown at `reveal_at` [CONFIG, default T-24h per v0.2], and **only after the table is locked**. See §1.3 and §4.4.1. |
| C5 | Personas "Ahmed" and "Sara" | Phase 1 forbids presenting personas as validated (D11 not run). | Used only as illustrative hypotheses in the journey map lens. No new personas are added. |
| C6 | Payment "QMP or Apple/Google Pay" | QMP confirms licensed PSPs exist; no PSP is selected yet (O05). | Hosted checkout of a licensed PSP; no card storage, no wallet, no holding funds for others. Wallet buttons only if the PSP offers them. |
| C7 | `matching_score` stored on the user | Matching scores belong to a run, not a person. Phase 1 requires logging rule/survey version and seed. | Stored per `matching_runs` / `table_assignments` and deleted after event feedback closes (keeps the v0.2 retention intent). |
| C8 | 400 for "event full" / "language conflict" | Different semantics. | `409 SESSION_FULL`, `422 LANGUAGE_CONFLICT`, with a stable `code` field (§3.1). |

### 0.2 About "Phase 9"

The supplied files do not enumerate the 13 phases referred to in the Phase 1 report. This package therefore treats **"Phase 9 – Admin Panel"** as the role-based operations panel described in Phase 1 §8 ("لوحة أدوار") and §11 (role access). It also covers the Operations Playbook deliverable **D19**, whose acceptance criterion is a simulation of overcrowding, cancellation and an incident. If Phase 9 has a different written scope, map §4 onto it.

### 0.3 Implementation order (suggested)

1. Data model (§2) and migrations.
2. Auth and registration API (§3.2).
3. Questionnaire versioning and submit (§3.3).
4. Sessions, booking and hosted payment with webhook (§3.5).
5. Matching job plus admin review (§4.2.2).
6. Event details with reveal gating (§3.4).
7. Admin modules (§4).
8. Feedback, connection consent and reports (§2.24–2.26).
9. Run the D19 simulations (§4.4) before the first paid table.

---

# 1. Visual & Interaction Design (UX/UI) — D14

## 1.0 Global rules every screen inherits

| Area | Specification |
|---|---|
| Layout | Mobile-first, designed at 360 px wide with a 16 px side gutter; max content width 560 px for forms and 1120 px for the dashboard grid. No horizontal scroll at any width. |
| Direction | `dir="rtl"` for `ar`, `dir="ltr"` for `en`. Use logical CSS properties (`margin-inline-start`, `padding-inline-end`). Mirror back arrows, progress direction and chevrons in RTL. Do **not** mirror the map, phone numbers, times, prices or brand marks. |
| Numbers | Arabic UI shows Western digits for prices, times and codes (matches local receipts and payment pages) [CONFIG `DIGIT_STYLE`]. Prices are always written as `59 ر.ق` / `QAR 59`. |
| Header | Logo (start side), language switch `EN` / `ع` (end side). Signed-in users also get an account menu. Height 56 px, sticky. |
| Buttons | **Primary**: filled, one per screen, full width on mobile, min 48 px tall. **Secondary**: outline. **Tertiary**: text link. Destructive actions use a red outline and always need a confirm step. |
| Inputs | Visible label above every field (WCAG 3.3.2), hint text below, error text below the hint in red with an icon. The error is linked by `aria-describedby`; focus moves to the first invalid field. |
| Feedback | Toasts for non-blocking success (`role="status"`). Inline banners for blocking errors (`role="alert"`). Never rely on colour alone. |
| Accessibility | WCAG 2.2 AA. Keyboard reachable; visible focus ring ≥ 3:1. Text resizable to 200 %. Touch targets ≥ 44×44 px. Accessible authentication (3.3.8): OTP field supports paste and `autocomplete="one-time-code"`, with no cognitive puzzle. Honour `prefers-reduced-motion` and `prefers-color-scheme`. |
| Privacy UI | Never show another user's phone, surname or photo. Tablemates appear as a count only until the event. No in-app group chat in this phase (R06). |
| Copy tone | Plain, warm, specific. No promise of friendship or "perfect match" (F01, R09). The fee is always shown as **separate** from food and drinks (F09). |

### 1.0.1 Booking status model (drives every card, banner and badge)

```text
payment_pending ──► paid_awaiting_group ──► group_locked ──► revealed ──► checked_in ──► completed
       │                   │                      │              │
       │                   ├──► waitlisted         │              └──► no_show (set by ops after event)
       │                   │                      │
       ├──► payment_failed  ├──► cancelled_by_user ┤
       │                   └──► cancelled_by_organizer (quorum fail / venue issue)
       └──► expired (checkout not completed in time)
Refund sub-state (on cancelled_* only): none | requested | processing | refunded | failed
```

| Status | Badge (ar / en) | Badge style |
|---|---|---|
| `payment_pending` | بانتظار الدفع / Awaiting payment | Neutral |
| `paid_awaiting_group` | جارٍ تكوين طاولتك / Forming your table | Info |
| `group_locked` | الطاولة مؤكدة / Table confirmed | Success |
| `revealed` | تم كشف المكان / Venue revealed | Success |
| `checked_in` | وصلت / You're here | Success |
| `completed` | انتهى اللقاء / Completed | Neutral |
| `waitlisted` | قائمة الانتظار / Waitlist | Warning |
| `cancelled_by_user` | ألغيتَ الحجز / You cancelled | Neutral |
| `cancelled_by_organizer` | أُلغي من قبلنا / Cancelled by us | Warning |
| `payment_failed` | تعذّر الدفع / Payment failed | Error |
| `expired` | انتهت مهلة الدفع / Payment expired | Neutral |

---

## 1.1 Screen inventory

| ID | Screen | Entry | Exit |
|---|---|---|---|
| SCR-01 | Onboarding (3 cards) | First open, signed out | SCR-02a |
| SCR-02a | Registration – phone | "Get started" | SCR-02b |
| SCR-02b | Registration – OTP | OTP sent | SCR-02c (new user) / SCR-06 (returning) |
| SCR-02c | Registration – eligibility & consents | OTP verified, new user | SCR-03 |
| SCR-03 | Questionnaire (card per question) | Registration done, or "Edit answers" | SCR-04 |
| SCR-04 | Choose experience and session | Questionnaire submitted | SCR-05 |
| SCR-05 | Booking summary and checkout | Session chosen | PSP hosted page → SCR-05P |
| SCR-05P | Payment processing (return from PSP) | PSP redirect | SCR-06 / payment error |
| SCR-06 | Dashboard (post-payment) | Payment confirmed or returning user | SCR-07 |
| SCR-07 | Event details | Tap event card | Cancel flow, report, feedback |
| SCR-08 | Cancellation flow | "Cancel booking" | SCR-06 |
| SCR-09 | Post-event feedback | Push or banner after end time | SCR-06 |
| SCR-10 | Private report | "Report" (SCR-07, SCR-09, menu) | Confirmation |

---

## 1.2 Text wireframes (top → bottom)

Each table lists components in visual order. "Type" uses the component names the design system must provide.

### SCR-01 — Onboarding

| # | Component | Type | Content (ar / en) | Behaviour |
|---|---|---|---|---|
| 1 | Header | Top bar | Logo · language switch | Switch toggles `ar` ↔ `en` and persists in `localStorage` + `users.locale` after sign-in. |
| 2 | Card carousel (3 cards) | Swipeable cards + pager dots | **Card 1** — `طاولة صغيرة، وجوه جديدة` / *A small table, new faces*. Body: `نختار لك موعدًا ومكانًا ومجموعة من 4 إلى 6 أشخاص.` / *We pick the time, the place and a group of 4–6.* | Swipe or arrow buttons. Pager dots are `role="tablist"`. Auto-advance **off**. |
| | | | **Card 2** — `بلا تمرير صور` / *No photo swiping*. Body: `لا ملفات عامة ولا أرقام هواتف ظاهرة. تتعارفون على الطاولة.` / *No public profiles, no visible phone numbers. You meet at the table.* | |
| | | | **Card 3** — `السعر واضح قبل الدفع` / *Clear price before you pay*. Body: `تدفع رسم التنظيم هنا، وتدفع طعامك وشرابك للمكان مباشرة.` / *You pay the organising fee here; food and drinks are paid to the venue directly.* | |
| 3 | Primary button | Button | `ابدأ` / *Get started* | → SCR-02a |
| 4 | Text link | Link | `لديّ حساب — تسجيل الدخول` / *I have an account — Sign in* | → SCR-02a (same flow, OTP decides new vs returning) |
| 5 | Footer links | Links row | Terms · Privacy · Community conduct | Opens in-app pages. |

### SCR-02a — Registration: phone number

| # | Component | Type | Content | Behaviour / validation |
|---|---|---|---|---|
| 1 | Back + progress | Top bar + step indicator `1 / 3` | — | Back → SCR-01. |
| 2 | Title | H1 | `ما رقم هاتفك؟` / *What's your phone number?* | |
| 3 | Helper | Paragraph | `نستخدمه لتسجيل الدخول فقط. لن يظهر لأي مستخدم آخر.` / *Used only to sign you in. Never shown to other users.* | |
| 4 | Country code | Dropdown (read-only in MVP) | `+974 قطر` | List driven by [CONFIG `ALLOWED_PHONE_COUNTRIES`], proposed default `["QA"]`. |
| 5 | Phone | Text input `type="tel"`, `inputmode="numeric"`, `autocomplete="tel-national"` | Label `رقم الهاتف` / *Phone number* | 8 digits for +974. Strip spaces. Inline error `أدخل رقمًا قطريًا من 8 أرقام` / *Enter an 8-digit Qatari number*. |
| 6 | Primary button | Button | `أرسل رمز التحقق` / *Send code* | Disabled until valid. Shows spinner while calling `POST /auth/otp:request`. |
| 7 | Legal line | Small text | `بالمتابعة توافق على [الشروط] و[إشعار الخصوصية].` | Links open sheets. Not a consent capture (that happens on SCR-02c). |

### SCR-02b — Registration: OTP

| # | Component | Type | Content | Behaviour / validation |
|---|---|---|---|---|
| 1 | Back + progress `2 / 3` | Top bar | — | Back keeps the typed phone. |
| 2 | Title | H1 | `أدخل الرمز` / *Enter the code* | |
| 3 | Sent-to line | Paragraph | `أرسلنا رمزًا من 6 أرقام إلى ‎+974 •••• 1234‎` + link `تغيير الرقم` | Mask the middle digits. Wrap the number in an LTR isolate. |
| 4 | OTP | Single input, 6 digits, `autocomplete="one-time-code"` | Label `رمز التحقق` | Auto-submits at 6 digits. Paste supported. Errors in §1.3.3. |
| 5 | Resend | Text button with countdown | `إعادة الإرسال بعد 0:45` → `إعادة إرسال الرمز` | Countdown from `resend_after` in the API response. |
| 6 | Primary button | Button | `تحقّق` / *Verify* | Hidden when auto-submit is on, but kept for keyboard and screen-reader users. |

### SCR-02c — Registration: eligibility & consents (new users only)

| # | Component | Type | Content | Behaviour / validation |
|---|---|---|---|---|
| 1 | Progress `3 / 3` | Step indicator | — | |
| 2 | Title | H1 | `قبل أن نبدأ` / *Before we start* | |
| 3 | Display name (optional) | Text input, max 30 chars | Label `الاسم الذي تحب أن نناديك به (اختياري)` / *What should we call you? (optional)* · hint `يظهر لزملاء الطاولة يوم اللقاء فقط.` / *Shown only to your tablemates on the day.* | Letters, spaces, hyphen. No surname needed. |
| 4 | Age eligibility | Checkbox (required) | `أؤكد أن عمري {MIN_AGE} سنة أو أكثر.` / *I confirm I am {MIN_AGE} or older.* | `{MIN_AGE}` = [CONFIG, legal to set]. **No date of birth is collected** (Phase 1 §6). |
| 5 | Terms & community conduct | Checkbox (required) | `أوافق على [الشروط] و[قواعد السلوك] (لا تحرش، لا ملاحقة، لا تصوير دون موافقة).` | Stores consent type `terms` + `conduct` with document versions. |
| 6 | Privacy notice | Checkbox (required) | `قرأت [إشعار الخصوصية] وأفهم كيف تُستخدم إجاباتي لتكوين الطاولات.` | Consent type `privacy_notice` (Art. 9: information on purposes). |
| 7 | Marketing (optional) | Toggle, default **off** | `أرسلوا لي مواعيد جديدة وعروضًا.` / *Send me new dates and offers.* | Separate prior consent for direct e-marketing (Art. 22). Never pre-ticked. |
| 8 | Primary button | Button | `متابعة` / *Continue* | Enabled when 4, 5 and 6 are checked. Calls `POST /users/me/registration`. |

### SCR-03 — Questionnaire (one question per card)

Shared card layout, top to bottom:

| # | Component | Type | Content / behaviour |
|---|---|---|---|
| 1 | Top bar | Back (previous card) · `إغلاق وحفظ` *Save & exit* | Back keeps answers. Save & exit stores a draft (`status: draft`). |
| 2 | Progress | `role="progressbar"` with `aria-valuenow` | Counts only the questions in this flow (6 profile questions, see below). |
| 3 | Section eyebrow | Small caps text | e.g. `اللغة` / *Language* |
| 4 | Question | H1 | Exact Phase 1 wording (below). |
| 5 | Why we ask | Collapsible "ⓘ لماذا نسأل؟" | Short purpose line taken from the Phase 1 "الغرض" column. Mandatory for every question (Phase 1 §6: each question needs a stated purpose). |
| 6 | Options | Radio group or checkbox group as native inputs, styled as 56 px tiles | Single-choice auto-advances after 400 ms. Multi-choice requires `التالي`. |
| 7 | Required/optional chip | Chip | `مطلوب` / `اختياري` |
| 8 | Primary button | `التالي` / *Next* (last card: `حفظ الإجابات` / *Save answers*) | Disabled on required cards until answered. |
| 9 | Skip | Text button, optional cards only | `تخطّي` / *Skip* — skipping never lowers the user's chances (Q05 rule: "لا استبعاد بسبب نقص الإجابة"). |

**Card order and content.** Profile questions are answered here once and edited later. Booking questions Q02 and Q03 are asked per booking on SCR-04, because they depend on live sessions.

| Card | ID | Question (ar exactly / en parity draft) | Control | Options (ar / en) | Required |
|---|---|---|---|---|---|
| 1 | Q01 | ما اللغة التي ترتاح لإجراء محادثة جماعية كاملة بها؟ / *In which language can you comfortably hold a full group conversation?* | Checkbox group (multi) | العربية / Arabic · الإنجليزية / English · لغة أخرى / Another language | Yes |
| 2 | Q04 | ما الحد الأعلى المناسب لإنفاقك على الطعام والمشروبات، بخلاف رسم الخدمة الظاهر؟ / *What is your maximum food and drink budget, excluding the displayed service fee?* | Radio | Bands from `budget_tiers` (§2.11) | Yes (only if >1 tier is published, else hidden) |
| 3 | Q05 | اختر حتى ثلاثة موضوعات تستمتع بالحديث عنها. / *Choose up to three topics you enjoy discussing.* | Checkbox, max 3 | طعام · سفر · رياضة · كتب وثقافة · هوايات إبداعية · تقنية · لا تفضيل | No |
| 4 | Q06 | ما الذي يساعدك على المشاركة براحة في لقاء أول؟ / *What helps you participate comfortably in a first meeting?* | Checkbox | سؤال افتتاحي · نشاط بسيط · مساحة لحوار عفوي · إتاحة الدور للجميع · لا تفضيل | No |
| 5 | Q07 | هل تحتاج إلى ترتيب عملي في المكان أو الوجبة لإتمام الحجز؟ / *Do you need a practical venue or meal arrangement to complete your booking?* | Radio | لا · أرغب في تواصل خاص بشأن ترتيب عملي | No |
| 6 | Q08 | كيف تفضل إتاحة التواصل بعد اللقاء؟ / *How would you like contact to be enabled after the event?* | Radio, default `لا مشاركة` | لا مشاركة · تواصل بعد موافقة متبادلة | No |

Card-specific rules:
- **Q01:** if `لغة أخرى` is the only selection, show the inline note `نُنظّم حاليًا طاولات بالعربية والإنجليزية فقط؛ سنحفظ لغتك لنعلمك إن توفرت.` / *We currently run Arabic and English tables only; we'll save your language and tell you if that changes.* Continue is allowed, but SCR-04 will show the language-conflict state (§1.3.4).
- **Q05 / Q06:** `لا تفضيل` is exclusive. Selecting it clears the others, and selecting any other option clears it.
- **Q07 = "private contact":** there is **no free-text field**. On submit, a private ops case is created (`support_cases`, §2.27), and the user sees `سيتواصل معك فريقنا بشكل خاص قبل اللقاء.` / *Our team will contact you privately before the event.* Detail collection stays off until the Article 16 decision (O04).
- Summary card after the last question: list of answers with `تعديل` links. Then `حفظ الإجابات` calls `POST /questionnaire-responses`.

### SCR-04 — Choose experience and session (booking questions Q03 + Q02)

| # | Component | Type | Content | Behaviour |
|---|---|---|---|---|
| 1 | Title | H1 | `اختر تجربتك` / *Choose your experience* | |
| 2 | Experience (Q03) | Segmented radio | `قهوة جماعية` / *Group coffee* · `عشاء جماعي` / *Group dinner* (only formats with published sessions) | Q03 wording shown as the group label: `أي تجربة تفضل من الخيارات المتاحة؟` |
| 3 | Language filter | Read-only chip row | `طاولات بالعربية` / `English tables`, derived from Q01 | Only sessions whose `conversation_language` ∈ Q01 answers are listed. |
| 4 | Sessions list (Q02) | Radio cards (primary choice) | Each card: date & time (`الخميس 5 نوفمبر · 7:30 م`), district (`لوسيل`), price band of venue (`طعام عادة {food_band} ر.ق`, from the venue menu), accessibility icons, seats status (`متاح` / `آخر المقاعد` / `ممتلئ – انضم للانتظار`), service fee | Max 2 sessions published at a time (R02). Full sessions show a waitlist CTA instead of a radio. |
| 5 | Alternates (Q02 multi) | Checkbox list | `مواعيد أخرى أستطيع حضورها إن لزم الأمر (اختياري)` / *Other sessions I could attend if needed (optional)* | Used **only** to offer a rebooking if quorum fails. Never an automatic move (§4.4.1). |
| 6 | Price summary strip | Sticky bottom bar | `رسم التنظيم 59 ر.ق · الطعام يُدفع للمكان` | The fee comes from `price_plans` [CONFIG]; 59 is the Phase 1 "أساسي" sensitivity value used as a placeholder. |
| 7 | Primary button | Button | `متابعة للدفع` / *Continue to payment* | Calls `POST /bookings` (creates seat hold) → SCR-05. |

### SCR-05 — Booking summary and checkout

| # | Component | Type | Content |
|---|---|---|---|
| 1 | Title | H1 | `راجع حجزك` / *Review your booking* |
| 2 | Summary card | Description list | Experience · date & time · district · table language · group size `4–6 أشخاص` |
| 3 | Price breakdown | Table | `رسم التنظيم (يُدفع الآن)` **59 ر.ق** · `الطعام والمشروبات (تُدفع للمكان)` `عادة {food_band} ر.ق حسب طلبك` · `الإجمالي المتوقع` *range*. Builds the "total expected price" from F09. |
| 4 | Policy box | Info banner | Cancellation rule text rendered from `cancellation_policies` (§2.14): `يمكنك الإلغاء مع استرداد كامل حتى {deadline}. إذا لم تكتمل الطاولة نُلغيها ونرد المبلغ كاملًا أو ننقلك لموعد آخر باختيارك.` |
| 5 | Hold timer | Inline text | `نحجز مقعدك لمدة 10:00 دقائق` [CONFIG `SEAT_HOLD_MINUTES`, proposed 10] |
| 6 | Primary button | Button | `ادفع 59 ر.ق` / *Pay QAR 59* → redirect to PSP hosted checkout (`checkout_url`) |
| 7 | Secondary | Text link | `تغيير الموعد` / *Change session* (releases the hold) |

### SCR-06 — Dashboard (post-payment)

| # | Component | Type | Content | Behaviour |
|---|---|---|---|---|
| 1 | Header | Top bar | Logo · account menu (Profile, My answers, Help, Sign out) | |
| 2 | Greeting | H1 | `أهلًا {display_name}` / *Hi {name}* (falls back to `أهلًا بك`) | |
| 3 | Next event card | Card (hero) | Badge (status) · experience · date/time · district · **countdown** `بعد 2 يوم 4 ساعات` · status line (see table below) · primary action | Tap → SCR-07. Countdown uses `aria-live="off"` and updates every minute. |
| 4 | Timeline | Horizontal stepper (vertical on <360 px) | `تم الدفع` → `تكوين الطاولة` → `تأكيد الطاولة` → `كشف المكان` → `يوم اللقاء` | Current step highlighted; future steps show their expected time (`كشف المكان: الأربعاء 7:30 م`). |
| 5 | Action banners | Banner stack (0–2) | e.g. payment issue, waitlist offer, rebook offer, feedback request | Highest severity first. |
| 6 | Other bookings | List | Upcoming and past bookings with badge | |
| 7 | Book another | Secondary button | `احجز موعدًا آخر` / *Book another session* | → SCR-04 |
| 8 | Safety & help | Footer card | `تحتاج مساعدة؟ تواصل مع المنسق المناوب` · `قواعد السلوك` | Opens in-app support (not phone numbers). |

Hero card content per status:

| Status | Status line (ar / en) | Primary action |
|---|---|---|
| `paid_awaiting_group` | `نجمع طاولتك الآن. نؤكد لك قبل {lock_at}.` / *We're forming your table. We'll confirm by {lock_at}.* | `عرض التفاصيل` |
| `group_locked` | `طاولتك مكتملة ({n} أشخاص). نكشف المكان في {reveal_at}.` | `عرض التفاصيل` |
| `revealed` | `المكان: {venue_name} · {district}` | `الاتجاهات` (opens map) |
| day-of, after `check_in_opens_at` | `هل وصلت؟` | `أنا هنا` (check-in) |
| `completed` | `كيف كانت التجربة؟` | `قيّم اللقاء` → SCR-09 |
| `waitlisted` | `أنت في قائمة الانتظار. سنخبرك فور توفر مقعد.` | `الخروج من القائمة` |
| `cancelled_by_organizer` | `ألغينا هذه الطاولة. اختر: استرداد أو موعد آخر.` | `اختر الآن` → SCR-08b |

### SCR-07 — Event details

Rendered from `GET /bookings/{id}/event-details` (§3.4). Sections appear or disappear according to `reveal.phase`.

| # | Component | Visible from | Content |
|---|---|---|---|
| 1 | Back + title | always | `تفاصيل اللقاء` / *Event details* |
| 2 | Status badge + countdown | always | as SCR-06 |
| 3 | Essentials list | always | Experience · date & time with `Asia/Qatar` label · table language · district · venue price band · accessibility summary (`مدخل بلا درج`, `هادئ نسبيًا`) |
| 4 | Your table | `group_locked` | `{n} أشخاص مؤكدون` (count only; no names) · `نصيحة: قدّم نفسك باسمك الأول.` |
| 5 | Venue block | `revealed` | Venue name (H2) · address (copy button) · embedded **mini map** (static map image + `فتح في الخرائط` button) · `تعليمات الوصول` text · **table code** in large monospace (`طاولة RT-24`) · `اذكر "Rightime" ورمز الطاولة لموظف الاستقبال.` |
| 6 | Bill reminder | `revealed` | `تدفع طعامك وشرابك للمكان مباشرة. لا يوجد حد أدنى للطلب من جهتنا.` *(the second sentence only if the venue contract confirms "no minimum spend" — A06)* |
| 7 | Check-in | day-of, from `check_in_opens_at` [CONFIG, proposed T-60 min] until end | Primary button `أنا هنا` / *I'm here*. After a tap: `تم تسجيل وصولك` |
| 8 | Support | always (prominent on day-of) | `تواصل مع المنسق المناوب` (in-app chat or call-back request) · `إبلاغ خاص` (→ SCR-10) |
| 9 | Policy & actions | until cancellation deadline | `إلغاء الحجز` (secondary, destructive) → SCR-08a · policy text with deadline |
| 10 | After event | `completed` | `قيّم اللقاء` · `التواصل بعد اللقاء` (mutual-consent picker, §2.25) |

---

## 1.3 Edge-case screens

### 1.3.1 Loading — payment processing (SCR-05P)

The user returns from the PSP before or after the webhook arrives. The client polls `GET /bookings/{id}` every 2 s for up to 60 s [CONFIG], then every 10 s for up to 10 min.

| Phase | Trigger | Screen content (ar / en) | Controls |
|---|---|---|---|
| P1 Redirecting out | Tap "Pay" | Full-screen spinner: `ننقلك إلى صفحة الدفع الآمنة…` / *Taking you to the secure payment page…* | none (≤ 3 s) |
| P2 Confirming | Return URL hit, status still `payment_pending` | Spinner + `نتأكد من الدفع مع البنك… لا تغلق الصفحة ولا تدفع مرة أخرى.` / *Confirming with your bank… Please don't close this page or pay again.* | none |
| P3 Slow confirm | > 60 s without final status | Illustration + `الدفع يستغرق وقتًا أطول من المعتاد. سنرسل لك إشعارًا فور التأكيد. لن تُخصم مرتين.` / *This is taking longer than usual. We'll notify you when it's confirmed. You won't be charged twice.* | `العودة إلى الرئيسية` (dashboard shows the "payment confirming" banner) |
| P4 Success | `paid_awaiting_group` | Check animation (static if reduced motion) + `تم الدفع. نجمع طاولتك الآن.` + receipt line `رقم الحجز RT-7KQ4M2` | `الذهاب إلى لوحتي` |

Rules: the **Pay** button is disabled while a payment intent is open. The server enforces idempotency per booking (§3.5), so a double tap cannot charge twice (R07).

### 1.3.2 Loading — matching ("forming your table")

| Phase | System state | Dashboard card / SCR-07 content |
|---|---|---|
| M1 | Paid, before matching run | `نجمع طاولتك الآن` + stepper at step 2. Sub-text: `نكوّن طاولات من 4 إلى 6 أشخاص يتحدثون لغة طاولتك ضمن ميزانيتك.` |
| M2 | Matching run in progress (admin "dry run" or job running) | Same as M1 (internal runs are not exposed). |
| M3 | Table locked (≥ 4) | `طاولتك مؤكدة ({n} أشخاص)` + `نكشف المكان في {reveal_at}` |
| M4 | Waiting for reveal time | Countdown to reveal; skeleton block where the venue will appear (`سيظهر هنا اسم المكان والخريطة`) |
| M5 | Below quorum at the check | Card switches to the organizer-cancellation state (§1.3.5 C3). |

Skeletons are grey blocks with a subtle shimmer (shimmer disabled under reduced motion). Never show a fake progress percentage.

### 1.3.3 Error states

| ID | Case | Where | Message (ar / en) | Recovery |
|---|---|---|---|---|
| E-PAY-1 | Card declined (`payment_failed`, reason `declined`) | SCR-05P / dashboard banner | `رفض البنك عملية الدفع. لم يُخصم أي مبلغ.` / *Your bank declined the payment. You weren't charged.* | `حاول مرة أخرى` (new attempt on same hold if not expired) · `استخدم وسيلة أخرى` |
| E-PAY-2 | 3-D Secure abandoned / cancelled at PSP | SCR-05 | `لم يكتمل الدفع.` / *Payment wasn't completed.* | `ادفع الآن` while hold active; else E-PAY-4 |
| E-PAY-3 | Unknown result (timeout) | SCR-05P P3 | see P3 | Webhook decides; the reconciliation job resolves within [CONFIG] 15 min. |
| E-PAY-4 | Seat hold expired before payment | SCR-05 | `انتهت مدة حجز المقعد. المقاعد قد تكون تغيّرت.` / *Your seat hold expired. Availability may have changed.* | `اختر الموعد من جديد` → SCR-04 |
| E-PAY-5 | Paid but seat no longer available (race after hold expiry) | Dashboard banner | `تم الدفع لكن المقعد لم يعد متاحًا. أعدنا المبلغ كاملًا تلقائيًا.` / *Payment went through but the seat was gone. We refunded you in full automatically.* | `اختر موعدًا آخر` · refund tracker |
| E-FULL-1 | Session full when selecting | SCR-04 card | `ممتلئ` badge; CTA `انضم لقائمة الانتظار` / *Join the waitlist* | Waitlist (no payment taken) |
| E-FULL-2 | Session filled while user was on SCR-04 | Inline alert after `POST /bookings` → 409 | `امتلأ هذا الموعد للتو.` / *This session just filled up.* | Highlights next available session; waitlist option |
| E-LANG-1 | No published session matches Q01 languages | SCR-04 | `لا توجد حاليًا مواعيد بلغة تختارها. نُنظّم طاولات بالعربية والإنجليزية فقط.` | `عدّل لغاتك` (→ Q01) · `أعلمني عند توفر موعد` (notify-me, marketing-consent independent) |
| E-LANG-2 | User removes a language after booking a table in that language | Profile save | Blocking dialog: `لديك حجز قادم بالإنجليزية. إزالة الإنجليزية لن تلغي الحجز، لكن لن تُعرض عليك طاولات إنجليزية لاحقًا.` | `متابعة` / `تراجع`. The existing booking keeps its table language. |
| E-LANG-3 | Client sends a session whose language ∉ Q01 (tampered or stale) | API 422 `LANGUAGE_CONFLICT` | `هذا الموعد بلغة لم تخترها في إجاباتك.` | Link to update Q01 or choose another session |
| E-OTP-1 | Wrong code | SCR-02b | `الرمز غير صحيح. تبقّى {n} محاولات.` | Clear field, focus it |
| E-OTP-2 | Code expired | SCR-02b | `انتهت صلاحية الرمز.` | `أرسل رمزًا جديدًا` |
| E-OTP-3 | Too many requests | SCR-02a/b | `محاولات كثيرة. حاول بعد {mm:ss}.` | Countdown from `Retry-After` |
| E-NET | Offline / 5xx | Any | Banner `تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا.` | `إعادة المحاولة`. Forms keep their input. |
| E-AUTH | Session expired | Any | Sheet `انتهت جلستك. سجّل الدخول للمتابعة.` | Re-auth via OTP, then return to the same screen |

### 1.3.4 Language-selection conflict — decision table

| Q01 answer | Published sessions | Result |
|---|---|---|
| Arabic only | AR sessions exist | List AR sessions |
| English only | EN sessions exist | List EN sessions |
| Arabic + English | both | List both, grouped by language; each card labelled with its table language |
| Arabic + English | one language only | List that language; no warning |
| Another language only | — | E-LANG-1 + notify-me |
| Any | none in chosen languages | E-LANG-1 |

No table ever mixes conversation languages, and choosing two languages never promises a bilingual table (F04).

### 1.3.5 Cancellation states (SCR-08)

**SCR-08a — user-initiated cancellation**

| # | Component | Content |
|---|---|---|
| 1 | Title | `إلغاء الحجز` / *Cancel booking* |
| 2 | Booking recap | session, district |
| 3 | Outcome panel (computed by server from policy + time) | **Before deadline:** `ستسترد 59 ر.ق كاملة إلى بطاقتك خلال {refund_days} أيام عمل.` **After deadline:** `انتهت مهلة الاسترداد ({deadline}). لن يُرد رسم التنظيم.` (exact rule from `cancellation_policies`; values legally reviewed before launch; Timeleft's 35 % no-show fee is **not** copied — F11). |
| 4 | Reason (optional) | Radio: `تغيّر جدولي` · `مرض` · `سبب آخر` (no free text) |
| 5 | Alternative | Secondary button `انقلني لموعد آخر بدلًا من الإلغاء` (shown if an eligible session with seats exists) |
| 6 | Destructive confirm | `تأكيد الإلغاء` (red outline) → result screen |
| 7 | Result | `تم إلغاء حجزك.` + refund tracker (if refundable) |

**SCR-08b — organizer cancellation (quorum not reached / venue issue)**

| # | Component | Content |
|---|---|---|
| 1 | Title | `نعتذر، لم تكتمل طاولتك` / *Sorry, your table didn't fill* |
| 2 | Explanation | `لم يكتمل الحد الأدنى (4 أشخاص) لهذا الموعد، لذلك ألغينا الطاولة. لا تتحمل أي رسوم.` |
| 3 | Choice cards (radio) | **A. موعد آخر** — lists eligible alternates (Q02 alternates first), each with date, district and seats; `ننقل رسمك كما هو.` · **B. استرداد كامل** — `59 ر.ق إلى وسيلة الدفع الأصلية خلال {refund_days} أيام عمل.` |
| 4 | Default if no choice | `إن لم تختر قبل {choice_deadline} سنرد المبلغ كاملًا تلقائيًا.` [CONFIG `REBOOK_CHOICE_HOURS`, proposed 48] |
| 5 | Primary button | `تأكيد اختياري` |

**Refund tracker (component used on SCR-06/07/08)**

| Refund state | Label (ar / en) | Detail line |
|---|---|---|
| `requested` | تم طلب الاسترداد / Refund requested | `{date}` |
| `processing` | قيد المعالجة / Processing | `قد يستغرق ظهوره في حسابك {refund_days} أيام عمل` |
| `refunded` | تم الاسترداد / Refunded | `59 ر.ق · مرجع {psp_refund_ref}` |
| `failed` | تعذّر الاسترداد / Refund failed | `سيتواصل معك فريقنا خلال يوم عمل.` + support link (creates a finance task automatically) |

### 1.3.6 Post-event and report screens (needed by §2 and §4)

**SCR-09 — feedback.** Overall rating 1–5 stars (`كيف كانت التجربة؟`) and comfort rating 1–5 (`هل شعرت بالراحة في الحوار؟`). These map to the Phase 1 KPI "راحة وحوار", rating 4–5. Venue rating 1–5, and an optional private comment (500 chars, `لن يراه أحد من الطاولة`). Then the Q08-based contact picker per tablemate, using *first names only, shown after the event*: `أرغب بالتواصل` / `لا`. A match is created only when both sides choose yes. A prominent link to `إبلاغ خاص` is kept separate from the stars, because reports are never inferred from low ratings.

**SCR-10 — private report.**
1. Category radio: تحرش أو سلوك غير لائق · تهديد أو عنف · تصوير دون موافقة · ملاحقة أو تواصل غير مرغوب · احتيال أو طلب مال · سلوك مزعج آخر.
2. When: `أثناء اللقاء` / `بعده`.
3. Who: tablemate picker, first names from this table only, plus "غير متأكد".
4. Description (2,000 chars, optional).
5. Toggle `هل أنت في خطر الآن؟`. If yes, a full-screen notice `اتصل بالطوارئ 999 فورًا` with a call button, then an in-app ping to the on-call coordinator.
6. Submit, then the confirmation `وصلنا بلاغك. لن نكشف هويتك للشخص المُبلَّغ عنه.`, plus an automatic block from future tables (§4.4.2).

---

# 2. Data Engineering — Comprehensive Data Dictionary (D17)

**Engine:** PostgreSQL 15+ (as proposed in v0.2). It is one relational database inside a modular monolith (Phase 1 §8). **Identity is separated from preferences:** `users` holds who someone is, `questionnaire_responses` / `answers` hold what they prefer, and analysts only receive pseudonymous IDs.

## 2.0 Privacy classes used in the "Privacy" column

| Class | Meaning | Who can read (default role grants, see §4.0) |
|---|---|---|
| **P0 Public** | Shown to any visitor | Everyone |
| **P1 Internal** | Operational, not personal | All staff roles |
| **P2 Personal** | Identifies or relates to a person | Ops (need-to-know), the user themself |
| **P3 Confidential** | Personal *and* sensitive in context (contact data, payments, preferences used for matching) | Named roles only; encrypted at rest; never in logs or analytics |
| **P4 Restricted / Art. 16** | Potential *special-nature* data (health, beliefs, marital status, ethnic origin) or safety cases | Trust & Safety or Legal only; collection **disabled** until O04 is decided; access audited per read |

**Retention.** Phase 1 sets no fixed durations for Qatar. Each field references a retention rule `RET-xx` defined in the retention policy (§2.31). Durations marked [LEGAL] are to be set by counsel.

**Global columns** on every table, not repeated below: `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL`, and, where noted, `deleted_at timestamptz NULL` (soft delete).

---

## 2.1 `users` — account identity

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Internal user ID | Yes | — | P1 internal key; never shown in UI |
| phone_e164_enc | bytea | Phone number, AES-256-GCM encrypted (envelope key in KMS) | Yes | — | **P3**; decrypted only for OTP and ops call-backs; RET-01 |
| phone_lookup_hash | char(64) UNIQUE | HMAC-SHA256(phone, pepper) for login lookup and duplicate detection | Yes | — | P3; replaces v0.2 `phone_hash` (keyed, not plain hash) |
| display_name | varchar(30) | First name or nickname chosen by the user | No | — | P2; shown to tablemates on event day only; RET-01 |
| locale | varchar(2) | `ar` \| `en` | Yes | — | P1 |
| age_eligibility_confirmed_at | timestamptz | Moment the user attested meeting `{MIN_AGE}` | Yes | — | P2; no birth date stored (Phase 1 §6) |
| status | user_status enum | `active` \| `suspended` \| `banned` \| `deletion_requested` \| `deleted` | Yes | — | P2; visible to ops |
| registration_completed_at | timestamptz | Consents + eligibility done | No | — | P1 |
| last_login_at | timestamptz | Last successful OTP verify | No | — | P2; RET-02 |
| deleted_at | timestamptz | Soft-delete timestamp; triggers anonymisation job | No | — | — |

## 2.2 `user_consents` — consent ledger (append-only)

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Row ID | Yes | — | P1 |
| user_id | uuid | Consenting user | Yes | → users.id | P2 |
| consent_type | consent_type enum | `terms` \| `conduct` \| `privacy_notice` \| `marketing` \| `contact_after_event` \| `special_data` (disabled until O04) | Yes | — | P2 |
| document_version | varchar(20) | Version of the text agreed to (e.g. `terms-2026-11`) | Yes | → legal_documents.version | P1 |
| granted | boolean | true = given, false = withdrawn | Yes | — | P2 |
| recorded_at | timestamptz | When given or withdrawn | Yes | — | P2; proof of consent (Art. 4/5); RET-03 |
| source | varchar(20) | `app_web` \| `app_ios` \| `app_android` \| `admin` | Yes | — | P1 |
| ip_trunc | inet | IP truncated to /24 (v4) or /48 (v6) for evidence | No | — | P2; RET-03 |

Current consent = latest row per `(user_id, consent_type)`. Rows are never updated or deleted while the account exists.

## 2.3 `otp_challenges` — authentication (short-lived)

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Challenge ID returned to client | Yes | — | P1 |
| phone_lookup_hash | char(64) | Target phone (hash only) | Yes | — | P3 |
| code_hash | char(60) | bcrypt of the 6-digit code | Yes | — | P3; plaintext never stored |
| attempts | smallint | Failed verifies so far (max [CONFIG] 5) | Yes | — | P1 |
| expires_at | timestamptz | Issued + [CONFIG] 5 min | Yes | — | P1 |
| consumed_at | timestamptz | Set on success | No | — | P1 |
| request_ip_trunc | inet | For rate limiting | No | — | P2; RET-04 (purge ≤ 24 h) |

## 2.4 `questionnaire_versions`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Version ID | Yes | — | P1 |
| code | varchar(20) UNIQUE | e.g. `QV-2026-11-01` | Yes | — | P1 |
| status | qv_status enum | `draft` → `review` → `published` → `retired` (Phase 1 §12) | Yes | — | P1 |
| published_at / retired_at | timestamptz | Lifecycle timestamps | No | — | P1 |
| approved_by | uuid | Admin who approved | No | → admin_users.id | P1 |
| change_log_ref | varchar(50) | Link to D08 adaptation-log entry | No | — | P1 |

Only one `published` version per locale set at a time. Published versions are immutable: there is an `UPDATE` trigger guard.

## 2.5 `questions`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Question row ID | Yes | — | P1 |
| questionnaire_version_id | uuid | Version it belongs to | Yes | → questionnaire_versions.id | P1 |
| key | varchar(10) | Stable key across versions: `Q01`…`Q08` | Yes | — | P1 |
| scope | question_scope enum | `profile` (Q01, Q04–Q08) \| `booking` (Q02, Q03) | Yes | — | P1 |
| text_ar / text_en | text | Exact wording (Phase 1 sheet `أسئلة_أولية`) | Yes | — | P0 |
| purpose_ar / purpose_en | text | "Why we ask" copy (column الغرض) | Yes | — | P0 |
| answer_type | answer_type enum | `single` \| `multi` \| `tier` \| `contact_request` | Yes | — | P1 |
| max_selections | smallint | e.g. Q05 = 3 | No | — | P1 |
| is_required | boolean | Q01 true; Q04 true when >1 tier published; Q05–Q08 false | Yes | — | P1 |
| matching_use | matching_use enum | `hard_constraint` (Q01, Q02, Q04) \| `soft_factor` (Q05) \| `event_prep` (Q06) \| `ops_only` (Q07, Q08) \| `none` | Yes | — | P1; documents the "قاعدة الاستخدام" column |
| data_class | privacy_class enum | P2 default; Q07 = **P4** | Yes | — | P1 |
| sort_order | smallint | Card order | Yes | — | P1 |

## 2.6 `question_options`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Option ID | Yes | — | P1 |
| question_id | uuid | Parent question | Yes | → questions.id | P1 |
| key | varchar(30) | Stable key e.g. `lang_ar`, `topic_tech`, `no_pref` | Yes | — | P1 |
| label_ar / label_en | varchar(120) | Display labels | Yes | — | P0 |
| is_exclusive | boolean | `no_pref` / `لا تفضيل` clears other selections | Yes | — | P1 |
| maps_to | jsonb | Machine value, e.g. `{"language":"ar"}`, `{"budget_tier_id":"…"}` | No | — | P1 |
| sort_order | smallint | Display order | Yes | — | P1 |

## 2.7 `questionnaire_responses` — one submission per user per version

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Response ID | Yes | — | P1 |
| user_id | uuid | Respondent | Yes | → users.id | P2 |
| questionnaire_version_id | uuid | Version answered (Phase 1: store answer copy linked to version) | Yes | → questionnaire_versions.id | P1 |
| status | response_status enum | `draft` \| `submitted` \| `superseded` | Yes | — | P1 |
| submitted_at | timestamptz | Submit time | No | — | P2 |
| completeness_required | smallint | Required answered | Yes | — | P1 |
| completeness_optional | smallint | Optional answered (coverage shown to matching, not as a penalty) | Yes | — | P1 |
| idempotency_key | varchar(64) | From the `Idempotency-Key` header | No | — | P1 |

Unique: `(user_id) WHERE status='submitted'` (one active response; older ones become `superseded`).

## 2.8 `answers` — normalised Q&A

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Row ID | Yes | — | P1 |
| response_id | uuid | Parent response | Yes | → questionnaire_responses.id | P2 |
| question_id | uuid | Question answered | Yes | → questions.id | P1 |
| option_id | uuid | Selected option (one row per selected option for `multi`) | Yes | → question_options.id | **P3** for Q01/Q04/Q05/Q06/Q08 (matching inputs); **P4** for Q07 |
| answered_at | timestamptz | Last change | Yes | — | P2 |

Q07's "private contact" option stores **only** that the request was made. Any details live in a T&S/ops case (`support_cases`, §2.27) under P4 rules after the Article 16 decision. Retention RET-05: superseded responses are purged after [LEGAL]; the active response is kept while the account is active.

## 2.9 `cities`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | varchar(10) PK | e.g. `doha` | Yes | — | P0 |
| name_ar / name_en | varchar(60) | الدوحة / Doha | Yes | — | P0 |
| timezone | varchar(40) | `Asia/Qatar` | Yes | — | P0 |
| is_active | boolean | Accepting bookings | Yes | — | P1 |

## 2.10 `venues`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Venue ID | Yes | — | P1 |
| city_id | varchar(10) | City | Yes | → cities.id | P0 |
| name | varchar(120) | Public venue name | Yes | — | P0 after reveal; hidden from users before `reveal_at` |
| district_ar / district_en | varchar(60) | Neighbourhood shown at booking (e.g. لوسيل / Lusail) | Yes | — | P0 |
| address_line | varchar(200) | Street address | Yes | — | P0 after reveal |
| lat / lng | numeric(9,6) | Map coordinates | Yes | — | P0 after reveal |
| google_place_id | varchar(100) | Optional map deep-link ID | No | — | P0 after reveal |
| venue_type | venue_type enum | `cafe` \| `restaurant` | Yes | — | P0 |
| supported_experiences | experience_type[] | e.g. `{coffee}`, `{dinner,coffee}` | Yes | — | P1 |
| total_bookable_tables | smallint | Tables the venue can give per slot | Yes | — | P1 |
| seats_per_table_max | smallint CHECK ≥ 6 | Physical seats per platform table (must fit capacity 6) | Yes | — | P1 |
| price_band_min_minor / price_band_max_minor | integer | Typical spend per person on food and drinks (QAR minor) — from the venue's menu | Yes | — | P0 (shown as band) |
| budget_tier_id | uuid | Highest tier this venue fits | Yes | → budget_tiers.id | P1 |
| noise_level | smallint 1–3 | 1 quiet · 2 moderate · 3 lively (ops assessment, F06) | Yes | — | P0 |
| accessibility | jsonb | `{"step_free":true,"accessible_wc":false,"parking":true,"lift":false}` | Yes | — | P0 |
| separate_bills_confirmed | boolean | Venue agrees to individual bills (F09) | Yes | — | P1 |
| min_spend_policy | varchar(200) | Written minimum-spend terms; `none` if none (A06) | Yes | — | P1 |
| arrival_instructions_ar / _en | text | "Ask for the Rightime table at reception…" | Yes | — | P0 after reveal |
| contract_status | contract_status enum | `prospect` \| `offer_received` \| `signed` \| `paused` \| `terminated` | Yes | — | P1; only `signed` venues are assignable |
| contract_expires_on | date | Contract end | No | — | P1 |
| is_active | boolean | Assignable now | Yes | — | P1 |

## 2.11 `budget_tiers` (replaces v0.2 `budget_tier Int`)

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Tier ID | Yes | — | P1 |
| city_id | varchar(10) | City | Yes | → cities.id | P0 |
| rank | smallint | 1 = lowest | Yes | — | P0 |
| max_spend_minor | integer NULL | Upper bound per person; NULL = open | No | — | P0 |
| label_ar / label_en | varchar(60) | e.g. `أقل من 100 ر.ق` (v0.2 draft values, to be confirmed after O05) | Yes | — | P0 |
| status | varchar(12) | `draft` \| `published` | Yes | — | P1 |

## 2.12 `venue_contacts` — restricted

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Contact ID | Yes | — | P1 |
| venue_id | uuid | Venue | Yes | → venues.id | P1 |
| name | varchar(80) | Contact person | Yes | — | P2 (business contact) |
| phone_e164_enc | bytea | Encrypted | Yes | — | P3 |
| role | varchar(40) | Manager, reservations… | No | — | P1 |
| is_day_of_contact | boolean | Called by on-call ops on event day | Yes | — | P1 |

## 2.13 `price_plans`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Plan ID | Yes | — | P1 |
| city_id | varchar(10) | City | Yes | → cities.id | P0 |
| experience | experience_type enum | `coffee` \| `dinner` | Yes | — | P0 |
| service_fee_minor | integer | Organising fee, e.g. 5900 (Phase 1 sensitivity "أساسي" = 59; **not a decided price**) | Yes | — | P0 |
| currency | char(3) | `QAR` | Yes | — | P0 |
| valid_from / valid_to | timestamptz | Validity window | Yes / No | — | P1 |

## 2.14 `cancellation_policies`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Policy ID | Yes | — | P1 |
| version | varchar(20) | Shown on SCR-05 and stored on each booking | Yes | — | P0 |
| full_refund_until_hours | smallint | Hours before start when a user cancellation still gets a full refund [LEGAL/PRODUCT] | Yes | — | P0 |
| late_cancel_refund_pct | smallint 0–100 | Refund % after the deadline [LEGAL]; Timeleft's 35 % no-show fee is **not** assumed (F11) | Yes | — | P0 |
| organizer_cancel_refund_pct | smallint | Always 100 | Yes | — | P0 |
| text_ar / text_en | text | User-facing rule | Yes | — | P0 |

## 2.15 `event_sessions` — a bookable date

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Session ID | Yes | — | P0 |
| city_id | varchar(10) | City | Yes | → cities.id | P0 |
| experience | experience_type enum | `coffee` \| `dinner` (Q03) | Yes | — | P0 |
| conversation_language | char(2) | `ar` \| `en` — one language per session (F04) | Yes | — | P0 |
| starts_at / ends_at | timestamptz | Event window | Yes | — | P0 |
| district_hint_ar / _en | varchar(60) | District shown before reveal | Yes | — | P0 |
| price_plan_id | uuid | Fee | Yes | → price_plans.id | P0 |
| cancellation_policy_id | uuid | Policy in force | Yes | → cancellation_policies.id | P0 |
| max_seats | smallint | Sum of seats across planned tables (e.g. 2 tables × 6) | Yes | — | P1 |
| seats_sold | smallint | Maintained transactionally (§2.29) | Yes | — | P1 |
| booking_opens_at / booking_closes_at | timestamptz | Sales window | Yes | — | P0 |
| lock_at | timestamptz | Quorum check (default `starts_at - 24h`, as in the operations scenario) | Yes | — | P1 |
| reveal_at | timestamptz | Venue reveal (default `starts_at - 24h`, v0.2), only if the table is locked | Yes | — | P0 |
| check_in_opens_at | timestamptz | Default `starts_at - 60 min` [CONFIG] | Yes | — | P1 |
| status | session_status enum | `draft` \| `on_sale` \| `sold_out` \| `locked` \| `in_progress` \| `completed` \| `cancelled` | Yes | — | P0 |

## 2.16 `event_tables` — a physical table at a venue

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Table ID | Yes | — | P1 |
| session_id | uuid | Session | Yes | → event_sessions.id | P1 |
| venue_id | uuid | Assigned venue (nullable until matching) | No | → venues.id | P1 (hidden from users until reveal) |
| table_code | varchar(10) | Human code shown after reveal, e.g. `RT-24` | Yes | — | P0 after reveal |
| capacity | smallint CHECK (capacity BETWEEN 4 AND 6) | Default 6 | Yes | — | P1 |
| min_quorum | smallint | Default 4 | Yes | — | P1 |
| confirmed_count | smallint | Paid, non-cancelled assignments | Yes | — | P1 (shown to members as a count) |
| status | table_status enum | `planned` \| `forming` \| `locked` \| `cancelled_quorum` \| `cancelled_venue` \| `completed` | Yes | — | P1 |
| venue_confirmed_at | timestamptz | Venue reconfirmed the reservation on the day (ops) | No | — | P1 |
| locked_at / cancelled_at | timestamptz | Lifecycle timestamps | No | — | P1 |
| cancel_reason | varchar(40) | `below_quorum` \| `venue_unavailable` \| `safety` \| `force_majeure` | No | — | P1 |

## 2.17 `bookings`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Booking ID | Yes | — | P2 |
| booking_ref | varchar(12) UNIQUE | Public reference `RT-XXXXXX` | Yes | — | P2 |
| user_id | uuid | Booker (from the token, never from the body — C1) | Yes | → users.id | P2 |
| session_id | uuid | Session booked (Q02 primary) | Yes | → event_sessions.id | P2 |
| alternate_session_ids | uuid[] | Q02 alternates for rebooking offers only | No | — | P2 |
| conversation_language | char(2) | Copied from the session at booking (immutable) | Yes | — | P2 |
| budget_tier_id | uuid | Snapshot of the user's Q04 tier at booking | Yes | → budget_tiers.id | P3 |
| questionnaire_response_id | uuid | Response used for matching | Yes | → questionnaire_responses.id | P2 |
| status | booking_status enum | See §1.0.1 | Yes | — | P2 |
| hold_expires_at | timestamptz | Seat hold end while `payment_pending` | No | — | P1 |
| price_minor / currency | integer / char(3) | Fee charged (snapshot) | Yes | — | P3 |
| cancellation_policy_version | varchar(20) | Snapshot | Yes | — | P2 |
| cancelled_at / cancel_actor | timestamptz / varchar(12) | `user` \| `organizer` \| `system` | No | — | P2 |
| cancel_reason_code | varchar(30) | Radio value, no free text | No | — | P2 |
| checked_in_at | timestamptz | "أنا هنا" | No | — | P2; RET-06 |
| no_show | boolean | Set by ops after the event | No | — | P2; used for reliability, never shown to others |
| idempotency_key | varchar(64) UNIQUE (user_id, key) | Duplicate-submit guard | No | — | P1 |

Constraint: `UNIQUE (user_id, session_id) WHERE status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed')`.

## 2.18 `table_assignments` — result of a matching run

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Row ID | Yes | — | P1 |
| booking_id | uuid | Seat | Yes | → bookings.id | P2 |
| table_id | uuid | Table | Yes | → event_tables.id | P2 |
| matching_run_id | uuid | Run that produced it | Yes | → matching_runs.id | P1 |
| is_current | boolean | Only the latest published run is current | Yes | — | P1 |
| member_score | numeric(5,4) | Per-member contribution (replaces v0.2 `matching_score`) | No | — | **P3**; deleted when feedback closes (RET-07) |

## 2.19 `matching_runs`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Run ID | Yes | — | P1 |
| session_id | uuid | Session matched | Yes | → event_sessions.id | P1 |
| mode | varchar(10) | `dry_run` \| `published` | Yes | — | P1 |
| rule_version | varchar(20) | Matching rules version (Phase 1 §7) | Yes | — | P1 |
| questionnaire_version_id | uuid | Survey version | Yes | → questionnaire_versions.id | P1 |
| algorithm | varchar(20) | `baseline_random` \| `interest_opt_v1` | Yes | — | P1 |
| seed | bigint | RNG seed for reproducibility | Yes | — | P1 |
| inputs_hash | char(64) | Hash of the input booking set | Yes | — | P1 |
| result_summary | jsonb | `{"tables":2,"seated":12,"waitlisted":0,"score":{"I":0.42,"C":0.31}}` — **no personal data** | Yes | — | P1 |
| explanations | jsonb | Per-table rule log with pseudonymous seat IDs only | No | — | P3; RET-07 |
| run_by | uuid | Admin or `system` | Yes | → admin_users.id | P1 |
| published_at | timestamptz | When made current | No | — | P1 |

## 2.20 `waitlist_entries`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Entry ID | Yes | — | P1 |
| user_id | uuid | User | Yes | → users.id | P2 |
| session_id | uuid | Full session | Yes | → event_sessions.id | P2 |
| position | integer | FIFO position at join | Yes | — | P2 |
| status | varchar(12) | `waiting` \| `offered` \| `accepted` \| `expired` \| `left` | Yes | — | P2 |
| offer_expires_at | timestamptz | Offer window [CONFIG, proposed 2 h; 30 min if < 24 h to start] | No | — | P1 |

## 2.21 `payments` — PSP transactions

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Payment ID | Yes | — | P3 |
| booking_id | uuid | Booking paid | Yes | → bookings.id | P3 |
| user_id | uuid | Payer (denormalised for the ledger) | Yes | → users.id | P3 |
| psp | varchar(30) | PSP code (selected after O05) | Yes | — | P1 |
| psp_payment_intent_id | varchar(100) UNIQUE | PSP reference | Yes | — | P3 |
| amount_minor / currency | integer / char(3) | Amount | Yes | — | P3 |
| status | payment_status enum | `created` → `requires_action` → `processing` → `succeeded` \| `failed` \| `cancelled` \| `expired`; post-success `partially_refunded` \| `refunded` \| `disputed` | Yes | — | P3 |
| failure_code | varchar(40) | Normalised: `declined` \| `insufficient_funds` \| `3ds_failed` \| `expired_card` \| `timeout` \| `other` | No | — | P3 |
| method_brand | varchar(20) | `visa` \| `mastercard` \| `apple_pay`… | No | — | P3 |
| card_last4 | char(4) | Only if the PSP returns it; never the PAN | No | — | P3 |
| idempotency_key | varchar(64) UNIQUE | Sent to the PSP | Yes | — | P1 |
| succeeded_at | timestamptz | Capture time | No | — | P3 |
| fee_minor | integer | PSP fee once settled (for the D20 contribution model) | No | — | P1 (Finance) |
| reconciled_at | timestamptz | Matched in the daily settlement file (R07) | No | — | P1 |

Retention RET-08: accounting records per Qatari law [LEGAL]. The Timeleft 10-year figure is not transferred (Phase 1 §3.6).

## 2.22 `refunds`

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Refund ID | Yes | — | P3 |
| payment_id | uuid | Original payment | Yes | → payments.id | P3 |
| booking_id | uuid | Booking | Yes | → bookings.id | P3 |
| amount_minor | integer CHECK > 0 | Refunded amount | Yes | — | P3 |
| reason | refund_reason enum | `user_cancel_in_window` \| `organizer_cancel` \| `seat_unavailable` \| `duplicate_charge` \| `goodwill` \| `dispute` | Yes | — | P3 |
| status | refund_status enum | `requested` \| `processing` \| `refunded` \| `failed` | Yes | — | P3 |
| psp_refund_id | varchar(100) | PSP reference | No | — | P3 |
| initiated_by | uuid | Admin, or NULL = system | No | → admin_users.id | P1 |
| approved_by | uuid | Second approver for manual or goodwill refunds (maker-checker) | No | → admin_users.id | P1 |
| idempotency_key | varchar(64) UNIQUE | Prevents duplicate refunds (R07) | Yes | — | P1 |
| completed_at | timestamptz | PSP confirmed | No | — | P3 |

Invariant: `SUM(refunds.amount_minor WHERE status IN ('processing','refunded')) ≤ payments.amount_minor`, enforced in the refund service inside a row lock on `payments`.

## 2.23 `payment_webhook_events` — inbox for idempotent processing

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Row ID | Yes | — | P1 |
| psp | varchar(30) | Source | Yes | — | P1 |
| psp_event_id | varchar(100) UNIQUE (psp, psp_event_id) | Dedup key | Yes | — | P1 |
| event_type | varchar(60) | e.g. `payment.succeeded` | Yes | — | P1 |
| signature_valid | boolean | Result of the HMAC check | Yes | — | P1 |
| payload | jsonb | Raw body (PAN never present with hosted checkout) | Yes | — | P3; RET-09 |
| processed_at | timestamptz | When applied | No | — | P1 |
| processing_error | text | Last error | No | — | P1 |

## 2.24 `event_feedback` — Ratings & Reviews

Design choice: **ratings are about the experience and the venue, not about individual people.** Conduct issues go through `safety_reports`. Peer star ratings are excluded (R04, R09; F13 requires a private report path).

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Feedback ID | Yes | — | P2 |
| booking_id | uuid UNIQUE | One feedback per attended booking | Yes | → bookings.id | P2 |
| user_id | uuid | Author | Yes | → users.id | P2 |
| table_id | uuid | Table (for table-level analysis — Phase 1 §10 cluster unit) | Yes | → event_tables.id | P2 |
| venue_id | uuid | Venue rated | Yes | → venues.id | P1 |
| overall_rating | smallint 1–5 | `كيف كانت التجربة؟` | Yes | — | P2 |
| comfort_rating | smallint 1–5 | `هل شعرت بالراحة في الحوار؟` (KPI "راحة وحوار" = 4–5) | Yes | — | P2 |
| venue_rating | smallint 1–5 | Venue quality | No | — | P2 |
| would_book_again | boolean | Intent signal only; not used as retention (Phase 1: no LTV from intent) | No | — | P2 |
| comment_private | varchar(500) | Free text; ops only; never shown to tablemates or venue | No | — | P3; scanned for safety keywords → suggests a T&S case; RET-10 |
| submitted_at | timestamptz | Time | Yes | — | P2 |

`venue_scores` (materialised view): `venue_id, n, avg_venue_rating, avg_comfort, last_90d_n` — only shown to ops when n ≥ [CONFIG] 5.

## 2.25 `connection_consents` — mutual contact after event (F14, Q08)

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Row ID | Yes | — | P2 |
| table_id | uuid | Shared table | Yes | → event_tables.id | P2 |
| from_user_id / to_user_id | uuid | Direction | Yes | → users.id | P2 |
| choice | boolean | Wants contact | Yes | — | P2 |
| decided_at | timestamptz | Time | Yes | — | P2 |
| expires_at | timestamptz | Window to choose (proposed 7 days) [CONFIG] | Yes | — | P1 |

A connection exists only when both directions are `true`. Contact then happens through in-app messaging or masked relay; phone numbers are never auto-revealed (R06). Withdrawal deletes the pair.

## 2.26 `safety_reports`, `report_actions`, `user_blocks`

**`safety_reports`**

| Field | Type | Description | Req. | FK | Privacy |
|---|---|---|---|---|---|
| id | uuid PK | Case ID (`TS-YYYY-NNNN` shown to staff) | Yes | — | P4 |
| reporter_user_id | uuid | Reporter | Yes | → users.id | **P4 — never disclosed to the reported user** |
| reported_user_id | uuid | Subject (nullable if unknown) | No | → users.id | P4 |
| booking_id / table_id | uuid | Context | No | → bookings.id / event_tables.id | P4 |
| category | report_category enum | `harassment` \| `threat_violence` \| `photo_without_consent` \| `stalking_unwanted_contact` \| `fraud` \| `disruptive` | Yes | — | P4 |
| timing | varchar(10) | `during` \| `after` | Yes | — | P4 |
| immediate_danger | boolean | Reporter answered yes | Yes | — | P4 |
| description | text (encrypted) | Reporter's words | No | — | P4; RET-11 [LEGAL] |
| severity | smallint 1–4 | Set at triage (§4.4.2) | No | — | P4 |
| status | varchar(20) | `new` \| `triaged` \| `investigating` \| `actioned` \| `closed_no_action` \| `appealed` \| `closed` | Yes | — | P4 |
| assigned_to | uuid | T&S owner | No | → admin_users.id | P4 |
| sla_due_at | timestamptz | From severity | No | — | P4 |

**`report_actions`**: `id, report_id → safety_reports.id, action (interim_block | warning | suspension | ban | no_action | referral_authorities | appeal_upheld | appeal_rejected), actor_id → admin_users.id, effective_from, effective_to, rationale (encrypted, P4)`.

**`user_blocks`** (hard matching constraint): `id, blocker_user_id → users.id, blocked_user_id → users.id, source (user | safety_case), report_id NULL → safety_reports.id, created_at`. Unique on `(blocker, blocked)`. Matching treats blocks as **mutual**. Class P3; the blocked user is never told who blocked them.

## 2.27 Admin, audit, notifications, support

| Table | Key fields | Privacy |
|---|---|---|
| `admin_users` | `id, email, name, role (owner\|ops\|finance\|trust_safety\|analyst\|researcher\|developer), mfa_enabled (must be true), status, last_login_at` | P2 |
| `audit_logs` (append-only, WORM storage) | `id, actor_id → admin_users.id, action, entity, entity_id, reason_code, before_hash, after_hash, ip_trunc, at`. Every read of P4 data writes a row. | P1 (content hashed, no PII) |
| `notifications_outbox` | `id, user_id → users.id, channel (push\|sms\|email\|in_app), template_key, locale, payload (no free text from other users), send_after, sent_at, status, provider_ref` | P2; RET-12 |
| `support_cases` | `id, user_id, booking_id NULL, type (practical_arrangement_Q07\|payment\|refund\|general), status, assigned_to, notes_enc` | P3 (Q07 cases P4) |
| `legal_documents` | `version PK, type, text_ar, text_en, published_at` | P0 |

## 2.28 Enumerations (DDL excerpt)

```sql
CREATE TYPE booking_status AS ENUM ('payment_pending','paid_awaiting_group','group_locked','revealed',
  'checked_in','completed','waitlisted','cancelled_by_user','cancelled_by_organizer','payment_failed','expired');
CREATE TYPE experience_type AS ENUM ('coffee','dinner');
CREATE TYPE table_status   AS ENUM ('planned','forming','locked','cancelled_quorum','cancelled_venue','completed');
CREATE TYPE payment_status AS ENUM ('created','requires_action','processing','succeeded','failed','cancelled',
  'expired','partially_refunded','refunded','disputed');
CREATE TYPE refund_status  AS ENUM ('requested','processing','refunded','failed');
CREATE TYPE privacy_class  AS ENUM ('P0','P1','P2','P3','P4');
```

## 2.29 Atomic seat hold (prevents overselling — Phase 1 "حجز ذرّي")

```sql
-- inside POST /bookings, one transaction
UPDATE event_sessions
   SET seats_sold = seats_sold + 1
 WHERE id = $session_id
   AND status = 'on_sale'
   AND seats_sold < max_seats
RETURNING id;            -- 0 rows ⇒ 409 SESSION_FULL
INSERT INTO bookings (... status='payment_pending', hold_expires_at = now() + interval '10 minutes' ...);
-- A job releases expired holds:  seats_sold - 1  and  status='expired'  (same transaction per booking)
```

## 2.30 Entity relationship summary

```text
cities 1─* venues 1─* venue_contacts
cities 1─* budget_tiers, price_plans, event_sessions
event_sessions 1─* event_tables *─1 venues
event_sessions 1─* bookings *─1 users
bookings 1─* table_assignments *─1 event_tables ; table_assignments *─1 matching_runs
bookings 1─* payments 1─* refunds ; payment_webhook_events (inbox, by psp_event_id)
users 1─* questionnaire_responses 1─* answers *─1 question_options *─1 questions *─1 questionnaire_versions
users 1─* user_consents ; users *─* users via user_blocks, connection_consents
bookings 1─1 event_feedback ; safety_reports → report_actions ; audit_logs ← admin_users
```

## 2.31 Retention rules referenced above (to be finalised with counsel — Art. 10: no longer than necessary)

| Rule | Data | Proposed trigger (duration [LEGAL]) |
|---|---|---|
| RET-01 | Identity (phone, display name) | Until account deletion, then anonymise within [LEGAL] days |
| RET-02 | Login metadata | Rolling [LEGAL] |
| RET-03 | Consent ledger | Life of account + evidence period [LEGAL] |
| RET-04 | OTP challenges | ≤ 24 h |
| RET-05 | Superseded questionnaire responses | [LEGAL] after superseded |
| RET-06 | Check-in / attendance | [LEGAL] after event |
| RET-07 | Matching scores and explanations | Delete when the feedback window closes (keeps the v0.2 rule) |
| RET-08 | Payments / refunds | Accounting law [LEGAL] |
| RET-09 | Webhook payloads | 90 days after processing [CONFIG] |
| RET-10 | Private feedback comments | [LEGAL] |
| RET-11 | Safety reports | [LEGAL] (longer for actioned cases) |
| RET-12 | Notification payloads | 30 days [CONFIG] |

---

# 3. API Specifications (D18)

## 3.1 Conventions for every endpoint

| Item | Rule |
|---|---|
| Base URL | `https://api.{domain}/api/v1` |
| Format | JSON, `Content-Type: application/json; charset=utf-8` |
| Auth | `Authorization: Bearer <access_token>` (JWT, RS256, 15 min TTL [CONFIG]); refresh token is opaque, rotating, 30 days [CONFIG], stored hashed server-side |
| Locale | `Accept-Language: ar` \| `en` → localised `message` fields; machine `code` fields never localised |
| Idempotency | Every `POST` that creates state requires `Idempotency-Key: <uuid>`. Same key + same body ⇒ the original response is replayed (status and body). Same key + different body ⇒ `409 IDEMPOTENCY_KEY_REUSED`. Keys are kept 24 h. |
| Rate limits | Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. A `429` always carries `Retry-After` (seconds). |
| Time | ISO-8601 with offset, e.g. `2026-11-05T19:30:00+03:00` |
| Money | `{"amount_minor": 5900, "currency": "QAR", "display": "59 ر.ق"}` |
| Tracing | Every response carries `X-Request-Id`; clients send it back in support requests |

**Error envelope** (RFC 9457 problem-details style):

```json
{
  "type": "https://docs.{domain}/errors/SESSION_FULL",
  "status": 409,
  "code": "SESSION_FULL",
  "message": "امتلأ هذا الموعد للتو.",
  "request_id": "req_01JC8Z…",
  "details": [ { "field": "session_id", "code": "SESSION_FULL" } ],
  "retryable": false
}
```

Common errors on every authenticated endpoint:

| HTTP | code | When |
|---|---|---|
| 400 | `MALFORMED_REQUEST` | Invalid JSON or wrong types |
| 401 | `UNAUTHENTICATED` | Missing, expired or invalid token |
| 403 | `ACCOUNT_SUSPENDED` | `users.status` is `suspended` or `banned` |
| 403 | `REGISTRATION_INCOMPLETE` | Consents or eligibility missing (any endpoint except registration) |
| 409 | `IDEMPOTENCY_KEY_REUSED` | See above |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 / 503 | `INTERNAL` / `UNAVAILABLE` | Server fault, `retryable: true` |

---

## 3.2 Auth / Registration

Passwordless phone OTP (v0.2 decision), in three calls: request a code, verify the code, then complete registration for new users.

### 3.2.1 `POST /auth/otp:request`

```yaml
summary: Send a one-time code by SMS
security: []            # public
headers: { Idempotency-Key: required }
requestBody:
  phone_e164: string    # required, E.164, country in ALLOWED_PHONE_COUNTRIES
  locale: "ar" | "en"   # required, language of the SMS text
  purpose: "login"      # fixed; sign-up and sign-in share the flow
responses:
  202: { challenge_id: uuid, expires_in: int(seconds), resend_after: int(seconds), code_length: 6 }
  400: INVALID_PHONE
  422: UNSUPPORTED_COUNTRY
  429: OTP_RATE_LIMITED   # per phone and per IP
```

Request:
```json
{ "phone_e164": "+97455501234", "locale": "ar", "purpose": "login" }
```
Response `202`:
```json
{ "challenge_id": "0193a3f2-6c1e-7b8a-9e2d-2f1c9f0b7a11", "expires_in": 300, "resend_after": 45, "code_length": 6 }
```

Rules:
- Always `202` for a valid phone, **whether or not an account exists** (no account enumeration).
- Limits [CONFIG]: 1 send per 45 s per phone; 5 per hour per phone; 20 per hour per IP /24.
- The SMS text contains only the code and the brand. It also carries an origin-bound line (`@{domain} #{code}`) for WebOTP auto-fill.

### 3.2.2 `POST /auth/otp:verify`

```yaml
summary: Verify the code; returns tokens and whether the user is new
security: []
requestBody:
  challenge_id: uuid    # required
  code: string          # required, ^[0-9]{6}$
  device: { platform: "web"|"ios"|"android", app_version: string }   # optional
responses:
  200: { access_token, refresh_token, token_type: "Bearer", expires_in, user: { id, is_new, registration_status, locale } }
  400: OTP_INVALID          # details: attempts_remaining
  404: CHALLENGE_NOT_FOUND
  410: OTP_EXPIRED
  423: OTP_LOCKED           # attempts exhausted; request a new code after Retry-After
```

Response `200` (new user):
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs…",
  "refresh_token": "rt_9f2c…",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": { "id": "0193a3f4-…", "is_new": true, "registration_status": "consents_required", "locale": "ar" }
}
```
Error `400`:
```json
{ "status": 400, "code": "OTP_INVALID", "message": "الرمز غير صحيح.", "details": [ { "field": "code", "attempts_remaining": 3 } ], "retryable": true }
```

Server logic (pseudo-code):
```python
ch = load_challenge(challenge_id)            # 404 if missing
if ch.consumed_at or now() > ch.expires_at:  raise OTP_EXPIRED       # 410
if ch.attempts >= MAX_ATTEMPTS:              raise OTP_LOCKED        # 423
if not bcrypt_verify(code, ch.code_hash):
    ch.attempts += 1; save(ch)
    raise OTP_INVALID(attempts_remaining=MAX_ATTEMPTS - ch.attempts)  # 400
mark_consumed(ch)                            # atomic: UPDATE … WHERE consumed_at IS NULL
user = find_by_phone_hash(ch.phone_lookup_hash) or create_user(status="active")
issue_tokens(user)                           # registration_status computed from consents
```

`registration_status` values: `consents_required` (go to SCR-02c), `complete`.

### 3.2.3 `POST /users/me/registration` — complete registration

```yaml
summary: Record eligibility, required consents and optional display name
security: [ bearer ]
headers: { Idempotency-Key: required }
requestBody:
  display_name: string|null           # optional, 1–30 chars, letters/space/hyphen
  locale: "ar"|"en"                   # required
  age_eligibility_confirmed: true     # required, must be true
  consents:                           # required: terms, conduct, privacy_notice; optional: marketing
    - { type: "terms",          document_version: "terms-2026-11",   granted: true }
    - { type: "conduct",        document_version: "conduct-2026-11", granted: true }
    - { type: "privacy_notice", document_version: "privacy-2026-11", granted: true }
    - { type: "marketing",      document_version: "mkt-2026-11",     granted: false }
responses:
  201: { user: { id, display_name, locale, registration_status: "complete" }, next: "questionnaire" }
  409: ALREADY_REGISTERED
  422: VALIDATION_FAILED   # details per field
  422: CONSENT_REQUIRED    # a required consent missing or granted=false
  422: AGE_NOT_ELIGIBLE    # age_eligibility_confirmed != true
  422: DOCUMENT_VERSION_OUTDATED   # details: current_version
```

Error `422` example:
```json
{
  "status": 422, "code": "CONSENT_REQUIRED",
  "message": "يلزم الموافقة على الشروط وقواعد السلوك وإشعار الخصوصية.",
  "details": [ { "field": "consents.conduct", "code": "REQUIRED" } ]
}
```

Side effects: a `user_consents` row per consent; `users.age_eligibility_confirmed_at = now()` and `registration_completed_at = now()`. The marketing consent is recorded even when `false`, so the refusal is evidenced too.

Companion endpoints: `POST /auth/token:refresh` → new pair, old refresh token revoked (reuse ⇒ revoke the whole family). `POST /auth/logout` → revokes the refresh token. `DELETE /users/me` → `202`, status `deletion_requested`, anonymisation job (RET-01).

---

## 3.3 Submit Questionnaire

### 3.3.1 `GET /questionnaires/current` (needed by the client to render cards)

Response `200` (trimmed):
```json
{
  "questionnaire_version_id": "0193a400-…",
  "code": "QV-2026-11-01",
  "questions": [
    {
      "id": "0193a401-…", "key": "Q01", "scope": "profile", "answer_type": "multi", "is_required": true,
      "text": "ما اللغة التي ترتاح لإجراء محادثة جماعية كاملة بها؟",
      "purpose": "لتحديد لغة الطاولة؛ لا نجمع طاولة بلغات لا تتقاطع.",
      "options": [
        { "id": "…", "key": "lang_ar", "label": "العربية", "is_exclusive": false },
        { "id": "…", "key": "lang_en", "label": "الإنجليزية", "is_exclusive": false },
        { "id": "…", "key": "lang_other", "label": "لغة أخرى", "is_exclusive": false }
      ]
    },
    { "key": "Q05", "answer_type": "multi", "max_selections": 3, "is_required": false, "…": "…" }
  ],
  "draft": { "response_id": "0193a4ff-…", "answers": [ { "question_id": "…", "option_ids": ["…"] } ] }
}
```
`draft` is present when the user saved and exited.

### 3.3.2 `POST /questionnaire-responses`

```yaml
summary: Save a draft or submit profile answers (Q01, Q04–Q08)
security: [ bearer ]
headers: { Idempotency-Key: required }
requestBody:
  questionnaire_version_id: uuid      # required, must be status=published
  status: "draft" | "submitted"       # required
  answers:                            # required (may be partial when draft)
    - question_id: uuid
      option_ids: [uuid]              # 1..n; empty array = explicitly skipped (optional questions only)
  client_submitted_at: datetime       # optional, for analytics latency
responses:
  201: Created (first submission)
  200: OK (replay or draft update)
  404: QUESTIONNAIRE_VERSION_NOT_FOUND
  409: QUESTIONNAIRE_VERSION_RETIRED    # details.current_version_id
  422: VALIDATION_FAILED                # per-question details
```

Request (submit):
```json
{
  "questionnaire_version_id": "0193a400-…",
  "status": "submitted",
  "answers": [
    { "question_id": "Q01-id", "option_ids": ["lang_ar-id", "lang_en-id"] },
    { "question_id": "Q04-id", "option_ids": ["tier2-id"] },
    { "question_id": "Q05-id", "option_ids": ["topic_food-id", "topic_travel-id", "topic_tech-id"] },
    { "question_id": "Q06-id", "option_ids": ["opener_question-id"] },
    { "question_id": "Q07-id", "option_ids": ["no-id"] },
    { "question_id": "Q08-id", "option_ids": ["mutual_consent-id"] }
  ],
  "client_submitted_at": "2026-11-01T18:04:12+03:00"
}
```

Response `201`:
```json
{
  "response_id": "0193a512-…",
  "status": "submitted",
  "submitted_at": "2026-11-01T18:04:13+03:00",
  "completeness": { "required_answered": 2, "required_total": 2, "optional_answered": 4, "optional_total": 4 },
  "derived": {
    "conversation_languages": ["ar", "en"],
    "budget_tier": { "id": "tier2-id", "label": "100–200 ر.ق" },
    "supported_languages_note": null,
    "private_contact_case_id": null
  },
  "next": "choose_session"
}
```

Validation error `422`:
```json
{
  "status": 422, "code": "VALIDATION_FAILED", "message": "راجع الإجابات المظللة.",
  "details": [
    { "question_key": "Q01", "code": "REQUIRED_MISSING" },
    { "question_key": "Q05", "code": "TOO_MANY_SELECTIONS", "max": 3 },
    { "question_key": "Q06", "code": "EXCLUSIVE_OPTION_CONFLICT", "option_key": "no_pref" }
  ]
}
```

Per-question detail codes: `REQUIRED_MISSING`, `TOO_MANY_SELECTIONS`, `SINGLE_CHOICE_EXPECTED`, `OPTION_NOT_IN_QUESTION`, `EXCLUSIVE_OPTION_CONFLICT`, `QUESTION_NOT_IN_VERSION`, `QUESTION_DISABLED` (e.g. a Q07 detail field before O04).

Server behaviour:
1. Validate the version is `published`, otherwise `409` with the current version ID. The client then re-renders, keeping matching answers by `key`.
2. Upsert the draft or create a `submitted` response; mark the previous submitted response `superseded`. This happens in one transaction.
3. If Q01 contains only `lang_other` ⇒ set `derived.supported_languages_note = "only_ar_en_available"`. Do not reject.
4. If Q07 = "private contact" ⇒ create `support_cases(type='practical_arrangement_Q07', status='new')` and return `private_contact_case_id`. **No details are accepted in this endpoint.**
5. Existing bookings keep their snapshot (`bookings.budget_tier_id`, `conversation_language`). Changing answers affects future bookings only, which is the source of E-LANG-2 in the UI.
6. Emit analytics event `questionnaire_submitted {version, required_answered, optional_answered}` with **no answer values** (Phase 1 §12: event schema without private text).

---

## 3.4 Get Event Details (after booking confirmation, approaching event time)

### 3.4.1 `GET /bookings/{booking_id}/event-details`

```yaml
summary: Booking-scoped event information; fields unlock by phase
security: [ bearer ]       # booking must belong to the caller
headers:
  If-None-Match: optional ETag
responses:
  200: EventDetails
  304: Not Modified
  404: BOOKING_NOT_FOUND    # also returned for other users' bookings (no enumeration)
  410: EVENT_ARCHIVED       # past retention
cache: "Cache-Control: private, no-store" once phase >= revealed
```

**Visibility matrix (enforced server-side; the client never receives hidden fields):**

| Field group | `pending_payment` | `forming` (paid) | `locked` | `revealed` (≥ `reveal_at` and table locked) | `day_of` (≥ `check_in_opens_at`) | `completed` | `cancelled` |
|---|---|---|---|---|---|---|---|
| Session: experience, start/end, language, district, price band, accessibility | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Booking status, ref, cancellation policy + deadline | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Payment summary | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (+ refund) |
| Table: confirmed count, capacity | — | — | ✓ | ✓ | ✓ | ✓ | — |
| Venue name, address, coordinates, map URL, arrival instructions | — | — | — | ✓ | ✓ | ✓ | — |
| Table code | — | — | — | ✓ | ✓ | ✓ | — |
| Tablemates' display names | — | — | — | — | ✓ (count + first names) | ✓ | — |
| Check-in action | — | — | — | — | ✓ | — | — |
| Feedback & connection actions | — | — | — | — | — | ✓ (window) | — |
| Rebook / refund choice | — | — | — | — | — | — | ✓ (organizer cancel) |
| **Never:** other users' phones, surnames, answers, scores, user IDs | — | — | — | — | — | — | — |

Response `200` — phase `forming`:
```json
{
  "booking": {
    "id": "0193a601-…", "ref": "RT-7KQ4M2", "status": "paid_awaiting_group",
    "cancellation": { "policy_version": "cp-2026-11", "full_refund_until": "2026-11-04T19:30:00+03:00", "can_cancel": true }
  },
  "session": {
    "experience": "dinner", "conversation_language": "ar",
    "starts_at": "2026-11-05T19:30:00+03:00", "ends_at": "2026-11-05T21:30:00+03:00", "timezone": "Asia/Qatar",
    "district": "لوسيل",
    "food_price_band": { "min_minor": null, "max_minor": null, "display": "{band from venue offers}" },
    "accessibility": { "step_free": true, "accessible_wc": true, "parking": true }
  },
  "reveal": { "phase": "forming", "lock_at": "2026-11-04T19:30:00+03:00", "reveal_at": "2026-11-04T19:30:00+03:00" },
  "table": null,
  "venue": null,
  "payment": { "amount": { "amount_minor": 5900, "currency": "QAR", "display": "59 ر.ق" }, "status": "succeeded" },
  "actions": [ { "type": "cancel", "method": "POST", "href": "/api/v1/bookings/0193a601-…/cancel" } ],
  "support": { "channel": "in_app", "href": "/api/v1/support/threads?booking_id=0193a601-…" }
}
```

Response `200` — phase `revealed` (only the deltas are shown):
```json
{
  "booking": { "status": "revealed", "…": "…" },
  "reveal": { "phase": "revealed", "revealed_at": "2026-11-04T19:30:02+03:00", "check_in_opens_at": "2026-11-05T18:30:00+03:00" },
  "table": { "code": "RT-24", "confirmed_count": 6, "capacity": 6 },
  "venue": {
    "name": "{venue name}",
    "address": "{street, building}",
    "district": "لوسيل",
    "location": { "lat": 25.000000, "lng": 51.000000 },
    "map_url": "https://maps.google.com/?q=25.000000,51.000000",
    "arrival_instructions": "اطلب طاولة Rightime عند الاستقبال واذكر الرمز RT-24.",
    "bill_policy": "يدفع كل شخص طعامه وشرابه للمكان مباشرة."
  }
}
```

Response `200` — phase `day_of` adds:
```json
{
  "table": { "code": "RT-24", "confirmed_count": 6, "members": [ { "display_name": "سارة" }, { "display_name": "أحمد" } ] },
  "actions": [
    { "type": "check_in", "method": "POST", "href": "/api/v1/bookings/0193a601-…/check-in" },
    { "type": "report",   "method": "POST", "href": "/api/v1/safety-reports" }
  ]
}
```
`members` lists display names only, with no IDs. Members without a display name are counted but not named.

Response `200` — phase `cancelled` (organizer):
```json
{
  "booking": { "status": "cancelled_by_organizer", "cancel_reason": "below_quorum" },
  "reveal": { "phase": "cancelled" },
  "resolution": {
    "choice_deadline": "2026-11-06T19:30:00+03:00",
    "default_if_no_choice": "refund",
    "options": [
      { "type": "rebook", "sessions": [ { "session_id": "0193a7…", "starts_at": "2026-11-12T19:30:00+03:00", "district": "الخليج الغربي", "seats_left": 4 } ] },
      { "type": "refund", "amount": { "amount_minor": 5900, "currency": "QAR", "display": "59 ر.ق" } }
    ]
  },
  "refund": { "status": "none" }
}
```

Errors:

| HTTP | code | When |
|---|---|---|
| 404 | `BOOKING_NOT_FOUND` | Unknown ID **or** not owned by caller |
| 410 | `EVENT_ARCHIVED` | Booking anonymised by retention |
| 401/403 | common | — |

Implementation notes:
- Phase is computed server-side from `bookings.status`, `event_tables.status`, `now()` and `event_sessions.reveal_at` / `check_in_opens_at`. If `reveal_at` has passed but the table is **not** `locked`, the phase stays `forming` or `cancelled`, so a venue is never revealed for an unconfirmed table (C4).
- The ETag is a hash of the visible payload, so polling clients get a `304` until something changes.
- Map links are generated from coordinates. Static map images are proxied, so the user's IP is not sent to a third party before they tap "open in maps" [privacy choice].

---

## 3.5 Corrected booking & payment endpoints (replaces v0.2 `POST /bookings`)

These are not in the requested three, but SCR-04/05 and every edge state depend on them.

`POST /bookings` — `Idempotency-Key` required. The body has **no `user_id`** (C1).
```json
{ "session_id": "0193a6…", "alternate_session_ids": ["0193a7…"], "budget_tier_id": "tier2-id" }
```
`201` → `{ "booking_id", "ref", "status": "payment_pending", "hold_expires_at", "checkout_url", "amount": {…} }`

| HTTP | code | Rule |
|---|---|---|
| 409 | `SESSION_FULL` | Atomic hold failed (§2.29); body includes `waitlist_href` |
| 409 | `ALREADY_BOOKED` | Active booking exists for this session |
| 422 | `LANGUAGE_CONFLICT` | `session.conversation_language` ∉ user's Q01 |
| 422 | `BUDGET_CONFLICT` | Session venue tier above user's Q04 cap |
| 422 | `QUESTIONNAIRE_INCOMPLETE` | No submitted response |
| 422 | `SESSION_NOT_ON_SALE` | Outside the sales window |
| 403 | `BLOCKED_FROM_BOOKING` | Sanction active |

`POST /payments/webhooks/{psp}` — verify the HMAC signature over the raw body and reject requests outside a ±5 min timestamp skew. Insert into `payment_webhook_events` (unique `psp_event_id`); duplicates return `200` without re-processing. On `payment.succeeded`: if the hold is still valid, booking → `paid_awaiting_group`; else auto-refund `seat_unavailable` (E-PAY-5). Always return `2xx` quickly and process asynchronously.

`POST /bookings/{id}/cancel` → `200 { status, refund: { eligible, amount, status } }`; `409 CANCEL_NOT_ALLOWED` once the event has started.

---

# 4. Admin Panel & Operations Playbook (Phase 9 · D16 role panel · D19)

## 4.0 Roles and access (from Phase 1 §11, made enforceable)

| Role | Purpose | Data it may see | Data it must **not** see |
|---|---|---|---|
| `owner` | Approves policies, prices, releases | Aggregates, configuration, audit log | **No automatic full access.** P3/P4 data only through a time-boxed "break-glass" grant (reason required, auto-expires in 4 h, alerts the owner group). |
| `ops` (operations / on-call coordinator) | Sessions, venues, tables, day-of | Display name, booking status, check-in, approved practical needs, venue contacts | Questionnaire answers, payment details, safety-case content |
| `finance` | Payments, refunds, reconciliation | Payments, refunds, booking refs, amounts | Questionnaire answers, safety cases |
| `trust_safety` | Reports, sanctions, appeals | Safety cases (P4), blocks, limited booking context | Payment instruments |
| `analyst` | KPIs, experiments | Pseudonymous events and preferences (no phone, no name), table-level outcomes | Direct identifiers, report content |
| `researcher` | Interviews, D08 log | Coded research data stored separately from contact data | Production user records |
| `developer` | Builds the system | **Synthetic data only** in non-prod; prod access via break-glass | Any production PII by default |

Mandatory controls: MFA for every admin. Every write and every P4 read goes to `audit_logs` with a reason code. Sensitive bulk actions use maker-checker: one person proposes, another approves. Sensitive fields are masked (`+974 •••• 1234`) unless the role holds an explicit "reveal" permission, which is itself audited.

### 4.0.1 Permission matrix (✓ = allowed · A = needs approval by second person · — = denied)

| Action | owner | ops | finance | trust_safety | analyst |
|---|---|---|---|---|---|
| Create/edit venue | ✓ | ✓ | — | — | — |
| Publish session / change price plan | ✓ | A (propose) | — | — | — |
| Run matching dry-run | ✓ | ✓ | — | — | ✓ (synthetic/replay) |
| Publish matching / lock table | ✓ | ✓ | — | — | — |
| Manually move a member between tables | ✓ | A | — | — | — |
| Cancel a table (organizer cancel) | ✓ | A | — | — | — |
| Issue automatic policy refund | system | system | ✓ | — | — |
| Issue manual or goodwill refund | A | — | A | — | — |
| View safety case content | — | — | — | ✓ | — |
| Suspend / ban user | A | — | — | ✓ (ban = A) | — |
| Export data | A | — | A (finance) | — | ✓ (pseudonymous) |

---

## 4.1 Information architecture (left navigation)

```text
Dashboard (today)
├── Sessions & Tables                ← User & Matching Management
│   ├── Sessions list / calendar
│   ├── Session detail → Pool · Matching · Tables · Waitlist · Comms
│   └── Matching runs (history, diff)
├── Users                            ← User & Matching Management
│   ├── Search
│   └── User detail (tabs gated by role)
├── Trust & Safety                   ← User & Matching Management (T&S sub-module)
│   ├── Case queue · Case detail · Blocks · Appeals
├── Venues                           ← Venue Management
│   ├── List · Venue detail · Availability · Contracts
├── Payments                         ← Payment & Refund Management
│   ├── Transactions · Refunds · Webhooks · Reconciliation · Disputes
├── Live                             ← Live Event Monitoring
│   └── Tonight board · Incident console
├── Content & Config
│   ├── Questionnaire versions · Legal documents · Message templates · Budget tiers · Price plans · Policies
└── Audit log
```

## 4.2 Core modules

### 4.2.1 Venue Management

**Venue list** (table): name · district · type · supported experiences · tables per slot · seats/table · budget tier · noise · step-free ✓/✗ · contract status · avg venue rating (only if n ≥ 5) · active toggle. Filters: district, experience, contract status, tier, accessibility.

**Venue detail — form sections**

| Section | Fields (→ `venues` columns) | Validation |
|---|---|---|
| Identity | name, venue_type, district_ar/en, address_line, lat/lng (map picker), google_place_id | The pin must fall inside the city polygon |
| Capacity | total_bookable_tables, seats_per_table_max | seats_per_table_max ≥ 6; tables ≥ 1 |
| Price & bill | price_band_min/max (from the written menu), budget_tier_id, separate_bills_confirmed, min_spend_policy | Cannot set `signed` unless separate bills are confirmed and the min-spend text is filled (F06, A06) |
| Experience fit | supported_experiences, noise_level (1–3), accessibility checklist | Accessibility is filled after a site visit, not from the venue's word alone |
| Arrival | arrival_instructions_ar/en, photo of the entrance (optional, ops-only) | Both languages required |
| Contacts | venue_contacts (restricted): reservations + day-of contact | At least 1 day-of contact |
| Contract | contract_status, contract_expires_on, uploaded PDF (restricted), commission/min-spend terms | Status `signed` requires the PDF |
| Availability | Weekly slots × tables, blackout dates | Synced to session planning |

**Actions:** `Pause venue` (blocks new assignments; existing locked tables get a warning banner), `Reassign tables` (opens the matching module for affected sessions), `Request reconfirmation` (sends the template `VENUE_RECONFIRM_T-24` to the day-of contact).

### 4.2.2 User & Matching Management

**A. Users — search & detail**

Search by booking ref, user ID, or **last 4 digits of the phone plus the session** (never by full name). Results show display name, status, booking count, and the latest booking status.

User detail tabs (gated by role):

| Tab | Content | Roles |
|---|---|---|
| Overview | display name, locale, status, registration date, no-show count, active sanctions (summary only) | ops, owner, T&S |
| Bookings | list with status, table code, check-in, refund state | ops, finance (amounts), owner |
| Answers | Q01/Q04 values only (needed to explain matching); Q05/Q06 hidden unless debugging a matching complaint, with a reason prompt | ops (reason), analyst (pseudonymous) |
| Consents | consent ledger (versions, timestamps) | ops, owner |
| Safety | link to cases, never inline content | T&S only |
| Actions | resend notification, cancel booking (policy-aware), mark no-show (post-event), request deletion | ops (some A) |

**B. Session detail → Pool** (the matching cockpit)

| Widget | Shows |
|---|---|
| Pool counters | Paid bookings by `language × budget tier`; waitlist size; holds in progress |
| Feasibility gauge | Tables formable now = Σ floor(cell/4)-aware result from a dry-run; seats short of the next table |
| Blocks in pool | Count of blocked pairs inside this pool (no identities) |
| Venues assigned | Planned tables vs venue tables available |
| Timeline | `booking_closes_at`, `lock_at`, `reveal_at`, `starts_at` with countdowns |

**C. Matching run flow (admin)**

```text
[Dry run] → review → [Publish] → (tables 'forming' → 'locked' at lock_at if ≥ quorum) → [Reveal job]
```

1. **Dry run.** Calls the engine with `mode=dry_run` and shows the proposed tables. Each table card shows: language, tier, seats filled (e.g. 6/6), the interest score `I` and cohesion `C` (Phase 1 formula, for monitoring only), and warnings such as `solo interest coverage < 2 topics`.
2. **Review screen.** Hard-constraint checklist per table (all must be ✓): same session · shared language · venue tier ≤ every member's cap · no blocked pair · 4 ≤ size ≤ venue capacity · all consents current.
3. **Manual adjust.** Drag a seat to another table. The UI re-validates hard constraints live; an invalid drop is rejected with the reason. A **reason code is required** (`friend_request_separate`, `accessibility_fit`, `ops_balance`, `other`) and the change is audited. Hard constraints can never be overridden from the UI.
4. **Publish.** Writes `matching_runs(mode='published')`, sets the new `table_assignments.is_current`, and records the seed and versions. Re-publishing before `lock_at` is allowed; after `lock_at` only ops moves with approval.
5. **Explanations** are stored with pseudonymous seat IDs only (Phase 1: human review without unnecessary PII).

Engine contract (for the developer; extends the v0.2 pseudo-code):

```python
def run_matching(session_id, mode, rule_version, seed):
    pool = paid_bookings(session_id)                       # status paid_awaiting_group, consents current
    pool = [b for b in pool if eligible(b)]                # age attestation, not suspended
    cells = partition(pool, key=lambda b: (b.conversation_language, b.budget_tier_id))
    tables, leftovers = [], []
    for cell in cells:
        cell = sorted(cell, key=stable_shuffle(seed))       # reproducible
        groups = form_groups(cell, min_size=4, max_size=venue_capacity(session_id),
                             forbid=mutual_blocks(cell),     # hard
                             objective=objective_for(rule_version))  # baseline_random | interest_opt_v1
        tables += groups.tables
        leftovers += groups.unseated                        # < 4 left in a cell
    # Try to seat leftovers in a LOWER-or-equal tier table of the same language (never higher)
    tables, leftovers = place_leftovers_downward(tables, leftovers)
    assign_venues(tables)                                   # venue tier <= min member cap; capacity >= size
    log_run(session_id, mode, rule_version, seed, inputs_hash(pool), explain(tables))
    return tables, leftovers                                # leftovers -> waitlist offer / rebook / refund policy
```

Objective `interest_opt_v1` (monitoring and variant only; baseline = random within constraints, Phase 1 §7): maximise `score(G) = 0.6·I(G) + 0.4·C(G)`. `I` is the mean pairwise Jaccard of Q05 topics among members who answered; `C` is the minimum member-to-group mean similarity. Missing answers are re-weighted, not penalised. Ties are broken by the stored seed. Weights are hypotheses, not validated (A08).

**D. Trust & Safety sub-module** — case queue sorted by severity then SLA, with case detail, actions and appeals. The workflow is in §4.4.2.

### 4.2.3 Payment & Refund Management

| Screen | Content | Actions |
|---|---|---|
| Transactions | `payments` list: ref, booking_ref, amount, status, failure_code, method_brand, PSP ID, created, succeeded, reconciled ✓/✗ | Open in PSP dashboard (deep link); view webhook trail |
| Refunds | `refunds` list: amount, reason, status, initiated_by, approved_by, PSP refund ID, age | **Create refund** (manual/goodwill → needs a second approver); **Retry failed** (same idempotency key) |
| Batch refunds | Generated automatically when a table is cancelled; shows a list of affected bookings plus the user's choice (rebook/refund/pending) | Approve batch (finance) → refunds `processing` |
| Webhooks inbox | `payment_webhook_events` with signature ✓/✗, processed ✓/✗, error | Re-process (idempotent) |
| Reconciliation (daily) | Settlement file vs ledger: matched / missing-in-ledger / missing-in-PSP / amount mismatch | Resolve with a reason; unresolved > 2 days alerts finance + owner |
| Disputes | Chargebacks with evidence pack (booking, consent version, attendance) | Submit evidence via the PSP |
| Anomalies | Double charge (two `succeeded` payments for one booking); refund > payment; refund older than [CONFIG] 10 days in `processing` | One-click "refund duplicate" (reason `duplicate_charge`, auto-approved by rule) |

Refund rules engine (configurable, legally reviewed):

```text
organizer_cancel                  → 100 % automatic, no approval
seat_unavailable (paid too late)  → 100 % automatic
user_cancel before deadline       → 100 % automatic (policy version on the booking)
user_cancel after deadline        → policy.late_cancel_refund_pct (default 0 % until legal sign-off)
goodwill / dispute                → manual, maker-checker, reason required
```

### 4.2.4 Live Event Monitoring

**Tonight board** (auto-refresh every 30 s; one row per table):

| Column | Source | Alert rule |
|---|---|---|
| Session / time | event_sessions | — |
| Venue + table code | event_tables, venues | venue_confirmed_at missing at T-3 h → amber |
| Confirmed / checked-in | bookings | checked-in < 3 at start + 15 min → amber; < 2 at + 30 min → red (consider closing the table politely) |
| Late cancellations today | bookings | any → info |
| Open incidents | safety_reports (count only for ops; content for T&S) | any S1/S2 → red, pinned |
| Coordinator on duty | rota | none assigned at T-2 h → red |

**Incident console:** a one-click "call venue day-of contact" (masked dial-out); templated messages to one table (`RUNNING_LATE`, `VENUE_CHANGE`, `EVENT_CANCELLED_TONIGHT`), sent individually, never as a group thread (R06); "create safety case" pre-filled with the table context; and an escalation checklist (§4.4.2).

---

## 4.3 Message templates referenced by the flows (ar / en)

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

---

## 4.4 Operations Playbook

### 4.4.1 Scenario A — a table fails to reach quorum 24 h before the event

**Definitions:** quorum = **4** confirmed paid seats per table (F02/A04). `lock_at` = `starts_at − 24h` (the scenario's checkpoint). Reveal happens only after a successful lock (C4).

**Timeline**

| Time | Who | Action |
|---|---|---|
| T-72 h → T-48 h [CONFIG] | System (job) | **Early warning:** a dry-run each 6 h. If a table is projected below 4, flag amber on the Session board and notify ops. Ops may push the waitlist, contact Q02-alternate holders of *other* sessions (only those who opted in), or plan a merge. No user-facing message yet. |
| T-26 h | System | Final dry-run; posts a decision card per at-risk table to ops (`merge possible`, `waitlist can fill`, `cancel`). |
| **T-24 h (`lock_at`)** | System + ops (on-call) | Run the decision tree below. Must finish within [CONFIG] 60 min; reveal waits for it. |
| T-24 h + ≤ 60 min | System | Locked tables → reveal (`VENUE_REVEALED`). Cancelled tables → `QUORUM_FAIL_CHOICE`. Venue notified of the final table count. |
| T-24 h → `choice_deadline` (+48 h, capped at the alternate session's `booking_closes_at`) | Users | Choose rebook or refund. No choice ⇒ automatic full refund. |
| After deadline | System + finance | Batch refunds processed; daily reconciliation confirms. |

**Decision tree at `lock_at` (per session, per language × tier cell)**

```text
For each table with confirmed_count < 4:
 1. MERGE within the same session?
      Find another table in the same session with the same language,
      venue tier ≤ every member's cap, no blocked pairs, and combined size ≤ venue capacity.
      → If found: move members (MOVED_TABLE notice), keep the better-fitting venue, release the other venue slot.
 2. FILL by invitation?
      Notify (individually) users who saved this session as a Q02 alternate, plus 'notify-me' users
      for this language, that seats are open. They book and pay normally.
      → If the table reaches 4 within the window (30 min [CONFIG]): lock. (Hold the lock decision max [CONFIG] 60 min.)
 3. MOVE DOWN-TIER?
      If a member's cap ≥ the other table's venue tier → may be seated there (never move anyone UP in cost).
 4. Otherwise CANCEL the table (status cancelled_quorum):
      • Every member → booking status cancelled_by_organizer, resolution = {rebook options, refund}.
      • Rebook options = Q02 alternates first, then other sessions with seats, same language and ≤ tier.
      • Never auto-move a user to another date without their explicit choice.
      • Venue informed immediately (template VENUE_TABLE_RELEASED) — keeps the partner relationship.
Never: break a hard constraint, mix languages, exceed capacity, overbook, or reveal a venue for an unlocked table.
```

**After lock (T-24 h → start): a confirmed member cancels and the table drops to 3** (Phase 1: "إلغاء تحت4 يفعّل سياسة المجموعة"):

| Remaining | Action [proposed policy, product sign-off] |
|---|---|
| 3 | Try waitlist fill (short window). If unfilled by T-3 h: message the 3 members, offering **go ahead as 3** (default) or **switch to a full refund / rebook**. Ops notes the outcome. |
| ≤ 2 | Cancel the table as organizer (full refund or rebook), tell the venue, and update the Live board. |

**SLA / KPIs to watch for this scenario:** % tables cancelled for quorum per session; % of affected users choosing rebook vs refund; time from `lock_at` to the last notification (target ≤ 60 min); refunds completed within [CONFIG] 10 days.

**D19 simulation to run before launch:**
1. Seed 13 paid bookings in one session (AR, same tier, venue capacity 6).
2. Expect 2 tables of 6 plus 1 leftover. The leftover gets down-tier placement if possible; otherwise it follows the rebook/refund policy. A table of 7 must never be created.
3. Seed a second session with 5 bookings, then cancel 2 of them at T-25 h.
4. Verify the merge/invite/cancel path, the notifications, the batch refunds and the audit entries.

### 4.4.2 Scenario B — a user reports another user during or after the event

**Severity levels and response targets** [proposed; T&S to confirm]

| Sev | Examples (category) | First response | Interim measure (automatic on submit) | Decision target |
|---|---|---|---|---|
| **S1** Critical | threat or violence, sexual harassment with physical contact, any `immediate_danger = true` | Immediately: on-call coordinator paged; the user sees the "call 999" screen | Mutual block + **temporary suspension of the reported user** pending review | 24 h |
| **S2** High | harassment, stalking or unwanted contact after the event, photographing without consent, fraud | ≤ 2 h (during events) / ≤ 12 h | Mutual block; reported user removed from future tables until decided | 72 h |
| **S3** Medium | persistently disruptive or disrespectful behaviour | ≤ 24 h | Mutual block | 7 days |
| **S4** Low | minor etiquette, no-show complaint | ≤ 72 h | None (or mutual block if requested) | 14 days |

**Flow — during the event**

```text
User taps "إبلاغ خاص" (SCR-07/10) or calls the coordinator in-app
 ├─ immediate_danger = true?
 │     → App shows: "اتصل بالطوارئ 999 فورًا" (call button) — authorities first (Phase 1 §11)
 │     → Page the on-call coordinator (push + SMS); coordinator calls the venue day-of contact
 │       to ask staff to assist, and offers the reporter a safe exit (e.g. venue staff, taxi).
 │     → Case created as S1; reported user temporarily suspended (cannot book; future bookings held).
 └─ otherwise
       → Case created, severity proposed by category, mutual block applied immediately.
       → Coordinator may check in with the reporter in-app; never confronts the reported person
         in front of the table unless venue staff/safety requires it.
Live board shows the incident pin (ops sees category + table, not narrative).
```

**Flow — after the event (same case pipeline)**

| Step | Owner | Action | Record |
|---|---|---|---|
| 1 Intake | System | Case `TS-YYYY-NNNN`; reporter gets `REPORT_RECEIVED`; mutual block applied; if a mutual connection exists between the two, it is removed silently | `safety_reports`, `user_blocks`, audit |
| 2 Triage | T&S | Confirm severity, check for related or earlier cases on the same reported user (pattern), set the SLA | `severity`, `sla_due_at` |
| 3 Gather | T&S | Reporter follow-up in-app (optional); venue statement if relevant; check-in and table data. **Do not** contact other tablemates without the reporter's consent, and never reveal the reporter's identity. | Notes (P4, encrypted) |
| 4 Hear the other side | T&S | Notify the reported user that a report about their conduct at `{date}` was received, *without* reporter identity, and invite a response within 72 h [CONFIG]. Skip only where notifying would create risk (S1, legal advice). | `report_actions` |
| 5 Decide | T&S (ban needs a second approver) | Outcome: `no_action` · `warning` · `suspension (n days)` · `permanent ban` · `referral_authorities` (legal-reviewed) | `report_actions` with rationale |
| 6 Communicate | System | Reporter → `REPORT_OUTCOME` (generic; no sanction details beyond "action taken"). Reported user → decision with reason category and the appeal link. | notifications |
| 7 Appeal | T&S (different reviewer) | One appeal within 14 days [CONFIG]; reviewed by someone who did not decide the case; final | `appealed` → `closed` |
| 8 Close & learn | T&S + ops | Tag the root cause (venue, matching, policy gap); feeds the D23 risk register | case tags |

**Sanction ladder** [proposed]: first S3 → warning; second S3 within 6 months or any S2 → suspension; repeat S2 or any confirmed S1 → permanent ban. Bans block re-registration by `phone_lookup_hash`. The mutual block is permanent regardless of outcome.

**Rules that never change:** the reporter's identity is never disclosed to the reported user; reports are never inferred from star ratings; there is no public "trust score"; requests from authorities for data go to legal, not ops; P4 case data is visible to T&S only, and each read is audited.

**D19 simulation to run before launch:** submit an S1 report during a live test table, then verify the paging, the 999 screen, the suspension, the hidden identity in the reported user's notice, the audit entries, and the appeal by a second reviewer.

---

# 5. Customer Journey Map (D12)

## 5.0 How this differs from the User Flow (D13)

| | User Flow (v0.2 §2, D13) | Customer Journey Map (this section) |
|---|---|---|
| Question answered | *Which screens and steps does the system present?* | *What does the person do, feel and struggle with — including outside the app?* |
| Unit | Screen → action → screen | Stage of the relationship with the service |
| Includes | System states, branches, errors | Off-app moments (deciding, travelling, sitting at the table, talking afterwards), emotions, frictions, opportunities |
| Owner / use | Designers and developers building screens | Product, UX and ops prioritising improvements and research |

**Evidence status.** No interviews have been run yet (D11 "لم ينفذ ميدانيًا"). Every pain point is therefore a **hypothesis** tied to a Phase 1 ID (A/F/R) or a v0.2 persona lens (Ahmed = Qatari or long-term resident, Arabic table; Sara = newcomer, English table). This meets the D12 acceptance criterion "ربط نقاط الألم بأدلة أو افتراضات". Validate each one in the 12–18 discovery interviews (A01) and the concierge pilot.

## 5.1 Journey map

| Stage | User actions | Touchpoints | Emotions / state of mind | Pain points / frictions (hypotheses) | Opportunities for improvement | Basis · KPI |
|---|---|---|---|---|---|---|
| **1. Discovery** | Hears of the service through a friend, Instagram or an alternatives page (Qatar Living, InterNations); reads the landing page; compares it with library meet-ups or InterNations events; checks the price and "is this a dating app?" | Social posts, word of mouth, landing page, onboarding cards (SCR-01), FAQ, app-store page | Curious, but guarded about privacy and reputation, and sceptical: "will the people be like me? is it safe?" (Ahmed: privacy; Sara: safety and cost) | • Unclear what is being bought (event vs dating vs networking) (F01, R09) · • Fear of being seen or photographed (Phase 1 §5 privacy & reputation) · • Hidden total cost (F09; Sara) · • Free alternatives exist, e.g. the Qatar National Library language exchange (C02) · • Unclear language of the table (F04) | • First-screen promise: "small organised table, no photos, clear price" (v0.2 onboarding) · • Show the **total expected cost** (fee + typical food band) before sign-up · • State the table language on every session card · • Safety page in plain words: public venues, conduct rules, private reporting · • Honest positioning vs alternatives: "we organise the table, the group and the time" | A01, A03, F01, F04, F09, C01–C03 · KPI: landing → sign-up start rate (to define in D22) |
| **2. Registration & Questionnaire** | Enters phone, OTP; ticks eligibility and consents; answers Q01, Q04–Q08; may skip optional questions or save and exit | SCR-02a/b/c, SCR-03, SMS, privacy notice | Wants it quick; may be wary of "personality tests"; reassured when told *why* each question is asked | • OTP SMS delays (new arrivals with roaming numbers; [CONFIG] country list) · • Consent wall feels legalistic · • Fear that answers judge them ("am I being scored?") (R09) · • Q04 budget question feels like an income question (Phase 1 Q04 limits) · • Q07 practical-needs question may feel intrusive (R03, A10) | • Max 6 profile cards; progress bar; "why we ask" on each (Phase 1 §6) · • Layered consents: three short checkboxes, full text on tap · • Q04 framed as "this evening's food budget", not income · • Q07 = a private contact request only, no detail fields (until O04) · • Save & exit with a draft; resume on the next visit | Q01–Q08, A10, R03, R09 · KPI: **questionnaire completion ≥ 75 % within 7 days** (Phase 1 §10) |
| **3. Booking & Payment** | Chooses coffee or dinner (Q03); picks a session (Q02) and optional alternates; reviews the summary and policy; pays on the hosted page; returns to the app | SCR-04, SCR-05, PSP hosted checkout, 3-D Secure, receipt notification, SCR-05P | Commitment moment: hesitation ("is it worth 59?"), fear of being charged twice, relief when confirmed | • Only 1–2 sessions offered (R02); may not fit the user's week · • Unknown venue = uncertainty (F07) · • Payment redirect drop-off; 3-DS friction; slow confirmations (R07) · • Seat taken while paying (race) · • Unclear cancellation terms (F10) | • Show district, price band and accessibility up front; reveal only the exact venue later (F07 test) · • Q02 alternates reduce the later loss if quorum fails · • 10-min seat hold with visible timer; idempotent pay button; "you won't be charged twice" copy · • Auto-refund if a seat is lost after payment (E-PAY-5) · • Policy box with an absolute deadline ("حتى الأربعاء 7:30 م") instead of "24 hours before" | A03, A07, F07, F10, R02, R07 · KPI: **payment conversion ≥ 20 % of qualified viewers within 14 days** (Phase 1 §10) |
| **4. Pre-event** (payment → arrival) | Waits for the group; receives "table confirmed"; receives the venue reveal (T-24 h default); plans transport; may cancel, rebook or join the waitlist; gets a reminder on the day | SCR-06 dashboard + countdown, SCR-07, push/SMS (`TABLE_LOCKED`, `VENUE_REVEALED`, reminder), maps app, support chat | Anticipation mixed with nerves ("who will be there? what if no one talks?"); impatience during "forming"; relief at reveal | • "Forming your table" feels opaque or long (v0.2 step 5) · • Quorum failure disappoints (A04, R02) · • Late reveal clashes with planning or parking in Doha traffic (F07) · • No way to know who is coming (by design) increases nerves · • Life changes → late cancellation penalty anxiety (F10, F11) | • Timeline stepper with **exact times** for lock and reveal · • Quorum failure handled kindly: one tap to rebook (alternates first) or refund, default refund (§4.4.1) · • Show "{n} people confirmed" after lock (count only) · • Reveal message includes parking or arrival tips and the table code · • Q06-based prep: share the opening question idea in the reminder ("سؤال افتتاحي") | A04, F07, F10, F11, R02 · KPI: % tables cancelled for quorum; cancellation rate before lock vs after |
| **5. During Event** | Travels; finds the venue; asks for the table by code; taps "I'm here"; meets 3–5 people; orders and pays their own bill; may feel uncomfortable and seek help | Venue staff, table code, SCR-07 check-in, in-app coordinator, private report (SCR-10), venue bill | First-minute awkwardness → warming up, or discomfort; desire for a graceful exit; self-consciousness about photos | • Can't find the table, or staff don't know the booking (F06) · • Late arrivals or no-shows leave a thin table (A04, F11) · • One person dominates the talk (A04 test) · • Bill confusion if the venue presents one bill (F09) · • Someone takes photos, or behaves inappropriately (R04) | • Venue contract requires a reserved, labelled table and separate bills (F06, F09) · • Optional opening-question card on the table (Q06 "سؤال افتتاحي") · • Visible "need help?" button; coordinator on duty for every live table · • Default no-photo rule in the conduct text plus a gentle reminder at check-in · • Clear "leave anytime" norm in pre-event copy | A04, F06, F09, F13, R04 · KPI: **attendance ≥ 85 %** of non-cancelled bookings (Phase 1 §10); check-in rate |
| **6. Post-event** | Rates the experience and the venue; chooses whether to allow contact with each tablemate (mutual consent); may report privately; books again (or not) | SCR-09 feedback, connection picker, SCR-10 report, push "book your next table", rebook flow | Warm afterglow or neutral; wants to stay in touch with some people without pressure; may feel uneasy about someone | • Fear that saying "no" to contact is visible to others (R06) · • Phone numbers shared in an ad-hoc WhatsApp group (R06) · • Nothing pulls the user back; the next date doesn't fit (A12) · • An incident left unaddressed erodes trust (F13) | • Mutual-consent connections only; "no" is never shown (F14, Q08) · • Never create group chats with numbers · • "Book again with a new table" deep link within 48 h, with the next 2 sessions · • Reports processed with SLA and outcome notice (§4.4.2) · • Feedback loop to venue scoring and matching review | A12, F13, F14, Q08, R06 · KPIs: **comfort rating 4–5 for ≥ 80 % of respondents**; **second paid booking ≥ 25 % within 30 days** (Phase 1 §10) |

## 5.2 Emotional curve (hypothesis to test)

```text
Emotion  +3 |                                                     ★ table warms up      ☺ connection made
         +2 |                     ✓ payment confirmed        ✓ venue revealed
         +1 |   curiosity                                                                     ↘ "book again?"
          0 |──────────────────────────────────────────────────────────────────────────────────────────────
         -1 |            consent wall      "forming…" wait                  first-minute awkwardness
         -2 |  "is it safe/dating?"            ▼ quorum fail (if it happens)         ▼ incident (rare, severe)
              Discovery   Registration+Q   Booking+Payment   Pre-event        During event      Post-event
```

Biggest drops to design against: (1) the **trust question at discovery**, (2) the **opaque "forming" wait**, (3) a **quorum cancellation**, (4) the **first five minutes at the table**. Each has an opportunity owner in §5.1.

## 5.3 Research hooks (feed D11 / D21)

| Stage | Validate in interviews / pilot | Measure (D22 definitions) |
|---|---|---|
| Discovery | Which promise wording is understood as "not dating"; acceptable total cost | Landing → start; drop at the price card |
| Registration & Q | Comprehension and usefulness of each Q (cognitive interviews, 2 rounds × 6; Phase 1 §6) | Completion ≥ 75 %; time per card; skip rate per optional Q |
| Booking & Payment | Willingness to pay the fee separately from food (A03); reveal-timing preference (F07) | Payment conversion ≥ 20 %; PSP failure codes |
| Pre-event | Tolerance of "forming" time; reaction to rebook offers | Quorum-cancel rate; rebook vs refund split |
| During | Table size comfort (4 vs 6), facilitation need (A04) | Attendance ≥ 85 %; check-in; incidents by severity |
| Post-event | Contact preferences; reasons for not rebooking | Comfort ≥ 80 % (4–5); repeat ≥ 25 % at 30 days |
