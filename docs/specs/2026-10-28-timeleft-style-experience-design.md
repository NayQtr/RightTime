# Rightime user app: Timeleft-style experience — design

**Status:** Approved by the owner on 2026-10-28.
**Source:** 75 screenshots of app.timeleft.com in Google Drive, folder `Rightime` (IMG_9642 to IMG_9723).

## 0. Owner decisions

| Topic | Decision |
|---|---|
| Payment | Keep per-dinner payment (organising fee per seat, today 59 QAR). Design the "what you get" page so a subscription can be added later. |
| Delivery | Build straight into the app; no separate prototype. |
| Questions dropped | "Meet someone special", "politically incorrect humour", non-binary gender. Relationship status and children stay. |
| Social proof | Honest content only. No Timeleft numbers, reviews, photos, logo or awards. Real numbers and reviews come after our first dinners. |
| Data | Collect every new question now, even before the matcher uses it. |
| Age | Age range, not date of birth. The 18+ attestation stays. |

## 1. What we take from Timeleft, and what we don't

**We take the experience pattern:**
- The quiz comes before sign-up.
- One question per screen.
- Single-choice answers advance on tap.
- Options carry emoji, shown as chips or a list.
- Section label on top and a thin progress bar.
- Interstitials between questions.
- The "we're curating your experience" loader.
- A "what you get" page with an FAQ.
- A four-tab app shell.
- A city title in a display face.
- Events grouped by week.
- Friendly empty states.
- Warm beige background, white rounded cards, near-black gradient pill buttons.

**We do not take anything that belongs to Timeleft:**
- Name, logo, photos or illustrations.
- Reviews or user names.
- Any statistic ("93 %", "13k+", "4M+ users", "50 countries").
- The Google Play award.
- Copy text word for word.

## 2. Honesty rules for copy (apply to every new string)

1. The matcher today uses **table language (Q01), budget (Q04) and interests (Q05)**. Until it uses more, no screen may say "we match you by personality". The "what you get" page says: "we form your table using language, budget and shared interests".
2. Research is cited with its source. We use the Harvard Study of Adult Development (running since 1938; Waldinger & Schulz, *The Good Life*, 2023). It found that close relationships are the strongest predictor of a happy and healthy life. No invented chart data.
3. The personality card says it is a light summary of the user's answers, not a scientific test.
4. Numbers shown to users are real configuration (fee, refund window, group size 4–6) or real data. Nothing else.

## 3. Flow

```
Welcome ─▶ Doha ─▶ Welcome-to-community ─▶ quiz (≈22 screens + interstitials)
       └─▶ "I have an account" ─▶ phone ─▶ OTP ─▶ home
quiz end ─▶ "Ready to meet 4–5 people?" ─▶ safety rules ─▶ first name ─▶ phone ─▶ OTP
        ─▶ consents (+18) ─▶ answers submitted ─▶ "What you get" ─▶ home (sessions)
```

- **Pre-sign-up answers:** kept in the browser (`localStorage` key `q_quiz`: version id + answers) until the first authenticated submit, then deleted.
- **Signed-in user with no submitted response:** takes the same quiz. Answers are submitted at the end.
- **Existing users with a submitted response from an older version:** are not blocked. Their old answers still serve bookings, because the profile is read by question key.
  - Home shows a "complete your card" banner.
  - It opens the quiz pre-filled with the carried answers.

## 4. Questionnaire QA-2026-02 (staging seed `qatar/ops/seed_questionnaire_v2.sql`)

**Keys:** the schema requires keys of the form `Q` + two digits. The new questions are Q09–Q24; Q02/Q03 stay reserved for the per-booking questions of v0.3.

**Versioning:**
- Published versions are immutable, so v2 is a new version.
- The seed retires v1 and publishes v2, approved by the seeded owner admin.
- Keys used by code are kept: Q01, Q04, Q05, Q06, Q07, Q08.
- Q05 keeps the v1 option keys it still offers (`food`, `travel`, `sport`, `tech`, `books_culture`, `creative_hobbies`), so the matcher and test data line up.

| # | Key | Section | Question (ar) | Type | Layout | Req | matching_use |
|---|---|---|---|---|---|---|---|
| 1 | Q09 | عنك | ما الذي تبحث عنه؟ | multi ≤2 | list | – | none |
| 2 | Q10 | عنك | كيف تعرّف نفسك؟ (رجل / امرأة) | single | list | ✓ | none |
| 3 | Q11 | عنك | ما فئتك العمرية؟ (18–24 … 55+) | single | list | ✓ | none |
| 4 | Q12 | شخصيتك | هل أنت أقرب إلى… | single | list | – | none |
| 5 | Q13 | شخصيتك | آراؤك عادةً يقودها… | single | list | – | none |
| 6 | Q14 | شخصيتك | ما الصفات التي تقدّرها أكثر في الصديق؟ | multi ≤3 | chips | – | none |
| 7 | Q15 | شخصيتك | وما الذي يحبه أصدقاؤك فيك؟ | multi ≤3 | chips | – | none |
| 8 | Q16 | عملك | إن كنت تعمل، في أي مجال؟ | single | list | – | none |
| 9 | Q01 | تفضيلات الطاولة | language (unchanged) | multi | list | ✓ | hard_constraint |
| 10 | Q04 | تفضيلات الطاولة | budget (unchanged) | tier | list | ✓ | hard_constraint |
| 11 | Q17 | اهتماماتك | لو كانت حياتك فيلمًا… | single | list | – | none |
| 12 | Q05 | اهتماماتك | ماذا تحب أن تفعل في وقت فراغك؟ | multi ≤5 | chips | – | soft_factor |
| 13 | Q18 | اجتماعي | ما مجموعتك المثالية؟ | single | list | – | none |
| 14 | Q19 | اجتماعي | ما الذي يصف أمسيتك المثالية؟ | single | list | – | none |
| 15 | Q20 | اجتماعي | بعد اللقاء أريد أن أشعر… | multi ≤3 | list | – | none |
| 16 | Q06 | اجتماعي | conversation help (unchanged) | multi | list | – | event_prep |
| 17 | Q21 | قيمك | ما أهمية العائلة لك؟ | single 1–5 | scale | – | none |
| 18 | Q22 | قيمك | هل يهمّك النجاح الأكاديمي؟ | single 1–5 | scale | – | none |
| 19 | Q23 | عنك | هل لديك أطفال؟ | single | list | – | none |
| 20 | Q24 | عنك | ما حالتك الاجتماعية؟ | single | list | – | none |
| 21 | Q08 | بعد اللقاء | contact after the event (unchanged) | single | list | – | ops_only |
| 22 | Q07 | بعد اللقاء | private practical arrangement (unchanged) | contact_request | list | – | ops_only |

