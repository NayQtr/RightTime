# Rollback plan (HerZone)

What to do when a release breaks something. Written 5 Nov 2026 from how the build actually deploys.

## How a release goes live

- One Vercel build ships both the website and the API. The build command (`qatar/web/vercel.json`) runs the build gate,
  writes the site config, then deploys the API (Supabase Edge Function `api`) with `ops/deploy-api-from-vercel.mjs`.
- Only **production** builds deploy the API. Preview builds deploy the website only.
- Database changes are separate: migrations in `qatar/db/migrations` are pasted by the owner in the Supabase SQL Editor.
  The API is written to keep working on the database from before a migration (new features stay off until it runs).

## 1. Website and API together (the usual case)

Redeploy the last good deployment **with a rebuild**, so its own API version is deployed again:

1. Vercel → the project (staging `qatar-mvp-staging`, or `herzone-production`) → Deployments.
2. Find the last deployment that worked (its commit is in the list).
3. Menu (⋯) → **Redeploy** → target **Production**. Wait for "Ready".
4. Check: the site opens, sign-in works, `GET /api/v1/legal/current` answers 200.

**Don't use "Instant Rollback" alone.** It moves the website back without rebuilding, so the API stays on the new
version. Use it only when the problem is in the website files alone, and check the API afterwards.

## 2. Turn a feature off without a release

Some features have a switch in `app.app_config` (Supabase SQL Editor), for example the card-name check:

```sql
UPDATE app.app_config SET value = 'false' WHERE key = 'CARD_NAME_CHECK';
```

The API reloads these settings every 30 seconds, so the change applies within half a minute with no redeploy.
(A Supabase function secret of the same name overrides the table; check there too if a switch seems ignored.)

## 3. Database

- Migrations only add (tables, columns, functions). An older API runs on a newer database, so rolling back the
  website and API (step 1) does **not** need the database rolled back.
- Every migration file can be run again safely.
- A wrong data change cannot be undone by redeploying. Restore from a backup (see "Backups" below).
  Restoring replaces everything written since that backup, so take it only with the owner's decision.

## 4. Members' app (iOS and Android)

- A store release cannot be pulled back. Fix forward: ship a new version, and if the old one must stop, raise
  `MIN_APP_VERSION` (forced update, `app_config`), so older apps show the update screen.
- Keep the API compatible with the version members are using, so a website/API rollback never breaks the app.

## After any rollback

- Sentry: check that the new error stopped (projects herzone-web, herzone-api, herzone-app).
- Write a short note: what broke, what was rolled back, the fix.

## Backups

The Supabase organisation is on the **Free plan**, which has no automatic backups. Until a backup is in place (owner's
decision pending: a paid plan, or a daily encrypted dump), a data loss cannot be undone.
