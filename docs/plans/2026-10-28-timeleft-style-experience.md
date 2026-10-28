# Timeleft-style experience — implementation plan

> **For executors:** Use a task-by-task execution approach (subagent-driven or inline batch execution) to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Rightime user web app around a quiz-first, Timeleft-style experience, with an honest content set and questionnaire v2, without changing the per-seat payment model.

**Architecture:**
- **Data:** display metadata lives in the database (migration 008). Questionnaire v2 is staging seed data.
- **API:** gains a public preview and carried-over answers.
- **Web:** the quiz flow logic (pure functions) lives in `web/quiz-flow.js` and is unit-tested in Node. Screens stay in `web/app.js` (vanilla ES modules, hash router).

**Tech Stack:**
- PostgreSQL 16 / Supabase.
- Node 22 API (`node --test`), which also runs on Deno on the edge.
- Vanilla JS web app on Vercel, with Playwright UI tests.

**Spec:** `docs/specs/2026-10-28-timeleft-style-experience-design.md`

## Global Constraints

- **Brand:** brand name is exactly `Rightime`. No Timeleft name, logo, photo, review, statistic or award anywhere.
- **Matching copy:** never claim personality matching. Table forming = language, budget, shared interests.
- **Payment:** the per-seat organising fee is unchanged. The fee and refund numbers come from the API or config, never hard-coded in copy.
- **Locale and contrast:** Arabic first (RTL); every string exists in `ar` and `en`. Contrast check passes in light and dark.
- **CSP:** unchanged (`script-src 'self'`; fonts only from Google Fonts).
- **Repo hygiene:** screenshots go to a temp dir unless `UI_SHOTS=docs`. No model identifiers in commits.

## File map

| File | Responsibility |
|---|---|
| `qatar/db/migrations/008_question_display.sql` | display columns on `questions` / `question_options` |
| `qatar/ops/seed_questionnaire_v2.sql` | QA-2026-02 content; retires v1, publishes v2 (idempotent) |
| `qatar/api/src/routes/user.js` | `questionView()`, `GET /questionnaires/preview`, `carried` + `has_submitted_any` |
| `qatar/api/test/helpers.mjs` | template loads 008 + v2 seed; `signUp` answers Q10/Q11 |
| `qatar/api/test/quiz.test.mjs` | API tests for preview / carried / v2 submit |
| `qatar/web/quiz-flow.js` | pure: step list with interstitials, `vibeOf()`, local quiz store shape, answers→payload |
| `qatar/api/test/quiz-flow.test.mjs` | unit tests for `web/quiz-flow.js` |
| `qatar/web/app.js` | screens: welcome, quiz, interstitials, sign-up chain, what-you-get, tab shell, home/my-events/profile |
| `qatar/web/strings.js` | new `ar`/`en` strings |
| `qatar/design/tokens.json` → `qatar/web/tokens.css` | beige bg, `cta` gradient, display fonts |
| `qatar/web/styles.css`, `index.html` | chips, scale, interstitials, tab bar, display font link |
| `qatar/api/test/ui.test.mjs` | browser test of the new journey |
| `docs/qatar-phase4/README.md` | document 008, v2 seed, preview endpoint |

---

### Task 1: Migration 008 — display metadata

**Files:**
- Create: `qatar/db/migrations/008_question_display.sql`.
- Modify: `qatar/api/test/helpers.mjs` (migration list), `qatar/ops/runbook_{a,b}/run_simulation.sh`.

```sql
SET search_path = app, pg_temp;
ALTER TABLE app.questions
  ADD COLUMN IF NOT EXISTS section_ar text, ADD COLUMN IF NOT EXISTS section_en text,
  ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'list',
  ADD COLUMN IF NOT EXISTS scale_low_ar text, ADD COLUMN IF NOT EXISTS scale_low_en text,
  ADD COLUMN IF NOT EXISTS scale_high_ar text, ADD COLUMN IF NOT EXISTS scale_high_en text;
ALTER TABLE app.questions DROP CONSTRAINT IF EXISTS questions_layout_chk;
ALTER TABLE app.questions ADD CONSTRAINT questions_layout_chk CHECK (layout IN ('list','chips','scale'));
ALTER TABLE app.question_options ADD COLUMN IF NOT EXISTS emoji text;
ALTER TABLE app.question_options DROP CONSTRAINT IF EXISTS question_options_emoji_chk;
ALTER TABLE app.question_options ADD CONSTRAINT question_options_emoji_chk CHECK (emoji IS NULL OR char_length(emoji) <= 16);
```

