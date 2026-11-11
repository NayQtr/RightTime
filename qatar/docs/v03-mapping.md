# Spec v0.3 §1 → what is built (mapping, 10 Nov 2026)

Source: `docs/qatar-phase2/Qatar_Phase2_Completion_v0.3.md` §1 (screens SCR-xx, states, errors). Code as on branch
`rightime-app` on 10 Nov 2026. Rule (item 49, provisional): v0.3 stays the reference for approved texts; where the built
behaviour differs, **the built behaviour counts** and this table records the difference.

Status: **built** (as the spec, or the same intent with the differences named), **partly** (some parts missing),
**not built**. Web = `qatar/web/app.js` (route and function); app = `qatar/app/lib/...`.

Product differences that apply everywhere: women only, so member copy addresses a woman and counts are «سيدات»
(not «أشخاص»); the brand is HerZone (the spec says Rightime); the app books on the website (`bookOnWeb`) only where the
app has no booking screen for that step.

## Screens (§1.1, §1.2)

| ID | Screen | Status | Web | App | Notes |
|---|---|---|---|---|---|
| SCR-01 | Onboarding | built, differs | `#/welcome` `scrWelcome` | `ui/onboarding/welcome_screen.dart` | One welcome screen with the table drawing instead of a 3-card carousel; the owner's welcome phrase and headings. Quiz comes before sign-in (owner's flow). |
| SCR-02a | Phone | built | `#/signin` `scrPhone` | `ui/auth/phone_screen.dart` | +974 fixed prefix; other countries by setting (`PHONE_ALLOWED_COUNTRY_CODES`, item 38). `autocomplete="tel-national"`, numeric keypad. |
| SCR-02b | OTP | built | `#/otp` `scrOtp` | `ui/auth/otp_screen.dart` | One 6-digit field, `one-time-code`, paste, resend countdown from `resend_after`, attempts left shown. |
| SCR-02c | Eligibility & consents | built, differs | `#/register` `scrRegister` (+ `#/name`) | `ui/onboarding/register_screen.dart` | Adds the women-only confirmation; consents stored with document versions; marketing off by default. |
| SCR-03 | Questionnaire | built, differs | `#/quiz/{n}` `scrQuiz`, `quiz-flow.js` | `ui/onboarding/quiz_screen.dart` | Questionnaire v5 (QA-2026-05, 25 questions incl. personality and Q25) instead of the 6 profile cards; purpose line on every question; «لا تفضيل» exclusive; time left shown. |
| SCR-04 | Choose experience and session | built | `#/sessions` `scrSessions` | `ui/meetups/home_tab.dart` + `book_screen.dart` | Segmented coffee / dinner, table-language chips, seat status, waitlist when full, optional alternates (`#alts`), day and area filters above 8 sessions, occasion question (018). |
| SCR-05 | Summary & checkout | built | `#/booking/{id}/review` `scrReview` | `ui/meetups/book_screen.dart` | Fee separate from food, policy box, hold pill MM:SS (`SEAT_HOLD_MINUTES`), late no-refund acknowledgement, change session. |
| SCR-05P | Payment processing | built | `#/pay/return/{id}` `scrPayReturn` | `book_screen.dart` (polls every 4 s) | Web: P1–P4 as the spec (2 s polling for 60 s, then 10 s). App: polling and the paid state; no separate slow-confirm screen. |
| SCR-06 | Dashboard | built | `#/home` `scrHome`, `#/events` `scrEvents` | `ui/meetups/events_tab.dart` | Next-meetup card with badge, countdown, status line and action; 5-step tracker; other bookings; book another; help card. Banner stack is per screen, not a 0–2 stack. |
| SCR-07 | Event details | partly | `#/booking/{id}` `scrDetails` | `ui/meetups/event_details_screen.dart` | Built: essentials, table count then first names on the day, venue, table code, «فتح في الخرائط», check-in, support, report, cancel, contacts after the event, offline copy. Not built: the embedded static mini map (a maps link instead). `Asia/Qatar` label removed on the site (still in the app, item 18a). |
| SCR-08a | Cancel (member) | built | `#/booking/{id}/cancel` `scrCancel` | `ui/meetups/cancel_screen.dart` | Server-computed refund outcome, optional reason (3 options, no free text), destructive confirm, result. «انقلني لموعد آخر» alternative button: not built. |
| SCR-08b | Organizer cancellation | built | `#/booking/{id}/choose` `scrChoose` | `ui/meetups/resolution_section.dart` | Rebook (alternates first, tagged) or full refund; automatic refund after `REBOOK_CHOICE_HOURS`. |
| SCR-09 | Feedback | built | `#/booking/{id}/feedback` `scrFeedback` | `ui/meetups/feedback_screen.dart` | Overall, comfort, venue rating, private comment, would book again; low-rating reasons (023); mutual contact picker separate; report link separate. |
| SCR-10 | Private report | built | `#/report/{id}` `scrReport` | `ui/meetups/report_screen.dart` | Category, timing, who (first names), description, «أنا في خطر الآن» → 999 screen + coordinator alert (push and SMS, item 40); confirmation with case reference. |

