# HerZone security review before the closed beta (NMX-31, NMX-63)

**Date:** 2026-11-04
**Code:** branch `rightime-app`. Fixes are in d15f852, 356a95d and 5a93057.
**Environments:** staging (herzone.app today), production (herzone-production, Mumbai) and a local throwaway API.

## Summary

- **Two independent code reviews:**
  - Reviewer 1 covered sign-in, sessions and the admin console.
  - Reviewer 2 covered member data, payments and the web app.
  - Neither found a critical or high issue. They found 4 medium and 7 low issues.
  - 10 of the 11 are fixed. Each fix has a test that fails without it.
  - 1 low issue is accepted, with reasons, below.
- **OWASP ZAP baseline on herzone.app:** 0 failures. One of the two medium warnings is fixed (inline styles); the other is accepted with reasons below. The rest are informational.
- **OWASP ZAP API scan:**
  - Against staging, the scan exposed a real fault: the database ran out of connections. The fault is fixed and the scan was stopped.
  - The full authenticated API scan then ran against a local throwaway copy: `api/test/zap-local.run.mjs`. All 48 operations from the OpenAPI description were imported and the scan sent requests with a member's token. Result: **0 failures, 112 rules passed, 3 warnings.**
    - "X-Content-Type-Options missing": fixed. Every API response now sends `nosniff`.
    - "Cross-domain (ACAO *)": local only. The test setup allows any origin; production allows only herzone.app (checked live).
    - "Unexpected Content-Type" on `/`: that is the website page the local server also serves, not the API.
- **Logs:** the staging logs were searched for personal data. Edge requests, function logs, Postgres and pgbouncer were all checked. Results:
  - 0 phone numbers
  - 0 sign-in tokens
  - 0 refresh tokens
  - 0 verification codes
  - Request URLs carry no personal data. Error reports to Sentry are scrubbed before sending.

## Fixed

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | Medium | Per-IP limits on code requests and admin sign-in trusted the client's `X-Forwarded-For`. A junk or rotating value skipped them, which would allow SMS bombing once SMS is connected. | Use the address Cloudflare or the gateway saw (`cf-connecting-ip`, `x-real-ip`). An unreadable address shares one limit. **Checked live:** a spoofed address was ignored and the real one was stored. | `ip-limit.test.mjs` |
| 2 | Medium | A member under interim suspension (after a danger report) could still see the venue, table code and tablemates' names of her other bookings. | Hidden while the account is not active. | `e2e` S1 report |
| 3 | Medium | A rebook and a refund sent at the same time could both succeed: a free meetup plus a full refund. | The refund locks the booking and checks again. | `e2e` NMX-63 race |
| 4 | Medium | Under load the database's 60 connection slots filled up. Every request then failed with a 500. Found by the ZAP scan. | Idle connections close after 10 s. A full database answers 503 with Retry-After. A pooler URL is optional. | `db-busy.test.mjs` |
| 5 | Low | Two refreshes with one token at the same moment split the session in two. | The token is claimed atomically. The second request counts as reuse and ends the session. | `session.test.mjs` |
| 6 | Low | A charge that succeeded after the member cancelled was kept silently. | Refunded automatically (`seat_unavailable`). | `e2e` NMX-63 charge |
| 7 | Low | Parallel promo-code checks got past the 10-per-hour limit. | Each check is recorded first, then counted. | `promo.test.mjs` |
| 8 | Low | An admin TOTP code could be used twice within about 90 s. | Codes are single-use. | `e2e` NMX-63 admin |
| 9 | Low | Admin "Sign out" only cleared the browser; the token kept working for up to an hour. | `POST /api/admin/v1/auth/logout` ends the session on the server. | `e2e` + UI |
| 10 | Low | The owner could silently replace another admin's authenticator. That would let her impersonate the admin and get around two-person approval. | No enrolment token for oneself. For an enrolled admin, only with `reset_mfa: true`, which voids her authenticator, ends her sessions and is audited. | `e2e` NMX-63 admin |
| 11 | Hardening | Wrong code guesses were counted after the comparison, so parallel guesses could get extra attempts. | An attempt is taken atomically first. | `session.test.mjs` |
| 12 | ZAP Medium | CSP allowed `style-src 'unsafe-inline'`. | The 12 inline styles became classes. The CSP is now `style-src 'self'`. UI tests run under the real CSP. **Checked live.** | `ui.test.mjs` |

## Accepted, with reasons

- **Low: someone who knows an admin's email can keep her locked out of sign-in.** Five wrong codes every 15 minutes does it.
  - The lock is what stops anyone guessing codes. Keying it on the IP instead would weaken it against attackers who spread across many IPs.
  - Mitigations: there are few admins, and the owner can unlock by resetting the counter in the database. The lock is audited as `admin_login_locked`.
  - Revisit if it happens. A possible answer is a sign-in link to the admin's email that skips the lock.
- **ZAP Medium: `Access-Control-Allow-Origin: *` on static files.** Vercel's default for public assets. These files carry no credentials or private data. The API's CORS is limited to herzone.app.
- **ZAP informational:** comments in the JavaScript, cache headers, "modern web application". Nothing to act on.

## Checked and sound (summary of both reviews)

- **Tokens:**
  - JWTs are pinned to RS256, with signature, expiry and type checks.
  - Member and admin tokens are kept apart.
  - Sessions end at once on sign-out, reuse or deletion.
- **OTP:** the code is stored as an HMAC and compared in constant time. Codes are single-use, with limits per phone and per address. The response is the same for new and existing numbers. Dev mode is off in production (the request returns 503 until NMX-23).
- **SQL:**
  - No string-built SQL.
  - RLS with deny policies on every table.
  - No access to the `app` schema for anon, authenticated or service_role.
  - A fixed `search_path` on every function.
- **Member data:** every booking route is limited to its owner. Names, table code, venue and WhatsApp appear only when the rules allow.
- **Payments:**
  - The webhook HMAC is checked with a 5-minute window and duplicate events are dropped.
  - Amount and currency are checked against the stored payment.
  - A second charge is refunded.
  - The price is always set by the server.
- **XSS:** web and admin escape every value from the server, links are built on the server, and the CSP has no inline script or style.

## For the owner

1. In Sentry, open Settings → Security & Privacy and turn on "Prevent Storing of IP Addresses".
2. Optional, for higher load: set the `DB_POOLER_URL` function secret in Supabase to the Supavisor transaction-pooler URL (port 6543), on staging and production. Do not send the value here.
