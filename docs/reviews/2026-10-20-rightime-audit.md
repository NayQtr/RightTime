# Rightime audit — 2026-10-20

Five parallel reviews of the shipped happy-path slice (static Supabase-JS SPA on
Vercel + Supabase Postgres/Auth/RLS, project `ecsvbrsvwcgfcqjhkmrw`). Each ran
against the live code and database. This records findings and what was done.

Overall posture going in: **sound** — RLS enabled on all tables, a correctly
de-identified `tablemates` RPC, the shipped key is the publishable (client-safe)
key, and no unescaped DB/user value reaches `innerHTML` (XSS clean). One
genuinely exploitable bug plus a set of correctness/a11y/perf gaps.

## Fixed in this pass

Migration `20261020_security_and_perf_hardening.sql` + frontend patch
(`app/index.html`), both deployed and checksum-verified against production.

| # | Severity | Finding | Fix |
|---|---|---|---|
| SEC-1 | HIGH | **Overbooking.** `sync_event_seats()` only enforced capacity on `INSERT`. A user could insert a `cancelled` booking then `UPDATE` it to `confirmed` to exceed `seats` (7 on a 6-seat table), repeatable by N users. | Capacity check now covers `INSERT` and `UPDATE`. |
| SEC-2 | MEDIUM | Trigger functions `handle_new_user()` / `sync_event_seats()` were `EXECUTE`-able by `anon`/`authenticated` as PostgREST RPCs (SECURITY DEFINER attack surface). | `REVOKE EXECUTE` from `public, anon, authenticated`. Advisor re-scan confirms cleared. |
| APP-H1 | HIGH | **Magic-link return stuck on sign-in screen.** App rendered once off initial `getSession()`; `onAuthStateChange` only reassigned the variable, never re-rendered. | Listener now drives render: `boot()` on sign-in transition, `viewAuth()` on sign-out; ignores token-refresh so it won't disrupt an active session. |
| APP-H2 | HIGH | Booking not guarded against double-click → concurrent inserts. | `busy` in-flight guard + button disable on book/cancel. |
| APP-H3 | HIGH | **Cancel → re-book broken.** `book()` always `INSERT`ed; a cancelled row persists, so re-booking hit `UNIQUE(user_id,event_id)` and showed a generic error. | `book()` now `upsert`s on `(user_id,event_id)` → re-book reactivates the row (and is correctly capacity-checked by SEC-1's UPDATE guard). |
| APP-M1 | MEDIUM | Detail-view booking fired two racing `innerHTML` re-renders. | `book(id, rerender=false)` from detail; caller re-renders once. |
| APP-M2 | MEDIUM | Cancel ignored its error and always toasted success. | Capture `{error}`; toast failure, skip success on error. |
| APP-M3 | MEDIUM | No error handling: a transient failure could strand "Loading…" or dump an onboarded user back into onboarding. | `boot()` wrapped in try/catch with a ret[r]y error state; profile re-fetch null-guarded; `viewEvents` guards null profile. |
| APP-M4 | MEDIUM | "Who's at your table" hardcoded "of 6", ignoring the RPC's `seats`. | Uses `data.seats`. |
| PERF-1 | INFO | `bookings.event_id` FK unindexed. | Added `bookings_event_idx`. |
| PERF-2 | WARN | 7 RLS policies re-evaluated `auth.*` per row. | Wrapped as `(select auth.uid())` / `(select auth.role())`. |
| APP-L1 | LOW | `esc()` didn't escape single quotes (safe today, fragile). | Added `'` → `&#39;`. |
| RPC-L2 | LOW | `tablemates` appended untrimmed industry. | Trimmed. |

## Accepted / deferred (not bugs)

- `tablemates` shows on the SECURITY-DEFINER-executable lint — **intentional**;
  it self-guards to confirmed attendees and returns no PII. Correct by design.
- Leaked-password protection disabled — **moot**: Rightime is magic-link/OTP
  only, no passwords. Optional dashboard toggle; not applied.
- `bookings_user_idx` reported unused — it backs the app's frequent
  `bookings by user_id` reads; kept (traffic is just near-zero in demo).

## Accessibility (WCAG 2.1 AA) — tracked for next pass

Semantic base is solid (real buttons, landmarks, `lang`, aria-pressed/current,
reduced-motion). Open items, none shipped yet:

- **C1 (blocking):** event/booking cards open only via a click-only `<div>` —
  not keyboard reachable. Make the card header a real button.
- **S1 (serious):** focus dropped to `<body>` on every view swap — move focus
  to the new view heading (`tabindex="-1"` + `.focus()`).
- Light-theme contrast: ember-as-text (`.ev .ty`, detail eyebrow), `--ink-faint`
  muted/footer text, `.tag.full`/`.tag.open`, and the focus ring are below
  4.5:1 / 3:1. Dark theme passes. Darken the light-mode tokens used as text.
- Announce status: `role="status"`/`aria-live` on the toast and `#authmsg`.
- Progress bar needs `role="progressbar"` + values; onboarding views need an
  `h1`; per-view `document.title`.
- (Correction: 44px touch targets are WCAG 2.2 / AAA, not a 2.1 AA failure —
  polish, not a defect.)

## Testing strategy — tracked for next pass

Recommended: **pgTAP** for the RLS matrix + trigger/RPC logic, a **Node `pg`**
concurrency harness for the overbooking race (now expected to cap at `seats`
on both insert and update), **Playwright** E2E (magic link seeded via the
Supabase Admin `generateLink`), CI on disposable Supabase branches, `get_advisors`
as a PR gate. Full matrix in the testing agent's report (P0/P1/P2).

Known behaviour the tests should pin: cancel→rebook now works (upsert);
changing `events.seats` does not re-fire the trigger (status can go stale) —
acceptable for now, revisit with the matching engine.