Screens beyond §1.1 (built): notifications inbox (`#/inbox`, `inbox_tab.dart`, biometric lock in the app), my cases and
appeals (`#/cases`, `cases_screen.dart`), profile and privacy (`#/profile`, `#/privacy`), notify-me (`#/notify`),
plans (`#/plans`, display only), delete account (`delete-account.html`), forced update (`ui/common/update_screen.dart`).

## States

### Booking status badges (§1.0.1)

| Status | Status | Where | Notes |
|---|---|---|---|
| payment_pending | built | web `statusBadge()` `stPending`; app events tab | «بانتظار الدفع» as the spec. |
| paid_awaiting_group | built, differs | `step2` «تكوين الطاولة» | Spec «جارٍ تكوين طاولتك»; the badge reuses the tracker step label. |
| group_locked | built, differs | `step3` «تأكيد الطاولة» | Spec «الطاولة مؤكدة». |
| revealed | built, differs | `step4` «كشف المكان» | Spec «تم كشف المكان». |
| checked_in | built | `checkedIn` «تم تسجيل وصولك» | Spec «وصلت» (feminised and reworded). |
| completed | built, differs | `stCompleted` «كيف كانت التجربة؟» | The badge shows the hero line; spec «انتهى اللقاء». |
| waitlisted | built | waitlist line `onWaitlist` with position | Not a booking status on the server: a waitlist entry (§2.20) shown on the session card. |
| cancelled_by_user / cancelled_by_organizer / payment_failed / expired | partly | all show `stCancelled` «أُلغي الحجز» (organizer in danger style) | Spec has four different labels; one shared label today. |

### Hero card per status (SCR-06)

| Status | Status | Key |
|---|---|---|
| paid_awaiting_group | built | `stForming` |
| group_locked | built | `stLocked` («سيدات» instead of «أشخاص») |
| revealed | partly | the card shows «عرض التفاصيل» (`viewDetails`); venue name and directions are on SCR-07. `stRevealed` exists in `strings.js` but the card does not use it |
| day-of | built | `stDayOf` + `imHere` |
| completed | built | `stCompleted` + `rateIt` |
| waitlisted | partly | position line on the session; «الخروج من القائمة» not built |
| cancelled_by_organizer | built | `stOrganizer` + `chooseNow` |

### Payment processing phases (§1.3.1)

| Phase | Status | Web key | App |
|---|---|---|---|
| P1 redirecting | built | `redirecting` | opens the checkout page outside the app (`LinkOpener`) |
| P2 confirming | built | `confirming` | polling |
| P3 slow confirm | built (web) | `slowConfirm` | not built (keeps polling) |
| P4 success | built | `allSetTitle`, `paidTitle`, booking ref | `paidTitle` in success colour |

### Matching phases (§1.3.2)

| Phase | Status | Notes |
|---|---|---|
| M1/M2 forming | built | tracker at step 2, `stForming`; internal runs not exposed |
| M3 locked | built | `stLocked`, `confirmedCount` |
| M4 waiting for reveal | partly | countdown and `venueHidden`; no venue-shaped skeleton block |
| M5 below quorum | built | organizer cancellation (SCR-08b) |

### Refund tracker (§1.3.5)

| State | Status | Key |
|---|---|---|
| requested / processing / refunded / failed | built | `rfRequested`, `rfProcessing`, `rfRefunded`, `rfFailed` (+ `rfNone`) |

### Loading and empty

| State | Status | Where |
|---|---|---|
| Skeleton while loading | built | web `loadingView()` `.skel`; app `SkeletonList` (still under reduced motion) |
| Empty lists | built | web `.empty`; app text under the title (see `qatar/docs/design/handoff.md` §4) |

## Errors (§1.3.3)

| ID | Status | Where | Notes |
|---|---|---|---|
| E-PAY-1 declined | partly | `scrPayReturn` failed phase: `paymentFailed` + `noDoubleCharge`, «ادفعي الآن» | One message for every failed payment; the bank-declined wording and «استخدمي وسيلة أخرى» are not separate. |
| E-PAY-2 not completed | built | `paymentFailed` «لم يكتمل الدفع.», pay again while the hold lasts | |
| E-PAY-3 unknown result | built | P3 slow confirm; reconciliation on the server | |
| E-PAY-4 hold expired | built | `holdExpired` + `chooseAgain` (server `HOLD_EXPIRED`) | |
| E-PAY-5 paid, seat gone | partly | server refunds automatically (§2.29); shown through the refund tracker and notifications | No dedicated dashboard banner text. |
| E-FULL-1 full on select | built | `full` badge, `joinWaitlist` | |
| E-FULL-2 filled meanwhile | built | `SESSION_FULL` message + waitlist button (`waitlist_href`) | Next available session is not highlighted. |
| E-LANG-1 no session in her languages | built | `noSessions`, `editLanguages`, `notifyMe` (023); app `home_tab.dart` | |
| E-LANG-2 removing a booked language | not built | — | No blocking dialog on profile save; the booking keeps its language on the server. |
| E-LANG-3 tampered language | built | server `LANGUAGE_CONFLICT` (422), `languageMismatch` | |
| E-OTP-1 wrong code | built | server `OTP_INVALID` + `attemptsLeft` | |
| E-OTP-2 expired | built | server `OTP_EXPIRED`, resend | |
| E-OTP-3 too many | partly | server `OTP_RATE_LIMITED` / `OTP_LOCKED` with `Retry-After`; the message is shown | No {mm:ss} countdown from `Retry-After` (the app reads the header into `ApiError.retryAfter` but does not show it). |
| E-NET offline / 5xx | built | `failedView()` + `errorBanner()`, `offline`, `retry`; app `Loader` + `ErrorBanner` | Forms keep their input. |
| E-AUTH session expired | partly | silent token refresh; when it fails the site returns to `#/welcome`, the app to sign-in | No «انتهت جلستك» sheet that returns to the same screen. |

