# Baseline checks (HerZone)

The owner's standing rule of 5 Nov 2026: these checks are basic standards, run regularly.
When: before every production release, and once a month (cadence provisional, item 13b, 10 Nov 2026; the owner may
change it). Record each run at the bottom (date, result, fixes).

Each check says how to run it and what passes. Checks are passive: no active scans of staging or production.

## Secrets

1. **No secret in frontend code** (`qatar/web`, admin, venue page, `qatar/app`).
   Search the tracked files for key formats (Google `AIza…`, `sk-…`, `ghp_…`, `sb_secret_…`, `sbp_…`, `AKIA…`,
   signed tokens `eyJhbGciOi…`, `PRIVATE KEY`, `service_role`). Pass: only test placeholders.
2. **No secret in git history** (the repository is public). Same search over `git log --all -p`, and no `.env`, `.pem`,
   `.key`, keystore or service-account file ever committed. Pass: nothing found.
3. **Live sites** (herzone.app and qatar-mvp-staging.vercel.app). Fetch the public files a browser downloads (pages,
   scripts, `config.js`) and run the same search; check that no request puts a token in the URL.
   Pass: only the API address and the Sentry DSN (public by design).
4. **Keys restricted and rotated.** Gemini key restricted to the Generative Language API; old keys deleted;
   Gemini and Supabase tokens rotated about every 3 months.

## Test paths closed in production (fixed check before every production deploy)

Notion fix 4. Staging keeps test paths open on purpose; production must have none:

| Test path | Switch | In production |
|---|---|---|
| Sign-in code shown in the answer (member sign-in and venue page) | `OTP_DEV_MODE` | `false` |
| Mock payments: mock checkout `/api/mock-psp/*`, test refunds | `MOCK_PSP_ENABLED` | `false`; `/api/mock-psp/checkout/{id}` answers 404 `MOCK_PSP_DISABLED` |

How: `node qatar/ops/smoke.mjs production` (read-only GET requests). It fails when `GET /api/v1/health` lists any
open test path in `test_paths_open`, or when the mock checkout does not answer 404 `MOCK_PSP_DISABLED`; it also checks
pages 200 and member and admin routes 401 without a sign-in. Run it before creating the production deployment and
again in the smoke checks after it; GitHub Actions also runs it every 30 minutes (`.github/workflows/uptime.yml`).
Pass: no failed line. Until the API that reports `test_paths_open` is deployed to production, the health line is a
warning: then also read both switches in production's `app.app_config` (read-only query) and the Edge Function
secrets list (an environment variable of the same name overrides the table).
Not a test path: the store reviewers' sign-in (`REVIEW_PHONE_E164`, `REVIEW_OTP_CODE`) is meant for production. The
static mock checkout page (`/checkout/mock/...`) is still shipped, but without the API's mock routes it cannot pay.

## Launch checklist (12 points)

1. API keys only on the server (checks 1–3 above).
2. **RLS**: every table in `public` and `app` has row level security on, and `anon`/`authenticated` cannot read it.
   Read-only query on both projects (`pg_class.relrowsecurity`, `has_table_privilege`). Pass: all true / all false.
3. **Server-side validation**: the price comes from the session on the server; the payment webhook rejects an amount
   that does not match. Pass: tests in `api/test` green.
4. **Roles on every request**: every admin route lists its roles; members see only their own bookings; a venue sees
   only its own requests. Pass: tests green; new routes reviewed.
5. **Rate limiting**: sign-in codes (5/hour per phone or email, 20/hour per IP, 5 attempts per code), admin sign-in
   lockout, promo checks. Pass: limits present for every new sign-in or guessable endpoint.
6. **Dependency audit**: `npm audit` in `qatar/api` (runtime and dev) and the app's OSV check
   (`qatar/app/tool/osv_check.py`, also in CI). Pass: no high or critical.
7. **Webhook signatures**: every incoming webhook verifies its signature before doing anything.
8. **Payments**: test cards / test mode only until launch; no real card in live mode.
9. **AI spend**: Gemini called only on a name mismatch, at most 5 per run, 8 s timeout; with billing on, a budget
   alert and a daily quota in Google Cloud.
10. **Backups**: daily backup exists and one restore has been tested. (Open: Free plan has none, owner's decision.)
11. **Error tracking**: Sentry receives events from herzone-web, herzone-api and herzone-app, and alerts work.
12. **Rollback plan**: `qatar/docs/ops/rollback.md` still matches how the build deploys.

## Runs

| Date | Result | Fixes |
|---|---|---|
| 2026-11-05 | Secrets: clean (frontend, 109 commits, live sites). Checklist: 10 pass, AI spend partial (no billing yet), backups missing (Free plan). | Playwright 1.55.0 → 1.55.1 (GHSA-7mvr-c777-76hp); rollback plan written. |
| 2026-11-05 (before production release of ee90b62) | Secrets: clean (frontend, full history, no sensitive files). npm audit 0, app OSV 0 of 92. Production DB: 50 tables, all with RLS, none readable by anon/authenticated; OTP dev mode and mock payments off. CI green. | None needed. Note: production WEB_BASE_URL is https://herzone.app, which still serves staging. |
| 2026-11-06 (after the releases of 9d5c82a, f6205e7 and 54af301; these three went out without a recorded run, so this run covers them) | Secrets: clean (build gate green in CI on each commit; live herzone.app and herzone-production scanned for key formats: 0). npm audit 0 (runtime and dev), app OSV 0 of 92. Production DB: 51 tables, all with RLS, none readable by anon/authenticated. Smoke checks and Sentry clean after each release. Backups still missing (Free plan), AI spend partial (no billing). | None needed. Rule kept: run before each release, not after. |
| 2026-11-11 (before the production release of 5c46b68: the 8 provisional units, the review fixes and the owner's time-left wording) | Secrets: clean (build gate green; no key format in qatar/web or qatar/app/lib). npm audit 0 high/critical (runtime and dev), app OSV 0 of 100. Production DB: 51 tables, all with RLS, none readable by anon/authenticated; OTP dev mode and mock payments off. CI green on 5c46b68 (one browser test failed first, passed on re-run and 4 of 4 locally: a flake, not a code fault). Smoke checks on production clean before and after; Sentry no issues in the hour after the deploy. Backups still missing (Free plan), AI spend partial (no billing). | None needed. Open, not caused by this release: production has no admin user, no published legal document, no venue and no session, and its questionnaire is still a draft, so production cannot serve a member yet. herzone.app still serves staging (item 14b). |
