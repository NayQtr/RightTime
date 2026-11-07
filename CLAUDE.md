## Commands

HerZone (women-only small-table dinners and coffee in Doha). Code lives in `qatar/`: `api/` (Node server, tests),
`web/` (website), `app/` (Flutter app), `db/migrations/`, `design/` (tokens), `ops/` (gates, backup), `docs/`.
Working branch: `rightime-app`. Production branch: `release`.

### Setup

```bash
# API and website tests (needs Postgres 16 on socket /tmp, port 5433, user "app", and Playwright's Chromium)
cd qatar/api && npm ci
npx playwright install chromium          # skip where Chromium is preinstalled
npm run check                            # build gate + every API, database and browser test

# Build gate alone (syntax, secrets in shipped web files, npm audit)
node qatar/ops/predeploy-gate.mjs

# Flutter app
cd qatar/app && flutter pub get
flutter analyze && flutter test
python3 tool/osv_check.py                # dependency vulnerabilities

# Colours, type, spacing, motion: edit qatar/design/tokens.json, then regenerate and check contrast
python3 qatar/design/build_tokens_css.py
python3 qatar/design/build_tokens_dart.py
python3 qatar/design/contrast_check.py qatar/design/tokens.json

# Database backup (GitHub Actions, daily) and restore: qatar/docs/ops/backup-restore.md
```

### Rules

- Reply to the owner in Arabic. App copy in Arabic addresses a woman (feminine forms).
- Change only what the owner asked for. Arabic copy changes only with the owner's own wording; propose, then wait.
- Use names, titles and figures exactly as the owner gave them. When unsure, ask before acting.
- Never change the owner's logo (shape or colour), in the product or in any deck or document.
- Colours come only from `qatar/design/tokens.json`; never hand-edit `web/tokens.css` or `herzone_tokens.dart`.
- No secrets in the repository or the frontend. Never ask for keys in chat; the owner adds them as GitHub or
  Supabase secrets. Never disable TLS.
- Production releases need the owner's explicit approval. Order: baseline checks
  (`qatar/docs/security/baseline-checks.md`, record the run), CI green, push to `release`, then create the
  production deployment, then smoke checks (release tag, pages 200, API 401 without login) and Sentry.
- Never bypass a blocked or denied action; report it to the owner.
- No pull requests unless asked. No purchases. No model names in commits.
- Do not download or decompile competitors' apps.
- English decks and materials use English screenshots only.
- UI changes: the UI tests block Google Fonts, so also check layout with the real fonts at 360, 390, 402 and 430 px,
  in Arabic and English, light and dark. Temporary browser scripts go in `qatar/api/test/` (to import
  `helpers.mjs`) and are deleted afterwards.
- Pending owner actions, decisions and open questions: `memory/topics/late-requests.md`. Keep it current.
