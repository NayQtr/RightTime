# HerZone — Handoff

Written 2026-11-24. Every fact below was checked on that day against the repository, the two Supabase databases
(read-only queries), GitHub's public API and the live sites. Where something could not be checked, it says so.
Read this file, then `CLAUDE.md` (rules), then `memory/topics/late-requests.md` (the owner's running list).

---

## للمالكة — ملخص بالعربية

- **الموقع herzone.app يعرض آخر كود.** فرع الإنتاج `release` = 0d3e4e2 (إصلاحات الأمن الخمسة + الهجرة 027، 24 نوفمبر)، والفرق بينه وبين فرع العمل ملاحظات فقط، لا كود.
- **النسخة التجريبية على الالتزام نفسه 0d3e4e2** رغم أن مفتاح Supabase في مشروعها على Vercel ما زال منتهيًا: الموقع عبر بناء معاينة موجَّه بـalias، والـAPI منشورة عبر موصل Supabase باستيراد مثبّت بالـSHA (القسم 6 الخطوة 5).
- **إشعار الخصوصية privacy-qa-5 منشور في الإنتاج وstaging** (24 نوفمبر). التسجيل ما زال يحتاج الشروط وقواعد السلوك منشورة.
- **الإنتاج لا يخدم عضوة بعد.** الشروط وقواعد السلوك غير منشورة، ولا مزوّد رسائل نصية، ولا بوابة دفع حقيقية، ولا مكان ولا جلسة.
- **التطبيق مبني ومختبر، لكنه ليس في المتجرين** (الحسابان لم يُفتحا).
- **اكتشاف مهم:** النسخ الاحتياطي اليومي ومراقبة الموقع كل 30 دقيقة **لا يعملان إطلاقًا**. السبب أن الفرع الافتراضي في GitHub ما زال `add-rea-mcp-permissions`. الحل: غيّريه إلى `rightime-app` (القسم 8.1). (مراقبة التوفر الدقيقية في Sentry على herzone.app تعمل، فالموقع ليس بلا رقابة.)
- **المتصفح وصفحات GitHub وSupabase المفتوحة على جهازك لا تصل للجلسات السحابية**: مجلد Remote Control على xnms-MacBook-Pro يظهر «not available». حدّثي تطبيق Claude على الماك أو افتحي جلسة على الجهاز نفسه إذا أردت أن ينفّذ المطوّر خطوات لوحات التحكم.
- **ما ينتظرك أنتِ:** القسم 8.1. **ما ينتظر قرارك:** القسم 8.2. **ما يستطيع المطوّر فعله دون انتظارك:** القسم 8.3.

---

## 1. How to use this file

- Facts here are a snapshot of 2026-11-24 (evening, after the security-fixes release). Before acting on any of them, re-check the live state (commands in §5 and §6).
- Order of authority when sources disagree:
  1. The owner's latest words in chat.
  2. `CLAUDE.md`.
  3. This file.
  4. `memory/topics/late-requests.md`.
  5. Older docs.
- `late-requests.md` is append-only history. Several section headings there are now stale: some say "NOT released" about
  work that was released later. §2 and §8 of this file give the current truth.

---

## 2. State snapshot (2026-11-24)

### 2.1 Git

| Ref | SHA | Note |
|---|---|---|
| `rightime-app` (working branch, origin) | `0d3e4e28f44a848cfceb34b185869ec301993a6a` plus notes commits after it | Clean worktree. |
| `release` (production branch, origin) | `0d3e4e28f44a848cfceb34b185869ec301993a6a` | What production serves (security fixes 1–5, hardening, 027). |
| Delta `0d3e4e2..rightime-app` | notes only (`handoff.md`, `memory/topics/late-requests.md`) | No code is waiting to be released. |
| GitHub default branch | `add-rea-mcp-permissions` (stale) | See §8.1 item 1. It breaks the scheduled workflows. |

- Repo: `NayQtr/RightTime`. It is **public** (`private: false`).
- Push with `git push -u origin rightime-app`.

### 2.2 Live sites

| Site | Serves | Vercel project | Last deployment |
|---|---|---|---|
| https://herzone.app (+ www → 308) | `herzone-web@0d3e4e28f44a` | `herzone-production` (`prj_D7nHuK1OMpWKNLyL409yxekEsnTE`) | `dpl_DYaCi4kZi2btkd9phcdxs8byfDUY` (24 Nov, production target: website + Edge Function `api`) |
| https://qatar-mvp-staging.vercel.app | `herzone-web@0d3e4e28f44a` | `qatar-mvp-staging` (`prj_IGzPeHwJwOLWpyAyrDY3xYJC0juu`) | Website: preview build `dpl_Cbnxhs1eGefJ3T7uYvkV514uNRkg` aliased to the staging domain (`assign_alias`). API: Edge Function version 52, deployed through the Supabase connector with a jsDelivr import pinned to 0d3e4e2 (§6 step 5). A production-target build of this project still **fails** (Supabase CLI 401, expired `SUPABASE_ACCESS_TOKEN`). |

- Check the release tag with `curl -s https://herzone.app/config.js | grep -o 'herzone-web@[0-9a-f]*'`.

### 2.3 Databases (read-only queries, 24 Nov)

| | Production `pwxxulqgdydrkowmtkia` | Staging `fvodcnqmxskgzziwuwmz` |
|---|---|---|
| Tables in schema `app` / without RLS | 56 / 0 | 56 / 0 |
| Legal documents | **privacy-qa-5 published** (24 Nov, through the connector); no terms, no conduct → registration answers 422 CONSENT_REQUIRED | terms-qa-1, conduct-qa-1, privacy-qa-1…5 (5 published 24 Nov), mkt-qa-1, cxl-qa-1 (one-line test texts except privacy) |
| Admin users | 1: owner role, active, MFA on | 7 |
| Venues / sessions | 0 / 0 | 3 venues / 6 sessions with status `on_sale` |
| Users / bookings | 0 / 0 | test data |
| Questionnaire | QA-2026-05 published (QA-2026-04 draft) | QA-2026-05 published (01–04 retired) |
| `OTP_DEV_MODE` / `MOCK_PSP_ENABLED` | `false` / `false` | `true` / `true` (intended on staging) |
| `SMS_PROVIDER` / `EMAIL_PROVIDER` | empty / empty | empty / empty |
| `PRICING_LAUNCH_FREE` | `true` | `true` |
| `PHONE_ALLOWED_COUNTRY_CODES` | `*` (Israel +972 refused in code) | `*` |
| `CORS_ORIGINS` | `https://herzone.app,https://herzone-production.vercel.app` | `https://herzone.app,https://qatar-mvp-staging.vercel.app,https://qatar-mvp-staging-rightime.vercel.app` |
| `WEB_BASE_URL` | `https://herzone.app` | `https://qatar-mvp-staging.vercel.app` |
| `PUSH_DISPATCH_URL` set (pg_cron every minute) | yes | yes |

- **All migrations through `027_rebook_requires_payment.sql` are applied on both projects** (027 by `apply_migration`
  on 24 Nov, verified read-only: the 'not paid' check is in `rebook_booking`, no EXECUTE for `anon`/`authenticated`,
  recorded in `supabase_migrations.schema_migrations`).
  - The file list is 001–021, then 023–027. There is no 022.
  - The next new migration is `028_…`.

### 2.4 Tests (last full runs)

- **Website + API + DB + browser** (`cd qatar/api && npm run check`): 414/414 green on the merged tree (24 Nov, security fixes included).
- **Flutter** (`flutter analyze`, `flutter test`): analyze clean; 316 passed, 24 skipped (opt-in golden/store-shot tests).
- **Python matching engine:** `qatar/matching/test_matching_engine.py`, 41 test functions. JS/Python parity is checked by
  `qatar/api/test/parity.test.mjs`.
- **CI on GitHub** (`ci.yml`, jobs `test`, `app`, `lighthouse`): green on 0d3e4e2.

### 2.5 What a visitor can do on herzone.app today

- Open the welcome page, `/about`, "what you get", the fee page, and the full questionnaire (QA-2026-05, 21 questions plus
  interstitials).
- At "رقم جوالك" the flow stops: no SMS provider, so the API answers 503 «الخدمة غير متاحة مؤقتًا.».
- Even with SMS working, registration would stop at the legal-consent step: production has only the privacy notice published (terms and conduct are drafts).
- Nothing can be booked: no venue, no session.

---

## 3. Product and repository map

**Product.** HerZone runs women-only small-table dinners and coffee meetups in Doha:
- Tables of 4–6 women, matched by a questionnaire.
- Arabic first (RTL), English second.
- Member copy in Arabic addresses a woman (feminine forms).

**Code.** Everything lives under `qatar/`:

| Path | What |
|---|---|
| `qatar/api/` | Node API. Runs as the Supabase Edge Function `api` (entry `edge-index.ts`). Routes: `src/routes/{user,admin,payments,push,alerts,funnel,venue}.js`. Services: `src/services/`. Libs: `src/lib/`. Matching engine (JS): `src/matching/`. Tests: `test/` (74 files, Node test runner + Playwright). |
| `qatar/web/` | Member website (single-page app `app.js`, `styles.css`, `strings.js` = all ar/en copy), admin console `web/admin/`, venue portal `web/venue/`, `/about` pages (built by `ops/build-about-page.mjs`), `sw.js`, `vercel.json` (headers and CSP). |
| `qatar/app/` | Flutter app (iOS/Android). Copy lives in `lib/l10n/app_ar.arb` and `app_en.arb`, run `flutter gen-l10n` after editing. |
| `qatar/db/migrations/` | Postgres migrations 001–026. Schema `app`, RLS deny-all, no client grants. |
| `qatar/design/` | `tokens.json` is the single source for colour, type, space and motion. Builders: `build_tokens_css.py`, `build_tokens_dart.py`. Check: `contrast_check.py`. |
| `qatar/matching/` | Python reference matching engine (parity with JS). |
| `qatar/ops/` | `predeploy-gate.mjs` (build gate), `smoke.mjs`, `deploy-api-from-vercel.mjs`, `write-config.mjs`, seeds (`seed_*.sql`), `db-backup.sh`, `draft-openers.mjs`, flag/country builders, runbooks. |
| `qatar/docs/` | `security/baseline-checks.md` (record of every release check), `decisions/`, `legal/` (drafts), `plans/`, `design/` (incl. the older design-spec `handoff.md`), `store/` (listing draft, screenshots), `ops/` (backup-restore, rollback). |
| `memory/` | `core.md` and `topics/late-requests.md` (owner's running list). |
| Root `app/`, `supabase/` | The OLD "Rightime" site, a different Supabase project (`ecsvbrsvwcgfcqjhkmrw`). It is not HerZone; leave it alone. |

**Release tag.** The website's `config.js` carries `herzone-web@<first 12 of the SHA>`, written by `ops/write-config.mjs`
at build time.

---

## 4. Infrastructure and identifiers

| Service | Identifier | Notes |
|---|---|---|
| Vercel team | `team_cqQBWVe7a4fWVjbpKHbxtJJz` (slug `rightime`) | Every Vercel MCP call may need the owner's "Allow". |
| Vercel production project | `herzone-production`, `prj_D7nHuK1OMpWKNLyL409yxekEsnTE`, root dir `qatar/web` | Linked to GitHub (13 Nov). The production branch setting is **not confirmed** (dashboard only). The Ignored Build Step builds only `VERCEL_GIT_COMMIT_REF=release` and `VERCEL_ENV=production`. Releases are made by an explicit `create_deployment` call (§6). |
| Vercel staging project | `qatar-mvp-staging`, `prj_IGzPeHwJwOLWpyAyrDY3xYJC0juu`, ref `rightime-app` | Deployed with target `production` (it is staging's own "production"). Its `SUPABASE_ACCESS_TOKEN` env var is **expired** (§8.1). |
| Supabase production | `pwxxulqgdydrkowmtkia` (ap-south-1) | SQL editor: https://supabase.com/dashboard/project/pwxxulqgdydrkowmtkia/sql/new |
| Supabase staging | `fvodcnqmxskgzziwuwmz` (ap-south-1) | SQL editor: https://supabase.com/dashboard/project/fvodcnqmxskgzziwuwmz/sql/new |
| Edge Function | `api` in both projects | Deployed by a production-target Vercel build through `ops/deploy-api-from-vercel.mjs`, which needs that Vercel project's `SUPABASE_ACCESS_TOKEN`. Preview builds never deploy the API. Workaround used for staging (24 Nov): Supabase connector `deploy_edge_function` with a one-file `index.ts` whose router import is `https://cdn.jsdelivr.net/gh/NayQtr/RightTime@<FULL SHA>/qatar/api/src/app.js` (`src` has only relative and `node:` imports; jsDelivr serves `application/javascript`, immutable per SHA). |
| Sentry | org `herzone`, regionUrl `https://de.sentry.io`; projects herzone-web, herzone-api, herzone-app | Check: `search_issues` with `is:unresolved lastSeen:-1h`. |
| GitHub | `NayQtr/RightTime` | Registered workflows today: only "CI" and "Deploy API" (§8.1). |
| Domains | `herzone.app` at Vercel (Vercel nameservers); `www.herzone.app` → 308 | On herzone-production since 13 Nov. |
| Gemini | Key = Edge Function secret `GEMINI_API_KEY` | Used only by the card-name second opinion (`api/src/lib/ai.js`). The opener drafting needs a GitHub secret of the same name (not set). |
| Twilio (SMS) | Provisional choice; adapter built (`api/src/lib/sms.js`) | No account yet. Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM`, plus app_config `SMS_PROVIDER=twilio`. |
| Payments | Only the mock adapter `test_psp` exists (`api/src/services/psp.js`) | A real PSP needs an owner contract first. |
| Linear | Issues prefixed `NMX-` | Open ones mentioned: NMX-22/23/24/26/28 (blockers), NMX-45/46 (store accounts), NMX-56 (Maestro). |
| Notion | Fixes database «إصلاحات هيرزون» https://app.notion.com/p/b020674ff9434e2a98ae8de7ab7b1d4e | |
| Figma | File `qCSzd7AhxvqSqYYl2TV5M2` (pages Cover 0:1, Foundations 2:14, Components 2:15) | Starter plan, 20 MCP calls/month. |
| Claude preview artifact | https://claude.ai/artifact/4da919HbETry29QZxV5anX | Design rounds 1–4 preview (private). |

---

## 5. Working environment (fresh container)

Things that **do not survive a container restart** and must be recreated:
- Postgres
- `npm ci` output
- Flutter 3.47.9 (if it is missing)
- Scratchpad files

### 5.1 Postgres 16 for the tests

The tests need Postgres 16 on socket `/tmp`, port 5433, superuser `app`. They connect by socket **and** by TCP
127.0.0.1:5433.

The start script below lives in the session scratchpad (`pgup.sh`). Recreate it if it is missing:

```bash
#!/bin/bash
# Local Postgres 16 for the test suite: socket /tmp, port 5433, superuser "app" (trust auth, local only).
B=/usr/lib/postgresql/16/bin; D=/tmp/pgdata
id postgres >/dev/null 2>&1 || useradd -r postgres
if [ ! -s "$D/PG_VERSION" ]; then mkdir -p $D && chown postgres $D && su postgres -c "$B/initdb -D $D -U app --auth=trust >/dev/null"; fi
su postgres -c "$B/pg_ctl -D $D -o '-p 5433 -k /tmp -c listen_addresses=127.0.0.1' -l /tmp/pg.log start >/dev/null" || true
for i in $(seq 1 30); do pg_isready -h /tmp -p 5433 >/dev/null 2>&1 && break; sleep 0.5; done
pg_isready -h /tmp -p 5433
```

Lessons:
- Listening on the socket alone made every test fail with `ECONNREFUSED 127.0.0.1:5433`.
- Two parallel `npm run check` runs on the same Postgres drop each other's template database (`qatar_api_tpl`): run one
  at a time.

### 5.2 Browser for the UI tests

- The tests read `CHROME_PATH` and fall back to `/opt/pw-browsers/chromium-1194/...`, which no longer exists.
- In this environment use `export CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`. Check `ls /opt/pw-browsers/` in a new container.
- Do not run `playwright install`.

### 5.3 Commands

```bash
cd qatar/api && npm ci                      # needed if node_modules/playwright is missing
cd qatar/api && npm run check               # build gate + all API/DB/browser tests (about 6-9 minutes)
node qatar/ops/predeploy-gate.mjs           # build gate alone
cd qatar/app && /opt/flutter/bin/flutter analyze && /opt/flutter/bin/flutter test
cd qatar/app && /opt/flutter/bin/flutter gen-l10n          # after editing .arb files
cd qatar/app && HZ_SCREENSHOTS=1 /opt/flutter/bin/flutter test --update-goldens test/screens_golden_test.dart
cd qatar/app && HZ_STORE_SHOTS=1 /opt/flutter/bin/flutter test --update-goldens test/store_screenshots_test.dart
cd qatar/app && python3 tool/osv_check.py   # app dependency vulnerabilities
cd qatar/api && npm audit --audit-level=high
python3 qatar/design/build_tokens_css.py && python3 qatar/design/build_tokens_dart.py && python3 qatar/design/contrast_check.py qatar/design/tokens.json
node qatar/ops/smoke.mjs production         # or: staging
```

- **Flutter version.** CI pins Flutter 3.47.9 (`.github/workflows/ci.yml`). If `/opt/flutter` is another version, install
  3.47.9 from the URL in `ci.yml`.
- **Never run `dart format`.**
- **Store screenshots.** After regenerating, revert any `03_sessions.png` whose only diff is the week-strip date drift.

---

## 6. Release procedure (exact)

The owner's explicit approval is required for every production release. "انزل/نزل/أنزله" for a stated scope counts as
approval for that scope only.

1. **Baseline checks.** Run and record them in `qatar/docs/security/baseline-checks.md`: add one row to the Runs table.
   - Secret scan of the diff since the last release. Patterns: `AIza…`, `sk-…`, `ghp_`, `sb_secret_`, `sbp_`, `AKIA…`,
     `eyJhbGciOi`, `PRIVATE KEY`, `service_role`. Also check that no `.env`, `.pem`, `.key` or keystore file was added.
   - `npm audit` (0 high/critical).
   - App OSV (0 of 100).
   - The build gate.
   - `node qatar/ops/smoke.mjs production`, run **before** the deploy.
   - The full local test suites.
   - For any migration: apply it and verify it read-only.
2. **Commit and push** the record to `rightime-app`, then wait for CI on that SHA. Poll:
   `curl -s "https://api.github.com/repos/NayQtr/RightTime/actions/runs?head_sha=<FULL_SHA>"` until
   `completed:success`.
3. **Fast-forward `release`:** `git push origin <FULL_SHA>:release`.
4. **Create the production deployment.** Use Vercel MCP `create_deployment` with teamId `team_cqQBWVe7a4fWVjbpKHbxtJJz` and this request body:
   ```json
   {"name":"herzone-production","project":"prj_D7nHuK1OMpWKNLyL409yxekEsnTE","target":"production",
    "gitSource":{"type":"github","org":"NayQtr","repo":"RightTime","ref":"release","sha":"<FULL 40-char SHA>"}}
   ```
   - Read the full SHA with `git rev-parse`. **Never expand a short SHA from memory**: this mistake has happened twice,
     and Vercel refuses it with `incorrect_git_source_info`.
   - A production-target build also deploys the Edge Function `api`.
5. **Staging deployment.** Same call with name `qatar-mvp-staging`, project `prj_IGzPeHwJwOLWpyAyrDY3xYJC0juu`, ref
   `rightime-app`, target `production`. **Still blocked** by the expired token (§8.1). Workaround that works today:
   - Website: the same call **without** `target` (a preview build; it skips the API deploy by design), wait for
     `readyState: READY`, then `assign_alias` of that deployment to `qatar-mvp-staging.vercel.app`.
   - API: Supabase connector `deploy_edge_function` on `fvodcnqmxskgzziwuwmz`, name `api`, `verify_jwt: false`,
     one file `index.ts` = `qatar/api/edge-index.ts` with the import changed to
     `https://cdn.jsdelivr.net/gh/NayQtr/RightTime@<FULL SHA>/qatar/api/src/app.js` (read the SHA with `git rev-parse`).
   - Then `node qatar/ops/smoke.mjs staging` and `curl -s https://qatar-mvp-staging.vercel.app/config.js | grep -o 'herzone-web@[0-9a-f]*'`.
6. **Wait for the release tag** on `config.js`. Then:
   - Run `node qatar/ops/smoke.mjs production`: release tag, pages 200, API 401 without login, no open test path, mock
     checkout 404.
   - Do a quick live page check with real fonts (welcome and others at 360/430, ar/en, light/dark: no page error, no
     sideways scroll).
7. **Sentry:** no unresolved issue in the last hour.
8. **Write the outcome** in `memory/topics/late-requests.md` (deployment id, tag, checks), then commit and push.

**Rollback.** See `qatar/docs/ops/rollback.md`.

---

## 7. Standing rules, owner preferences and hard-won lessons

### 7.1 From `CLAUDE.md`

These are binding. Read the file itself; this list only highlights them.

- Reply to the owner in Arabic. Never assume the owner's gender in replies: use neutral forms. Member-facing Arabic copy
  is feminine.
- Change only what the owner asked for. **New or changed Arabic copy needs the owner's own wording or explicit approval:
  propose, then wait.**
- Use names, titles and figures exactly as given. When unsure, ask.
- **Never change the logo**, its shape or colour (`brandMark` in `web/motif.js`; `brand` token), anywhere.
- Colours only from `qatar/design/tokens.json`. Never hand-edit `web/tokens.css` or `herzone_tokens.dart`.
- No secrets in the repo or the frontend. Never ask for keys in chat: the owner adds GitHub or Supabase secrets.
  Never disable TLS.
- Never bypass a blocked or denied action; report it.
- No pull requests unless asked. No purchases. **No model names in commits.**
- UI changes need a real-font check at 360, 390, 402 and 430 px, in ar and en, light and dark. Temporary browser scripts
  go in `qatar/api/test/zz-*.mjs` and are deleted afterwards.
- Keep `memory/topics/late-requests.md` current.

### 7.2 Owner's user preferences

- Verify names and figures exactly.
- Ask when unsure.
- Change only what was instructed.
- Remember every correction for the rest of the session.
- Double-check names, titles and figures before delivering.

### 7.3 Design rules from the owner

The owner rejected a design round for breaking these. They are binding.

- **Start from HerZone's own screens.** An idea adds life (photo, motion, depth, pattern); it never brings in a foreign look.
- **Fixed elements:**
  - The primary button is mauve.
  - Yellow (`accent` #FDD001) is a fill only, for the emphasised welcome word, and nowhere else.
  - The table-motif seats are mauve or dashed, never yellow.
  - Keep: the floating top bar, the heading place, the date leaf, and the existing texts.
- **Nothing under «ابدئي»** on the welcome screen.
- **No social-proof numbers, no invented member quotes.**
- **60-30-10 (21 Nov):**
  - Mauve only for the primary CTA, the current tab and the table seats.
  - At most 3 accent elements per screen. This is enforced by `qatar/api/test/color-603010-ui.test.mjs` and
    `qatar/app/test/color_603010_test.dart`.
- **Motion:**
  - At most 300 ms per animation; the slow token is 280 ms.
  - Transform and opacity only.
  - Every animation is dead under reduced motion.
  - The spring curve is token `motion.spring`.
- **Flags** are real round flag PICTURES (circle-flags), never emoji.
- **«سُفرة» background pattern:**
  - Dashed seats only, never filled.
  - Colours: borderStrong at 0.30, and the seat colour at 0.10 (light) / 0.22 (dark).
  - Hidden on sign-in, account, payment and details, and under high contrast.

### 7.4 Operational lessons

- **Supabase writes.** The Supabase MCP connector's write confirmation never reaches the owner: it timed out five times.
  - Any migration that drops or replaces objects, and any data publish: give the owner a single SQL file to run in each
    project's SQL editor.
  - Then verify with read-only SQL.
  - Do not work around this by editing the migration.
- **Vercel calls** often need the owner's "Allow". If a call hangs, tell the owner.
- **No Vercel redeploys of production.** "Redeploy" in the Vercel dashboard would re-ship an OLD commit. Only
  `create_deployment` with the new SHA ships new code.
- **Staging test data.** Staging API calls from scripts need an `idempotency-key` header on non-GET requests.
  - Website localStorage keys are `q_` + key, with JSON-encoded values (`q_locale`, `q_theme`, `q_tokens`).
  - A refresh token rotates: never reuse one token across several browser contexts, or the server ends the session.
- **Injecting CSS on the live site for a mockup.** The CSP `style-src 'self'` blocks it. Use Playwright `bypassCSP: true`
  for mockups only.
- **Measuring line counts.** `getClientRects().length` on a block is always 1. Measure height ÷ line-height instead.
- **Flaky-looking CI tests were real test bugs twice.**
  - A hash-only navigation left the old form on screen (`matching-history.test.mjs`).
  - A ResizeObserver frame lag (`patterns-ui.test.mjs`).
  - Treat any repeat failure as real.

---

## 8. Open items

### 8.1 Owner actions (things only the owner can do), in priority order

1. **Set the GitHub default branch to `rightime-app`** (repo Settings → General → Default branch).
   - Today it is `add-rea-mcp-permissions`, so GitHub has registered only "CI" and "Deploy API". The other workflows have
     **never run** (0 scheduled runs):
     - `uptime.yml`: the every-30-minute smoke check.
     - `db-backup.yml`: the daily encrypted database dump.
     - `draft-openers.yml`
     - `app-e2e.yml`
   - Production has **no backups at all**: Supabase is on the Free plan and the dump workflow never runs.
2. **Renew staging's Supabase token** (lower priority now: staging is kept current by the workaround in §6 step 5).
   - Create a token at https://supabase.com/dashboard/account/tokens.
   - In Vercel → `qatar-mvp-staging` → Settings → Environment Variables, replace `SUPABASE_ACCESS_TOKEN` (Production).
   - Then a production-target staging build works again and replaces the pinned-import Edge Function with the bundled copy.
3. **Privacy notice (privacy-qa-5): DONE 24 Nov** on production and staging through the Supabase connector
   (`qatar/ops/seed_privacy_v5.sql` plus the `published_at = now()` update). Nothing left to run.
   - The title still reads «(مسودة بانتظار مراجعة المستشار القانوني)». The owner was told and has not asked to change it.
   - Registration still needs terms and conduct published (item 7).
4. **Backups.**
   - Create an age key pair.
   - Add GitHub secrets `SUPABASE_DB_URL` (session pooler string) and `BACKUP_AGE_RECIPIENT`.
   - After item 1, run "db-backup" once, then test one restore on staging (`qatar/docs/ops/backup-restore.md`).
   - Supabase Pro at launch (decision `2026-11-06-backups.md`).
5. **SMS provider.** Twilio account, then Edge Function secrets (§4), then app_config `SMS_PROVIDER=twilio` on production.
   Until then, production sign-in returns 503.
6. **Payment provider (PSP) contract.**
   - The developer then builds the real adapter.
   - It must send the cardholder name: the women-only card-name check depends on it.
7. **Legal texts.**
   - Review the drafts in `qatar/docs/legal/` with a lawyer: `terms-qa-2-draft.md` (16 open questions),
     `conduct-qa-2-draft.md` (9), `cancellation-qa-2-draft.md` (11), `dpia-draft.md`.
   - Approve the wording, then they get published like the privacy notice.
   - Registration needs terms + conduct + privacy published.
8. **Gemini.**
   - Add `GEMINI_API_KEY` as a GitHub secret, for the opener drafts.
   - Delete the old Gemini key (it still answered on 5 Nov).
   - Restrict the new key to the Generative Language API.
   - Enable billing with a budget alert before launch.
   - Rotate keys about every 3 months.
9. **Store accounts:** Apple Developer and Google Play (NMX-45/46). No store build can be uploaded until then.
10. **First venue and first session in production,** then a live end-to-end test.
11. **Vercel production branch** = `release` (herzone-production → Settings → Git). Optional: the explicit
    `create_deployment` path works without it.
12. **Privacy of the owner's email: removed from `memory/topics/late-requests.md` on 24 Nov (cd66a66).** It stays in git
    history unless the history is rewritten, which needs the owner's explicit decision (rewriting a public branch
    breaks every clone).
13. **Browser access for the developer (optional).** Dashboard-only steps (items 1, 2, 4, 8, 11) could be done by the
    developer if a Remote Control folder on the Mac were reachable: today `xnms-MacBook-Pro / Claude 101` is listed but
    `not_available` to cloud sessions (update the Claude desktop app, or run a session on the Mac itself).

### 8.2 Owner decisions pending

**Product and money**
- **Launch-free offer contradiction.**
  - `PRICING_LAUNCH_FREE` is `true` on production.
  - The pay screen says «يُخصم المبلغ للتحقق من البطاقة ويُرد إليكِ كاملًا.», but **no code refunds it**.
  - Decide before any real money is taken: build the refund, or change the wording (owner's words).
- **Other legal/code contradictions** found while drafting (details in `late-requests.md`, "Legal documents"):
  - A fee is kept on a proven breach only for the card-name rejection; a suspension refunds in full.
  - There is no block button, and blocks are never lifted after a won appeal.
  - Table-cancel refunds wait for finance approval with no time limit, while the member is told «خلال 10 أيام عمل».
  - «لا تتحملين أي رسوم» is shown after she has already paid.
  - Not built:
    - the coordinator's ID request
    - hearing the reported member
    - the sanction ladder
    - the self-move «انقلني لموعد آخر» (the string exists, unused)
    - a rule for a paid booking with no table
  - The plans page shows a refund guarantee for subscriptions that are not sold.
  - The +1 decision record is outdated: tablemates now see the companion's name.
  - The suspension auto-expiry is now built (16 Nov).
- **Repair phases** proposed 15 Nov:
  - 0: decisions.
  - 1: one full booking in production.
  - 2: pilot tables and measures.
  - 3: pattern (done) and seats moment (done).
  - 4: AI:
    - openers (plumbing done)
    - coordinator memo
    - feedback statistics
  - 5: backups and stores.
  - 6: competition pack.
- **Matching weights** stay as they are until there are real ratings (owner, 16 Nov):
  - values 32%, personality 28%, social 18%, interests 12%, lifestyle 10%;
  - energy 7%, mean/cohesion 60/40;
  - age-band gap at most 2 (3 for small tables).

**Copy and design**
- Older copy waiting for the owner's wording: §13d–13e and 13k in `late-requests.md`.
  - The coordinator spelling «المنسق»/«منسّق», and whether to drop «المنسق» elsewhere.
  - Next-step lines for payment and refund errors.
  - Contact-form strings and all English translations.
  - The ICU plural for the questionnaire's time left.
- The app's seat key «محجوز/متاح» vs the website's «مقعد محجوز/مقعد متاح»: pick one.
- The app's details screen gained a small table drawing for the seats-pop moment (20 Nov). The owner was told; keep or
  remove.
- Older open design items: §17–30 of `late-requests.md`.
  - Which round-3 photos go into the product; redo photos 4 and 6.
  - GIFs, video, sounds and music approval.
  - Store-screenshot fee text and English captions.
- Celebration meetups, open points (§20a):
  - minimum notice before the date;
  - what the tablemates are told;
  - who pays for the preparations;
  - priority for the celebrant;
  - a privacy line about the occasion.
- Older decisions:
  - Biometric lock scope.
  - A fixed reviewer code for the Apple review.
  - An admin tool for a member who lost her number.
  - Devices and tablets.
  - Sessions per week and districts.
  - Coordinators on duty.
  - Spec v0.3 precedence.

### 8.3 Developer backlog: can start without waiting

Ask the owner first only where marked.

**A. Security findings from the 23 Nov review.** Items 1–5 were **built, tested and released on 24 Nov** (branch
`security-fixes`, merged in 59f328e, released in 0d3e4e2; 027 applied to both projects; details in
`memory/topics/late-requests.md`, section "Security fixes 1–5"). The notes below describe the findings as they were;
what remains open is item 2's second factor (owner decision) and item 6 (before a real PSP). One deviation from the
plan below: `effective_days` is validated only for a suspension, because the admin console sends the field with every
decision.

1. **(Medium) Free paid seat via rebook of an unpaid booking.**
   - **Path:**
     - `cancelFutureBookings` (`qatar/api/src/routes/admin.js` ~688) marks unpaid `payment_pending` bookings
       `cancelled_by_organizer` on a suspension or ban.
     - `chooseResolution` (`routes/user.js` ~960) "rebook" never checks for a payment. Only "refund" does.
     - `app.rebook_booking` (`db/migrations/026_plus_one.sql` 187–220) inserts a `paid_awaiting_group` booking.
   - **Fix:**
     - New migration `027`: in `rebook_booking`, add
       `IF app.captured_payment_for(old.id) IS NULL THEN RAISE EXCEPTION 'NOT_REBOOKABLE: not paid' USING ERRCODE = 'P0030'; END IF;`
     - The same check in `chooseResolution` and `resolutionOptions`.
     - `cancelFutureBookings`: set unpaid holds to `expired` instead.
     - Add a regression test.
   - **Owner action:** run 027 in both SQL editors.
2. **(Medium) Admin login is email + 6-digit TOTP only.**
   - Code: `routes/admin.js` `login` ~87; `lib/crypto.js` `totpStep` accepts ±1 step.
   - The lockout is 5 fails per 15 min per email, so about 480 guesses a day.
   - **Fix:** a 24-hour cap (for example 20 failures, then lock and alert the owner) in `lockedFor`. Then a second factor
     (password with argon2, or a passkey); the second factor is a product decision.
3. **(Low) `effective_days` unbounded** (`routes/admin.js` ~735: `Number(body.effective_days || 30)`).
   - **Fix:** a whole number from 1 to 365, otherwise 422 `VALIDATION_FAILED`.
4. **(Low) `GET /api/admin/v1/approvals` uses `roles: ANY`** (`routes/admin.js` ~1253).
   - **Fix:** `roles: APPROVERS` (the const at ~555).
5. **Hardening:**
   - Add `.env*`, `*.pem`, `*.key`, `google-services.json`, `GoogleService-Info.plist` and service-account JSON to the
     root `.gitignore`.
   - Widen the `predeploy-gate.mjs` secret scan (`eyJ`, `AKIA`, `sk-`, `github_pat_`) and include `qatar/app/lib`.
   - Require https for `GEMINI_BASE_URL`, like `sms.js` does.
   - `sw.js` ~48: reject push URLs starting with `//`.
   - Refuse to start in production with `MOCK_PSP_ENABLED` on.
6. **Before a real PSP:**
   - Create a new payment row and checkout when "+1" changes the amount (`user.js` ~806).
   - A failed webhook event must not consume its event id (`routes/payments.js` ~28).
   - Validate `refund.succeeded` amount and intent.
   - Re-test all refund rules.

**B. Other development work**
- **Opener library.** Once `GEMINI_API_KEY` is a GitHub secret and the default branch is fixed:
  1. Run "Draft table openers", which produces the artifact `drafts.json` (68 pairs).
  2. The owner approves or rewords each line.
  3. Copy the approved lines into `qatar/api/src/lib/openers.js`.
  4. Release with approval.
- **App store build.** After the store accounts (NMX-45/46): add the shared-themes line to the app (owner decision); the
  Maestro flows (NMX-56).
- **Deferred refactor:** split `web/app.js` and the contact sheet in `event_details_screen.dart`. The owner agreed to
  defer it (12 Nov).

---

## 9. Recent work log (13–24 Nov)

All released unless marked otherwise.

| Date | What | Commits / deployment |
|---|---|---|
| 13 Nov | herzone.app moved to herzone-production; owner admin created; QA-2026-05 published in production | f3adf75 |
| 14 Nov | Phone field in one box with round flag pictures; identity step; design rounds 1–3 on web and app | e41e896, 56e59f7, f7b6b85 |
| 15 Nov | "+1" companion (migration 026, owner ran it); waitlist steps; refund line; fee page; tablemates see the companion's name; UX/accessibility fixes; 13 reference patterns; language row, dark-mode switch, ✓ on done steps | fdb7ae1, d703847, eb207d5, 10421c0 |
| 15 Nov | Arena analysis; legal drafts (15f8219); opener plumbing (not active) | — |
| 16 Nov | Suspension auto-expiry (`services/suspensions.js`); feminine bill line «تدفعين…»; Gemini line in the privacy seed; CI test fixes | 156cbc1, 14a40d1, d6483e8 |
| 20 Nov | «سُفرة» pattern (option B), the 19 motion principles, everything above | b3f2bfb, dpl_5YEAmf3jJtHXSXq46igNis6txY6i |
| 21 Nov | 60-30-10 colour pass: tinted neutrals (bg `#F3E6DE`, surface `#FBF2EE`, sunken `#E9D5C5`, border `#DBC2AE`, borderStrong `#8A7062`); surface next-meetup card; ink «HerZone» on the app welcome; yellow dot removed; pattern mauve layer 0.10 in light | a60f00b, dpl_716QwTbwoNJJTbxsLgzRgBkqtZjG |
| 23 Nov | Security review of 14 classes. Findings in §8.3 A. No code change. | 43cf69c (notes) |
| 24 Nov | Privacy notice published on both projects; owner's e-mail removed from the notes; staging website refreshed by alias and staging API redeployed through the connector (pinned import); security fixes 1–5 and the hardening list built on `security-fixes` with 12 new tests, merged, 027 applied to staging and production, released; `effective_days` check limited to suspensions. Default-branch change attempted and refused (settings API 403, push to the default branch denied by the harness). | 59f328e, 3c2aad4, 0d3e4e2; dpl_DYaCi4kZi2btkd9phcdxs8byfDUY (prod), dpl_Cbnxhs1eGefJ3T7uYvkV514uNRkg (staging web), Edge Function v52 (staging) |

---

## 10. Where things are (quick reference)

| Feature | Files |
|---|---|
| Auth dispatcher (token types, roles, suspended gate) | `qatar/api/src/app.js` ~72–113 |
| Member OTP | `qatar/api/src/routes/user.js` ~140–210 |
| Admin login, enrol, lockout (15-min and daily caps) | `qatar/api/src/routes/admin.js` ~21–150; `lib/crypto.js`; `lib/config.js` (`adminMaxFailsPerEmailDaily`) |
| Booking, hold, +1, review, pay, rebook | `routes/user.js` (book ~669, checkout ~797, resolution ~965); `db/migrations/026_plus_one.sql`, `027_rebook_requires_payment.sql` |
| Payments and webhook | `routes/payments.js`; `services/payments.js`; `services/psp.js` |
| Minute dispatcher: push, coordinator alerts, refunds, suspensions | `routes/push.js` `dispatch`; `services/{coordinator_alerts,payments,suspensions}.js` |
| Identity card-name check plus Gemini | `services/identity.js`; `lib/ai.js`; `lib/namematch.js` |
| Matching | `api/src/matching/{engine,personality}.js`; `qatar/matching/*.py` |
| Openers | `api/src/lib/openers.js` (empty); `ops/draft-openers.mjs`; `.github/workflows/draft-openers.yml` |
| Pattern, motion, colour | `web/styles.css` (`.sufra-bg`, `--sufra-o1/o2`); `app/lib/ui/common/sufra_background.dart`; `app/lib/ui/common/press.dart`; `design/tokens.json` |
| Legal | `qatar/docs/legal/*`; `qatar/ops/seed_privacy_v5.sql` |
| Release record | `qatar/docs/security/baseline-checks.md` |
| Secret scan (build gate, web + app/lib) | `qatar/ops/secret-scan.mjs`; `api/test/secret-scan.test.mjs` |
