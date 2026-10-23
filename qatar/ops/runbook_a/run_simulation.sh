#!/usr/bin/env bash
# Runbook A end-to-end simulation on a throwaway database.
# Usage: PGHOST=/tmp PGPORT=5433 PGUSER=app ./run_simulation.sh [dbname]
set -euo pipefail
DB="${1:-runbook_a_sim}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/001_init.sql"
"${PSQL[@]}" -1 -f "$ROOT/ops/seed_common.sql"
"${PSQL[@]}" -1 -f "$HERE/01_seed_bookings.sql"
# T-48h: matching publishes S1 and S2 (seeded, reproducible)
for S in 00000000-0000-0000-0000-00000000f001 00000000-0000-0000-0000-00000000f002; do
  "${PSQL[@]}" -At -c "SELECT app.matching_input('$S')" \
    | (cd "$ROOT/matching" && python3 publish_run.py --rule-version r1-interest --seed 20261023 --mode published) \
    | "${PSQL[@]}" -1
done
"${PSQL[@]}" -1 -f "$HERE/02_cancellations_t25.sql"
"${PSQL[@]}" -1 -f "$HERE/03_lock_t24.sql"
"${PSQL[@]}" -1 -f "$HERE/04_member_choices.sql"
"${PSQL[@]}" -1 -f "$HERE/05_after_deadline_refunds.sql"
"${PSQL[@]}" -1 -f "$HERE/99_verify.sql"
