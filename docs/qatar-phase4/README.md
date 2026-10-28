# Qatar MVP — Phase 4 build (staging)

This is the full-stack MVP for the v0.3 spec plus the v0.4 decisions. It includes:

- the database (`app` schema);
- the API (user, admin and payments);
- a mobile-first user web app (AR/RTL and EN/LTR);
- a role-based admin panel.

Everything here is **staging**: OTP codes come back in the API response and payments go through a mock PSP.

## Layout

| Path | What |
|---|---|
| `qatar/db/migrations/001_init.sql` | Schema: 34 tables, enums, functions (`hold_seat`, `rebook_booking`, `cancel_table_quorum`, …) |
| `qatar/db/migrations/002_api_support.sql` | Admin TOTP columns; `refresh_tokens`, `idempotency_keys`, `server_keys`, `admin_approvals`; staging `app_config`; pinned function `search_path`; RLS on every table; revokes for client roles |
| `qatar/db/migrations/003_otp_phone.sql` | Encrypted phone on OTP challenges, OTP purge, `captured_payment_for` (follows a rebook chain), chain-aware auto refunds |
| `qatar/db/migrations/004_cron_and_indexes.sql` | 47 covering foreign-key indexes; pg_cron jobs (hold release, unresolved organizer-cancel refunds) where pg_cron exists |
| `qatar/db/migrations/005_late_ack_and_admin_throttle.sql` | Audit F1: `bookings.late_no_refund_ack_at` (no-refund acknowledgement before paying after the refund cut-off). Audit F5: `admin_auth_attempts` + `ADMIN_LOGIN_*` config for admin sign-in/enrolment lockout (429 + Retry-After); daily purge job |
| `qatar/db/migrations/006_support_contact.sql` | Audit F10: `COORDINATOR_PHONE_E164` / `COORDINATOR_WHATSAPP` config for the coordinator call / WhatsApp buttons (`GET /api/v1/support/contact`) |
| `qatar/db/migrations/007_deny_policies.sql` | Explicit RESTRICTIVE deny-all RLS policy (`deny_all`) on every app table; same behaviour as before, clears the advisor notices. New app tables need the same policy |
| `qatar/db/migrations/008_question_display.sql` | Quiz display metadata: question `section`, `layout` (list / chips / scale), scale end labels, option `emoji` |
| `qatar/ops/seed_common.sql` | Staging seed: admins, tiers, venues, full v0.3 questionnaire, legal docs, 3 Arabic sessions on sale, `sim` helpers |
| `qatar/ops/seed_questionnaire_v2.sql` | Questionnaire QA-2026-02 (22 questions, Qatar-adapted; spec `docs/specs/2026-10-28-timeleft-style-experience-design.md`). Retires v1 and publishes v2; re-running is a no-op |
| `qatar/web/quiz-flow.js` | Pure quiz-flow logic (step order with interstitials, the vibe card, answer payloads), unit-tested in Node |
| `qatar/api/src/` | Framework-free API: `handle(Request) → Response`, the same code on Node and Deno |
| `qatar/api/edge-index.ts` | Supabase Edge Function entry point (deployed as `index.ts`) |
| `qatar/api/server.mjs` | Local runner: API plus the static web app and admin panel |
| `qatar/web/` | User web app (SCR-01…SCR-10, SCR-05P, SCR-08a/b, the 999 screen), mock checkout, `admin/` panel |
| `qatar/api/test/` | Parity (JS vs Python matching), API end-to-end, and browser (Playwright) tests |
| `docs/qatar-phase4/screens/` | Screenshots captured by the UI tests (refreshed only with `UI_SHOTS=docs`) |

## Deployed staging

- **Supabase project:** `qatar-mvp`, ref `fvodcnqmxskgzziwuwmz`, region ap-south-1, Postgres 17.
- **API base:** `https://fvodcnqmxskgzziwuwmz.supabase.co/functions/v1/api`
  - User routes: `…/api/v1/...`, for example `POST …/api/v1/auth/otp:request`.
  - Admin routes: `…/api/admin/v1/...`.
  - PSP webhook: `POST …/api/v1/payments/webhooks/test_psp`, HMAC-signed with `x-signature` and `x-timestamp` (±300 s).
