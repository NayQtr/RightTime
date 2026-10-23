#!/usr/bin/env bash
# Assembles Qatar_Phase3_PreLaunch_Package_v0.4.md (+ .docx) from src/*.md and the tested code files,
# so the appendices are byte-identical to what the checks ran against.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/Qatar_Phase3_PreLaunch_Package_v0.4.md"
code() {  # $1 = language, $2 = repo-relative path
  printf '\n### `%s`\n\n```%s\n' "$2" "$1"
  cat "$ROOT/$2"
  printf '```\n'
}
{
  cat "$HERE"/src/*.md
  printf '\n# Appendix A — Full source (copy-paste ready)\n\nEach block below is the exact file that was executed in §0.4.\n'
  printf '\n## A.1 Database migration\n';            code sql qatar/db/migrations/001_init.sql
  printf '\n## A.2 Schema behaviour checks\n';       code sql qatar/db/tests/001_init_checks.sql
  printf '\n## A.3 Matching engine, tests, bridge\n'
  code python qatar/matching/matching_engine.py
  code python qatar/matching/test_matching_engine.py
  code python qatar/matching/publish_run.py
  printf '\n## A.4 Design tokens and contrast checker\n'
  code json qatar/design/tokens.json
  code python qatar/design/contrast_check.py
  printf '\n## A.5 Runbook simulations\n'
  code sql qatar/ops/seed_common.sql
  for f in "$ROOT"/qatar/ops/runbook_a/*.sql "$ROOT"/qatar/ops/runbook_b/*.sql; do code sql "${f#$ROOT/}"; done
  code bash qatar/ops/runbook_a/run_simulation.sh
  code bash qatar/ops/runbook_b/run_simulation.sh
} > "$OUT"
pandoc "$OUT" -o "${OUT%.md}.docx" --toc --toc-depth=2
echo "wrote $OUT and ${OUT%.md}.docx"
