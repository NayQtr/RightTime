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
| `qatar/ops/seed_common.sql` | Staging seed: admins, tiers, venues, full v0.3 questionnaire, legal docs, 3 Arabic sessions on sale, `sim` helpers |
| `qatar/api/src/` | Framework-free API: `handle(Request) → Response`, the same code on Node and Deno |
| `qatar/api/edge-index.ts` | Supabase Edge Function entry point (deployed as `index.ts`) |
| `qatar/api/server.mjs` | Local runner: API plus the static web app and admin panel |
| `qatar/web/` | User web app (SCR-01…SCR-10, SCR-05P, SCR-08a/b, the 999 screen), mock checkout, `admin/` panel |
| `qatar/api/test/` | Parity (JS vs Python matching), API end-to-end, and browser (Playwright) tests |
| `docs/qatar-phase4/screens/` | Screenshots captured by the UI tests |

## Deployed staging

- **Supabase project:** `qatar-mvp`, ref `fvodcnqmxskgzziwuwmz`, region ap-south-1, Postgres 17.
- **API base:** `https://fvodcnqmxskgzziwuwmz.supabase.co/functions/v1/api`
  - User routes: `…/api/v1/...`, for example `POST …/api/v1/auth/otp:request`.
  - Admin routes: `…/api/admin/v1/...`.
  - PSP webhook: `POST …/api/v1/payments/webhooks/test_psp`, HMAC-signed with `x-signature` and `x-timestamp` (±300 s).
- **Function settings:** the Edge Function `api` runs with `verify_jwt = false` because the API does its own authentication: RS256 user/admin JWTs, plus HMAC for webhooks. It reaches Postgres through the platform-injected `SUPABASE_DB_URL`. No database password or service-role key is in the code or on the client.
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
for f in qatar/db/migrations/00{1,2,3}_*.sql qatar/ops/seed_common.sql; do psql -v ON_ERROR_STOP=1 -1 -d qatar_dev -f "$f"; done
cd qatar/api && npm ci
DATABASE_URL=postgres://localhost/qatar_dev PORT=8787 npm start
# user app: http://localhost:8787/   admin: http://localhost:8787/admin/
```

Tests need a local server on port 5433 with user `app`. They build a template database, give each test its own copy, and drive Chromium through Playwright:

```bash
cd qatar/api && npm test          # 16 tests: 12 API e2e, 1 parity, 3 browser
cd qatar/matching && python3 -m pytest -q
PGHOST=/tmp PGPORT=5433 PGUSER=app bash qatar/ops/runbook_a/run_simulation.sh
PGHOST=/tmp PGPORT=5433 PGUSER=app bash qatar/ops/runbook_b/run_simulation.sh
```

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
| `WEB_BASE_URL` | `http://localhost:8787` | the hosted web app origin |
| `CORS_ORIGINS` | `*` | the web app origin(s) only |
| `SEAT_HOLD_MINUTES` / `REBOOK_CHOICE_HOURS` / `FEEDBACK_WINDOW_DAYS` | 10 / 48 / 7 | per policy |
| `PACKING_MODE` | `min_leftovers` (`greedy_6` also available) | per v0.4 decision |

**Server keys.** If the Edge Function secrets `JWT_PRIVATE_PEM`, `DATA_KEY` (64 hex), `PHONE_PEPPER`, `PSP_WEBHOOK_SECRET` and `SEAT_TOKEN_KEY` are not set, the API generates each key once. It stores them in `app.server_keys`, which only the database owner can read. That fallback is acceptable for staging only. Before production, set all five as Edge Function secrets in the Supabase dashboard. `GET /api/admin/v1/config` (owner role) reports `key_source`.

## Not built yet / before real users

- **SMS OTP provider.** OTP only works in dev mode today.
- **Real PSP adapter (O05).** Only `test_psp` exists.
- **Delivery for `notifications_outbox`.** Rows are written and shown in-app, but no push, SMS or email sender exists.
- **Scheduled jobs.** Expired holds are released on request paths. Auto refunds after the 48 h choice window run from the admin action `refunds:auto-unresolved`. There is no cron yet.
- **Hosting for the web app.** It is served by `server.mjs` locally and is not hosted. To use it against staging, set `apiBase` in `qatar/web/config.js` to the API base above.
- **Brand placeholder.** `{BRAND}` is still a placeholder throughout.
- **Legal sign-off.** The 48 h full-refund window is a config default pending legal sign-off (O04).
- **Supabase advisors (2026-10-23):**
  - Security: only the expected INFO "RLS enabled, no policy" findings remain; this is deny-all by design. The one WARN (mutable `search_path` on `sim.book_and_pay`) has been fixed.
  - Performance: INFO-level unindexed foreign keys (47) and unused indexes (10). These are not addressed yet and should be reviewed once real traffic exists.