- [ ] Apply on a scratch DB after 001–007. Run `tests/001_init_checks.sql`; expect ALL CHECKS PASSED. Adding columns with a constant default does not fire the published-version guard.
- [ ] Add 008 to the helpers list and the runbooks. Run `npm test`, the runbooks and pytest: all green.

### Task 2: Questionnaire v2 seed

**Files:**
- Create: `qatar/ops/seed_questionnaire_v2.sql`.
- Modify: `helpers.mjs` (template loads it after `seed_common.sql`), and `signUp()` gains `gender = "woman"` and `age = "age_25_34"`.

**Interfaces — produces these question keys:**
- Q09, Q10(`man`,`woman`), Q11(`age_18_24`,`age_25_34`,`age_35_44`,`age_45_54`,`age_55_plus`), Q12, Q13, Q14, Q15, Q16.
- Q01, Q04 (same option keys and `maps_to`).
- Q17, Q05 (keeps `food`,`travel`,`sport`,`tech`,`books_culture`,`creative_hobbies` and adds others).
- Q18, Q19, Q20, Q06 (same keys), Q21/Q22 (`s1`..`s5`), Q23, Q24, Q08, Q07 (same keys).

**What the seed does:**
- [ ] Wraps everything in `DO $$ … IF NOT EXISTS (… code = 'QA-2026-02') …`, so applying it twice is a no-op.
- [ ] Inserts the version as `draft` with all questions and options.
- [ ] `UPDATE … SET status='retired', retired_at=now() WHERE status='published'`.
- [ ] Publishes v2 with `approved_by` = the seeded owner admin (`…a003`).
- [ ] Inserts Q01/Q04 options with the same `maps_to` JSON as v1 (tier ids `…b1/b2/b3`).

**Tests:**
- [ ] Test (`quiz.test.mjs`) `preview returns v2 with display metadata`:
  - `GET /api/v1/questionnaires/preview` without a token returns 200 with code `QA-2026-02`;
  - Q05 has `layout: "chips"` and `max_selections: 5`;
  - Q21 has `layout: "scale"` with `scale_low` and `scale_high`;
  - every Q10 option has an `emoji` key;
  - there is no `non_binary` option;
  - no question has key `HUMOUR`;
  - Q09 has no option key `special`.

  Expect it to fail until Task 3.

### Task 3: API — `questionView`, preview, carried

**Files:**
- Modify: `qatar/api/src/routes/user.js:226-250` and the route table.
- Test: `qatar/api/test/quiz.test.mjs`.

**Interfaces:**
- **`questionView(q, opts, locale)`** returns `{ id, key, scope, answer_type, is_required, max_selections, layout, section, scale_low, scale_high, text, purpose, options: [{ id, key, label, emoji, is_exclusive }] }`.
- **`GET /api/v1/questionnaires/preview`** (auth `none`) returns `{ questionnaire_version_id, code, questions }`.
- **`GET /api/v1/questionnaires/current`** keeps its fields and adds:
  - `has_submitted_any: boolean`;
  - `carried: { from_version_id, answers: [{ question_id, option_ids }] } | null`, built only when there is no submitted response for the current version. Old answers map to current ids by `(question.key, option.key)`, and options that don't map are dropped.

**Tests:**
- [ ] `preview` (Task 2 test) passes.
- [ ] **Carried answers:**
  - create a user with a v1 submitted response: insert it through SQL on the template DB, using test user `u01` from `seed_common`, who answered Q05 `food`/`travel`;
  - log in as `u01` by issuing tokens through the helper;
  - `current` returns `has_submitted_any: true` and `submitted: null`;
  - `carried.answers` contains Q05 with the v2 option ids for `food` and `travel`.
