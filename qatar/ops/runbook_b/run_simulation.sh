#!/usr/bin/env bash
# Runbook B end-to-end simulation on a throwaway database.
# Usage: PGHOST=/tmp PGPORT=5433 PGUSER=app ./run_simulation.sh [dbname]
set -euo pipefail
DB="${1:-runbook_b_sim}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/001_init.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/002_api_support.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/003_otp_phone.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/004_cron_and_indexes.sql"
"${PSQL[@]}" -1 -f "$ROOT/ops/seed_common.sql"
for f in 01_seed_live_table 02_intake_s1 03_coordinator_and_triage 04_decision_and_appeal 99_verify; do
  "${PSQL[@]}" -1 -f "$HERE/$f.sql"
done
