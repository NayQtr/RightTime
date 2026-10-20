# Rightime — happy-path web app

Static single-page app (Supabase-JS) implementing the happy-path slice from
`docs/specs/2026-10-20-rightime-happy-path-design.md`: magic-link auth, the
questionnaire, event browsing, booking, and "My events" — against a live
Supabase project (Postgres + Auth + RLS).

Config is inline in `index.html` (`SUPABASE_URL` + publishable key — safe to ship).

## Live

- App (production): https://rightime-app.vercel.app/
- Supabase project: `ecsvbrsvwcgfcqjhkmrw` (eu-west-1)

## Deploy

Any static host. For Vercel: `vercel deploy app --prod` (or point a Vercel
project at this folder).

## Required one-time Supabase step (for magic-link sign-in)

Supabase only redirects magic links back to allow-listed origins. In the
Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://rightime-app.vercel.app`
- **Redirect URLs**: add `https://rightime-app.vercel.app/**`

Until this is set, the sign-in email sends but its link bounces to the default
`localhost` origin. There is no API/MCP tool for this setting — it is a
dashboard-only change.