- [ ] Submit v2 (Q10 + Q11 + Q01 + Q04) with `status: "submitted"` → 201. Then `current.submitted` is not null and `carried` is null.
- [ ] Submit without Q10 → 422 `REQUIRED_MISSING` for `Q10`.
- [ ] Run `npm test`: all green (existing e2e tests use the updated `signUp`).

### Task 4: Pure quiz flow module

**Files:**
- Create: `qatar/web/quiz-flow.js`.
- Test: `qatar/api/test/quiz-flow.test.mjs`.

**Interfaces:**
- **`INTERSTITIALS`:** `{ start: ["doha", "community"], Q11: ["how"], Q15: ["science"], Q05: ["vibe"], Q06: ["curating"], end: ["ready", "safety"] }`.
- **`buildSteps(questions)`** returns an array of `{ kind: "inter", id } | { kind: "q", key, index }`. It inserts the interstitials after their anchor keys, `start` first and `end` last, and ignores anchors whose key is absent.
- **`vibeOf(answersByKey)`** returns `"playful" | "calm" | "warm" | "curious"`, where `answersByKey` maps key → array of option keys. First matching rule wins:
  1. `Q12=extrovert` and `Q18=playful` → `playful`
  2. `Q12=introvert` and `Q13=logic` → `calm`
  3. `Q13=emotions` → `warm`
  4. otherwise → `curious`
- **`toPayload(answers)`** turns `{ [question_id]: string[] }` into `[{ question_id, option_ids }]`, keeping only non-empty arrays.
- **`QUIZ_STORE_KEY = "quiz"`**, holding the shape `{ version_id, answers }`.

**Tests:**
- [ ] `buildSteps` ordering, including a missing anchor.
- [ ] `vibeOf` for the four branches and the empty case.
- [ ] `toPayload` drops empty arrays.
- [ ] Run `node --test test/quiz-flow.test.mjs`. It fails first (module missing), then passes after implementation.

### Task 5: Visual tokens and base styles

**Files:**
- Modify: `qatar/design/tokens.json`.
- Regenerate: `qatar/web/tokens.css`, using `python3 qatar/design/build_tokens_css.py`.
- Modify: `qatar/web/styles.css` and `qatar/web/index.html`.

**Tokens:**
- `color.light.bg` changes to `#F4F1EC`.
- Add `cta #1C1A17`, `ctaEnd #4A4540` and `onCta #FFFFFF`, with dark equivalents (`cta #F3EEE7`, `ctaEnd #CFC7BC`, `onCta #141210`).
- Add `font.display.ar = "Amiri"` and `font.display.en = "DM Serif Display"`.

**Styles:**
- `.btn-primary` uses `linear-gradient(90deg, var(--c-ctaEnd), var(--c-cta))` (the order is mirrored in RTL through logical direction).
- `.chips` and `.chip` with emoji, selected state in brand maroon.
- `.scale` with 5 square buttons and end labels.
- `.inter` for interstitial layout.
- `.tabbar`, fixed at the bottom, `padding-bottom: env(safe-area-inset-bottom)`.
- `.display-title`, plus `.week-group` and `.event-card`.
- `.empty` with a "googly eyes" CSS illustration.
- `.dots-loader`: 6 coloured dots that rotate, with a `prefers-reduced-motion` fallback.

**Checks:**
- [ ] `index.html` font link adds `Amiri:wght@700` and `DM+Serif+Display`.
- [ ] Run `python3 qatar/design/contrast_check.py`: every pair passes in light and dark.

### Task 6: Quiz screens before and after sign-up

**Files:**
- Modify: `qatar/web/app.js` and `qatar/web/strings.js`.

**Screens:**
- **`scrWelcome`:** a dark hero with "تعرّف على أصدقاء جدد وجهًا لوجه". Buttons "ابدأ" (`#/quiz/0`) and "لديّ حساب" (`#/signin`).
- **`scrQuiz(stepStr)`:**
  - Loads the questions: `/preview` when signed out, `/current` when signed in. When signed in it pre-fills from `submitted`, else `carried`, else the local store.
  - Builds the steps with `buildSteps`.
  - Renders a question by layout:
    - list: full-width option cards;
    - chips: wrap;
    - scale: 1–5 with end labels.
  - Single choice advances automatically after 250 ms. Multi shows a Continue button, disabled until the required minimum is met, with the max enforced.
  - The topbar shows back plus the section label, and a progress bar sits under it.
  - Answers are saved to `q_quiz` on every change.