**Qatar adaptations:**
- No alcohol hobbies; added كرك وقهوة and رحلات برية.
- Film genres: comedy, drama, adventure, mystery, documentary.
- The ideal evening uses coffee, not wine.
- Relationship options: أعزب/عزباء, متزوج/ة, مطلّق/ة أو أرمل/ة, أفضّل عدم الإجابة.
- Children: نعم, لا, أفضّل عدم الإجابة.
- All new questions are `data_class` P3.
- Nationality is not asked: it was not in the approved list, and data minimisation applies.

**Display metadata (migration 008):**
- `questions.section_ar/en`
- `questions.layout` ∈ {list, chips, scale}
- `questions.scale_low_ar/en` and `scale_high_ar/en`
- `question_options.emoji`

## 5. Interstitials (client side, anchored after a question key; skipped if the key is absent)

| After | Screen |
|---|---|
| start | Doha: "We start in Doha" (only active city) |
| start | Welcome to the community: what Rightime is, honestly |
| Q11 | How it works, in 4 steps (answer · pick a time and pay the fee · we form a 4–6 table · venue revealed the day before) |
| Q15 | What research says: Harvard Study of Adult Development, source cited |
| Q05 | Your card: a light vibe summary from Q12/Q13/Q18, labelled "not a scientific test" |
| Q06 | Loader "Preparing your experience" (saving preferences · finding sessions in Doha · preparing your first table) |
| end | "We've got the picture ✨ Ready to meet 4–5 people?" Yes / Not sure (→ What-you-get page) |
| end | Safety rules: phone never shared, contact only by mutual consent, private report, coordinator on duty |

## 6. "What you get" page (per dinner now, subscription-ready)

Built from a `plan` object: `{ kind: "per_seat", fee_minor }`. A future `{ kind: "subscription", … }` renders plan cards in the same slot.

**Content:**
1. The price strip: "organising fee per seat · food paid at the venue".
2. What you get:
   - a table of 4–6 people with a shared language and budget;
   - a venue we pick and reveal the day before;
   - an opening question;
   - a respectful, safe space;
   - contact only by mutual consent.
3. The refund rule from config (full refund until 48 h before; we cancel and refund if the table doesn't fill).
4. The FAQ:
   - Is it a dating app? No.
   - How is my table formed? Language, budget, shared interests.
   - What if I want to meet someone again? Mutual consent after the event.
   - What if it doesn't feel right? Contact the coordinator; private report.
5. The CTA: "Choose your time".

## 7. App shell after sign-up

**Bottom tabs** (fixed, safe-area aware, `aria-current`):
- الرئيسية
- لقاءاتي
- الإشعارات
- حسابي

There is no chat tab: we have no chat feature, and we don't fake one.

- **Home:**
  - "الدوحة" in the display face, with a bell.
  - The next-booking card if any.
  - "Upcoming sessions" grouped by week (this week / next week / later), with coffee/dinner icon cards.
  - Tapping a card opens booking with that session preselected.
- **My events:** the existing next-booking hero with the stepper, plus the other bookings. Empty state with an illustration and "Book your seat".
- **Notifications:** the existing inbox, with an empty-state illustration.
- **Profile:**
  - Avatar initial, name, count of events.
  - Sections: Account (my answers, decisions about me), Preferences (language), Help (coordinator call / WhatsApp, code of conduct), Sign out, Delete account.

## 8. Visual tokens (in `qatar/design/tokens.json`, regenerated CSS)

- `bg` becomes a warmer beige, `#F4F1EC`.
- New `cta` / `ctaEnd` near-black gradient pair with `onCta` white.
- Display fonts: Amiri for Arabic, DM Serif Display for Latin. Used for the city title and tab titles only. The body face stays IBM Plex Sans Arabic.
- The brand maroon stays as the accent (progress bar, selected chips, «ط» mark).
- The contrast check must pass in light and dark.

## 9. API

- **`GET /api/v1/questionnaires/preview`:** auth none, returns the published version and its questions with display metadata. No user data.
- **`GET /api/v1/questionnaires/current`** adds:
  - `has_submitted_any` (bool);
  - `carried`: answers from the user's latest submitted response of an older version, mapped by question key + option key.
- **Questions expose:** `section`, `layout`, `scale_low`, `scale_high`. Options expose `emoji`.

## 10. Out of scope (follow-ups)

- **Matcher upgrade:** balance Q11/Q10/Q12, overlap Q05.
- **Privacy notice:** update it to list the new data. This is part of the open legal item F8 and needs counsel before real users.
- **Subscription billing.**
- **Chat.**
- **Real reviews and numbers.**
