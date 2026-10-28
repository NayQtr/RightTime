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
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/002_api_support.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/003_otp_phone.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/004_cron_and_indexes.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/005_late_ack_and_admin_throttle.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/006_support_contact.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/007_deny_policies.sql"
"${PSQL[@]}" -1 -f "$ROOT/db/migrations/008_question_display.sql"
"${PSQL[@]}" -1 -f "$ROOT/ops/seed_common.sql"
"${PSQL[@]}" -1 -f "$ROOT/ops/seed_questionnaire_v2.sql"
"${PSQL[@]}" -1 -f "$HERE/01_seed_bookings.sql"
# T-48h: matching publishes S1 and S2 (seeded, reproducible; production packing mode min_leftovers).
# S1 has 2 bookable venue tables (12 seats) -> 6 + 6 + 1 leftover; S2 has 1 table.
for ST in 00000000-0000-0000-0000-00000000f001:2 00000000-0000-0000-0000-00000000f002:1; do
  "${PSQL[@]}" -At -c "SELECT app.matching_input('${ST%%:*}')" \
    | (cd "$ROOT/matching" && python3 publish_run.py --rule-version r1-interest --seed 20261023 --mode published \
         --packing-mode min_leftovers --max-tables "${ST##*:}") \
    | "${PSQL[@]}" -1
done
"${PSQL[@]}" -1 -f "$HERE/02_cancellations_t25.sql"
"${PSQL[@]}" -1 -f "$HERE/03_lock_t24.sql"
"${PSQL[@]}" -1 -f "$HERE/04_member_choices.sql"
"${PSQL[@]}" -1 -f "$HERE/05_after_deadline_refunds.sql"
"${PSQL[@]}" -1 -f "$HERE/99_verify.sql"
