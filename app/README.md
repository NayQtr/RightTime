# Rightime — happy-path web app

Static single-page app (Supabase-JS) implementing the happy-path slice from
`docs/specs/2026-10-20-rightime-happy-path-design.md`: magic-link auth, the
questionnaire, event browsing, booking, and "My events" — against a live
Supabase project (Postgres + Auth + RLS).

Config is inline in `index.html` (`SUPABASE_URL` + publishable key — safe to ship).

Deploy: any static host. For Vercel: `vercel deploy app --prod` (or point a
Vercel project at this folder). After deploy, add the deployed origin to
Supabase → Authentication → URL Configuration (Site URL + Redirect URLs) so
magic links return to the site.
