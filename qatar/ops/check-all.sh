#!/usr/bin/env bash
# Full check before every push: the Vercel build gate, then the whole test suite (database and browser tests included).
# Needs a local Postgres 16 on the socket in /tmp, port 5433 (user "app"), and Playwright's Chromium.
# Usage: qatar/ops/check-all.sh   (or: cd qatar/api && npm run check)
set -euo pipefail
cd "$(dirname "$0")/.."
node ops/predeploy-gate.mjs
pg_isready -q -h /tmp -p "${PGPORT:-5433}" || { echo "[check] Postgres is not running on /tmp:${PGPORT:-5433}"; exit 1; }
cd api && npm test