## Language conflict table (§1.3.4)

Built: sessions are listed only in her languages, grouped and labelled by table language (`langAr`, `langEn`); "another
language only" and "none in her languages" show E-LANG-1 with notify-me. No table mixes languages (server rule).

## Where spec texts were feminised on the site

The spec addresses a man; the site and app address a woman (CLAUDE.md rule). Same meaning, feminine forms
(`qatar/web/strings.js`, Arabic block; the app's `app_ar.arb` follows the same rule):

| Spec v0.3 | Site | Key |
|---|---|---|
| أدخل الرمز | أدخلي الرمز | `otpTitle` |
| أرسل رمز التحقق | أرسلي الرمز | `sendCode` |
| راجع حجزك | راجعي حجزك | `reviewTitle` |
| ادفع 59 ر.ق | ادفعي الآن | `payNow` |
| اختر الموعد من جديد | اختاري الموعد من جديد | `chooseAgain` |
| انضم لقائمة الانتظار | انضمي لقائمة الانتظار | `joinWaitlist` |
| لا توجد حاليًا مواعيد بلغة تختارها… | لا توجد حاليًا مواعيد بلغة تختارينها… | `noSessions` |
| عدّل لغاتك | عدّلي لغاتك | `editLanguages` |
| أعلمني عند توفر موعد | أعلميني عند توفر موعد | `notifyMe` |
| هذا الموعد بلغة لم تخترها في إجاباتك. | بلغة لم تختاريها | `languageMismatch` |
| …لا تغلق الصفحة ولا تدفع مرة أخرى. | …لا تغلقي الصفحة ولا تدفعي مرة أخرى. | `confirming` |
| سنرسل لك إشعارًا فور التأكيد. | سنرسل لكِ إشعارًا فور التأكيد. | `slowConfirm` |
| ستسترد 59 ر.ق كاملة… | ستستردين {fee} كاملة… | `refundFull` |
| إن لم تختر قبل {choice_deadline}… | إن لم تختاري قبل {deadline}… | `defaultRefund` |
| ألغينا هذه الطاولة. اختر: استرداد أو موعد آخر. | …اختاري: استرداد أو موعد آخر. | `stOrganizer` |
| اختر الآن | اختاري الآن | `chooseNow` |
| طاولتك مكتملة ({n} أشخاص)… | طاولتك مكتملة ({n} سيدات)… | `stLocked` |
| {n} أشخاص مؤكدون | {n} سيدات مؤكدات | `confirmedCount` |
| هل وصلت؟ | هل وصلتِ؟ | `stDayOf` |
| اذكر "Rightime" ورمز الطاولة لموظف الاستقبال. | اذكري "HerZone" ورمز الطاولة لموظف الاستقبال. | `mentionCode` |
| احجز موعدًا آخر | احجزي موعدًا آخر | `bookAnother` |
| تحتاج مساعدة؟ تواصل مع المنسق المناوب | تحتاجين مساعدة؟ تواصلي مع المنسق المناوب | `help` |
| اتصل بالطوارئ 999 فورًا | اتصلي بالطوارئ 999 فورًا | `emTitle` |
| إعادة المحاولة | حاولي مرة أخرى | `retry` |

Kept as the spec (already neutral): `paidTitle`, `holdExpired`, `paymentFailed`, `redirecting`, `cancelled`,
`refundNone`, `stForming`, `stCompleted`, `imHere`, the refund tracker labels, `reportSent`.

## Not built from §1 (summary)

SCR-07 static mini map; SCR-08a «انقلني لموعد آخر» button; E-LANG-2 dialog; E-AUTH return-to-screen sheet; separate
labels for the four cancelled statuses; venue line on the revealed hero card; leave-waitlist action; app slow-confirm
screen; OTP {mm:ss} countdown; dedicated E-PAY-1 and E-PAY-5 texts. Each is small; none is planned until the owner asks.