- **`scrInter(id)`:** content per id (spec §5).
  - `vibe` uses `vibeOf`.
  - `curating` animates 0→100 % over 2.4 s, then advances. With reduced motion it shows the final state immediately.
- **End of quiz:**
  - Signed out → `#/name`, then `#/signin` (phone), then `#/otp`, then `#/register`. The name is pre-filled into `display_name`, and the register screen is the existing consents screen without the name field.
  - After registration, or right away when signed in: POST `questionnaire-responses` `submitted` with `toPayload`, delete `q_quiz`, go to `#/what-you-get`.
- **`guard()`:** redirects to `#/quiz/0` only if `!q.submitted && !q.has_submitted_any`.

**Test:** covered in Task 8.

### Task 7: "What you get" page and the tab shell

**Files:**
- Modify: `qatar/web/app.js`, `strings.js` and `styles.css`.

**Screens:**
- **`scrWhatYouGet()`:**
  - Plan `{ kind: "per_seat", fee_minor }`, where `fee_minor` comes from the first session's `price_minor`, from `/api/v1/sessions`, falling back to hiding the number.
  - Shows the benefit list, the refund rule (`full_refund_until_hours` from a session's policy if exposed, else the existing `policyBox` copy), the FAQ as `<details>`, and the CTA "اختر موعدك" (`#/home`).
- **`renderTabbar(active)`:** shown on `#/home`, `#/events`, `#/inbox`, `#/profile` and hidden elsewhere.
- **`scrHome`:**
  - Display title "الدوحة" and a bell.
  - The next booking card if any.
  - Sessions from `/api/v1/sessions` grouped by week, relative to `Asia/Qatar` today:
    - هذا الأسبوع: `< 7 d`;
    - الأسبوع القادم: `< 14 d`;
    - لاحقًا.
  - Each card links to `#/sessions?s=<id>`, and `scrSessions` preselects that id.
  - Shows a banner "أكمل بطاقتك" when `has_submitted_any && !submitted`.
- **`scrEvents`:** the previous home content (hero, stepper, other bookings). Empty state with a "احجز مقعدك" CTA.
- **`scrProfile`:** avatar initial, name, count of completed events, and the sections from spec §7.

### Task 8: Browser test of the new journey

**Files:**
- Modify: `qatar/api/test/ui.test.mjs`.

**Test** `user journey: quiz first, sign-up, what you get, book, pay, details, cancel (AR)`:
- [ ] Open `/`, then "ابدأ".
- [ ] Pass the Doha and community interstitials.
- [ ] Answer every question:
  - pick the first option on list and scale questions;
  - pick one chip and Continue on chip questions;
  - for Q01 pick "العربية" and for Q04 pick "حتى 200".
- [ ] Assert the vibe card renders and that no `Timeleft` text appears in `document.body.innerText`.
- [ ] End screens, then name "Sara", then phone, then OTP (dev code), then consents.
- [ ] Assert "ماذا تحصل مع Rightime" is visible.
- [ ] Go to home, tap a session card, then review, then the mock checkout, then paid.
- [ ] Assert the tab bar is visible on home and that `#/events` lists the booking.
- [ ] Cancel. Take screenshots into `SHOTS`.
- [ ] Keep the existing admin UI test unchanged.
- [ ] Run `npm test`: all green.

### Task 9: Docs, staging rollout, live check

- [ ] README: document 008, the v2 seed, the preview endpoint, and the new flow.
- [ ] Commit and push.
- [ ] Apply 008 and the v2 seed on Supabase. Use `apply_migration` for 008. The seed is data, so use `execute_sql`; it is idempotent.
- [ ] Redeploy the `api` edge function from the repo files.
- [ ] Redeploy Vercel from the pushed commit.
- [ ] Live journey script: `live_ui.mjs`, updated for the quiz-first flow. Expect zero console errors and the coordinator buttons present.