- **Function settings:** the Edge Function `api` runs with `verify_jwt = false` because the API does its own authentication: RS256 user/admin JWTs, plus HMAC for webhooks. It reaches Postgres through the platform-injected `SUPABASE_DB_URL`. No database password or service-role key is in the code or on the client.
- **Web app and admin panel (Vercel):** https://qatar-mvp-staging.vercel.app (admin: `/admin/`). This is a separate Vercel project, `qatar-mvp-staging`, in team `rightime`, built from branch `rightime-app` with root `qatar/web`. The build copies `config.vercel.js` over `config.js`. The existing projects `rightime` and `rightime-app` were not touched.
- **Region pinning:** the database is in `ap-south-1`, but Edge Functions run next to the caller by default (`us-east-1` from the US), which made each call take about 7–12 s. The web clients therefore add `forceFunctionRegion=ap-south-1` (`apiRegion` in `config.vercel.js`). This is a query parameter, so no extra CORS header is needed. Calls now take about 1.2 s from the US, and should be faster from Qatar.
- **Scheduled jobs (pg_cron, migration 004):**
  - `app_release_expired_holds` runs every minute.
  - `app_refund_unresolved_organizer_cancels` runs every 15 minutes and uses `REBOOK_CHOICE_HOURS`. It creates refunds as `requested`; finance sends them with the batch approval.
- **Data API isolation:** the `app` schema is **not** exposed through the Data API. RLS is on for every table with no policies, and `anon`/`authenticated` have no privileges. Only the server-side function reads or writes data.

### Verified on 2026-10-23

A remote smoke run went through the whole user journey against the deployed function:

- OTP request and verify;
- registration with consents;
- questionnaire;
- session list;
- booking (`hold_seat`);
- mock checkout success via the signed webhook;
- event details (phase `forming`, venue hidden);
- cancel;
- notifications.

It also confirmed that a forged webhook gets 401 and an admin route without a token gets 401. The smoke script left one test user and one cancelled booking in staging.

## Run locally

Prerequisites: Node 22 and PostgreSQL 16+.

```bash
createdb qatar_dev
for f in qatar/db/migrations/00{1,2,3,4,5,6}_*.sql qatar/ops/seed_common.sql; do psql -v ON_ERROR_STOP=1 -1 -d qatar_dev -f "$f"; done
cd qatar/api && npm ci
DATABASE_URL=postgres://localhost/qatar_dev PORT=8787 npm start
# user app: http://localhost:8787/   admin: http://localhost:8787/admin/
```

Tests need a local server on port 5433 with user `app`. They build a template database, give each test its own copy, and drive Chromium through Playwright:

```bash
cd qatar/api && npm test          # 30 tests: 15 API e2e, 3 key encryption, 1 parity, 3 questionnaire API, 4 quiz logic, 4 browser
cd qatar/matching && python3 -m pytest -q
PGHOST=/tmp PGPORT=5433 PGUSER=app bash qatar/ops/runbook_a/run_simulation.sh
PGHOST=/tmp PGPORT=5433 PGUSER=app bash qatar/ops/runbook_b/run_simulation.sh
```

The browser tests save screenshots to a temp folder, so a test run leaves the repo unchanged. To refresh the committed screenshots in `docs/qatar-phase4/screens/`, run `UI_SHOTS=docs npm test` and commit the result.

## User experience (quiz first, spec 2026-10-28)

The user app follows the pattern of the Timeleft screenshots in the `Rightime` Drive folder, with Rightime's own content. Nothing of Timeleft's (name, photos, reviews, numbers) is used.

1. **Welcome**, then the quiz *before* sign-up: 22 questions, one per screen, plus interstitials (Doha, welcome, how it works, research with its source, your card, preparing, ready, safety rules). Answers stay on the device (`localStorage` `q_quiz`) until sign-up.
2. **Sign-up:** first name, phone, OTP, consents (18+). The answers are then submitted and the device copy is deleted.
3. **What you get:** per-seat fee from the API, benefits, refund rule, FAQ. The page renders a `plan` object so a subscription can be added later.
4. **App:** four tabs. *Home* (Doha, sessions grouped by week), *My events*, *Notifications*, *Account*.

- `GET /api/v1/questionnaires/preview` (no auth) serves the questions to signed-out visitors, with no user data.
- Users who answered an older questionnaire are not blocked. `GET /api/v1/questionnaires/current` returns `has_submitted_any` and `carried` answers (mapped by question and option key), and Home invites them to complete the card.
- Copy rule: tables are formed by language, budget and shared interests. The new questions are collected but not yet used by the matcher, so no screen claims personality matching.

