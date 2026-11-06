# Database backup and restore

Daily at 02:17 Doha time, `.github/workflows/db-backup.yml` dumps the production database (schemas `public` and `app`,
all 51 tables) with `pg_dump` 17, encrypts it with [age](https://age-encryption.org) and keeps it 14 days as a
workflow artifact. The dump is encrypted before it leaves the runner. Only the owner's private key, kept offline, can
open it, so the artifact is safe in a public repository. Script: `qatar/ops/db-backup.sh`.

Tested on 6 Nov 2026 against the test database (51 tables): dump → encrypt → decrypt → restore into an empty database
gave identical row counts in every table. The one restore message, `schema "public" already exists`, is harmless.

## One-time setup (owner; no secret passes through Claude)

1. **Make the key pair on your own computer.** Install age (macOS: `brew install age`; Windows: `winget install
   FiloSottile.age`). Then run:
   `age-keygen -o herzone-backup.key`
   It prints `Public key: age1…`. Keep `herzone-backup.key` offline, for example in a password manager and on a USB
   stick. Without it no backup can be opened.
2. **Copy the database connection string.** In Supabase, open the production project, click **Connect**, choose
   **Session pooler**, and copy the URI. Replace `[YOUR-PASSWORD]` in it with the database password. Use the pooler:
   GitHub runners have no IPv6, and the direct connection is IPv6 only.
3. **Add two repository secrets.** GitHub → repository → Settings → Secrets and variables → Actions → New repository
   secret:
   - `SUPABASE_DB_URL`: the URI from step 2.
   - `BACKUP_AGE_RECIPIENT`: the `age1…` public key from step 1.
4. **Run the backup once by hand.** GitHub → Actions → **Database backup** → Run workflow. When it is green, an
   artifact `herzone-db-<number>` appears on the run page.

## Restore (test it once on the staging database, then before any real restore)

```bash
# 1. download the artifact zip from the run page, unzip it, then:
age --decrypt --identity herzone-backup.key herzone-<date>.pgc.age > herzone.pgc
# 2. restore into the STAGING project first (Session pooler URI of the staging project):
pg_restore --clean --if-exists --no-owner --no-privileges -d "<staging session pooler URI>" herzone.pgc
# 3. delete the decrypted file
rm herzone.pgc
```

- `pg_restore` must be version 17, the same as the server.
- `--clean` replaces the tables in the target: never point it at production unless that is the restore you mean.
- After the test, record it in `qatar/docs/security/baseline-checks.md` (launch checklist point 10).

## Later

At launch the Supabase Pro plan adds automatic daily backups inside Supabase. Keep this workflow too: it is a second
copy, outside Supabase.
