#!/usr/bin/env bash
# Daily database backup: dump the app's own schemas (public, app) and encrypt the dump with age before it leaves the
# runner. Only the public key is needed here; the private key stays with the owner, offline, so a leaked GitHub secret
# or artifact cannot be read. Restore steps: qatar/docs/ops/backup-restore.md.
#
#   DB_URL         Postgres connection string (Supabase *session pooler*, IPv4)   (GitHub secret SUPABASE_DB_URL)
#   AGE_RECIPIENT  age public key, "age1..."                                      (GitHub secret BACKUP_AGE_RECIPIENT)
#   OUT_DIR        where to write the encrypted file (default: ./backup)
set -euo pipefail
: "${DB_URL:?DB_URL is not set}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is not set}"
OUT_DIR="${OUT_DIR:-backup}"
mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y-%m-%dT%H%MZ)"
out="$OUT_DIR/herzone-$stamp.pgc.age"
umask 077
# custom format (compressed, restorable table by table); the plain dump never touches the disk
pg_dump "$DB_URL" --format=custom --no-owner --no-privileges --schema=public --schema=app \
  | age --encrypt --recipient "$AGE_RECIPIENT" --output "$out"
size=$(stat -c %s "$out")
if [ "$size" -lt 1024 ]; then echo "backup too small ($size bytes): refusing to call it a backup" >&2; exit 1; fi
echo "wrote $out ($size bytes)"