## Admin sign-in (TOTP)

Admins have no passwords. Each one enrols once with a single-use token (valid 24 h), then signs in with email plus a 6-digit TOTP code.

- **Issuing a token:** an owner calls `POST /api/admin/v1/admins/{id}:enroll-token`.
- **The very first owner:** issue the token with SQL in the Supabase SQL editor, using any random string as the token:

  ```sql
  UPDATE app.admin_users
     SET enroll_token_hash = encode(sha256(convert_to('<token>', 'UTF8')), 'hex'),
         enroll_expires_at = now() + interval '24 hours'
   WHERE email = '<owner email>';
  ```

- **Enrolling:** open `/admin/#/enroll`, enter the email and token, and add the shown secret to an authenticator app.

The seeded admins use `@example.test` addresses and are placeholders. Replace them with real staff before use.

## Staging flags (`app.app_config`; environment variables of the same name override)

| Key | Staging | Production |
|---|---|---|
| `OTP_DEV_MODE` | `true`: the OTP code is returned in the API response | **`false`**; needs an SMS provider (not built) |
| `MOCK_PSP_ENABLED` | `true`: `/checkout/mock/{booking_id}` and `/api/mock-psp/*` | **`false`**; needs a real PSP adapter (O05) |
| `WEB_BASE_URL` | `https://qatar-mvp-staging.vercel.app` (`http://localhost:8787` for local runs) | the hosted web app origin |
| `CORS_ORIGINS` | `https://qatar-mvp-staging.vercel.app,https://qatar-mvp-staging-rightime.vercel.app` | the web app origin(s) only |
| `SEAT_HOLD_MINUTES` / `REBOOK_CHOICE_HOURS` / `FEEDBACK_WINDOW_DAYS` | 10 / 48 / 7 | per policy |
| `PACKING_MODE` | `min_leftovers` (`greedy_6` also available) | per v0.4 decision |

**Server keys (audit F6).** The five keys (`JWT_PRIVATE_PEM`, `DATA_KEY`, `PHONE_PEPPER`, `PSP_WEBHOOK_SECRET`, `SEAT_TOKEN_KEY`) can each be set as an Edge Function secret. A key that is not set is generated once and kept in `app.server_keys`.
- With the Edge Function secret `SERVER_KEYS_KEK` set (any random text of 40+ characters, entered only in the Supabase dashboard), every row in `app.server_keys` is stored encrypted (AES-256-GCM, `enc:v1:` prefix). Existing plaintext rows are encrypted in place on first use, keeping their values, so encrypted phone numbers and admin TOTP secrets stay readable.
- A missing or wrong KEK fails closed (HTTP 500). The keys are never regenerated over existing data.
- `GET /api/v1/health` reports `key_source`: `env`, `db-encrypted`, `db-fallback` (plaintext) or `mixed`.
- Never change or delete `SERVER_KEYS_KEK` once rows are encrypted. Without it the keys cannot be decrypted.

## Not built yet / before real users

- **SMS OTP provider.** OTP only works in dev mode today.
- **Real PSP adapter (O05).** Only `test_psp` exists.
- **Delivery for `notifications_outbox`.** Rows are written and shown in-app, but no push, SMS or email sender exists.
- **Legal sign-off.** The 48 h full-refund window is a config default pending legal sign-off (O04).
- **Privacy notice for QA-2026-02.** The notice must list the new data (gender, age range, personality, work field, family and marital status) before real users. This is part of open item F8.
- **Matcher upgrade.** Use age range, gender and personality to balance tables (spec 2026-10-28 §10).
- **Supabase advisors (2026-10-23):**
  - Security: the INFO "RLS enabled, no policy" findings are cleared by migration 007 (explicit deny-all policy; same behaviour). The one WARN (mutable `search_path` on `sim.book_and_pay`) has been fixed.
  - Performance: the 47 unindexed foreign keys are fixed by migration 004. The "unused index" findings remain on purpose. Staging has almost no traffic, so the advisor reports every index as unused, including the new ones. Each listed index backs a real query path, so none were dropped. Review this again once real traffic exists. `sim.clock` (staging simulation only) now has a primary key.
