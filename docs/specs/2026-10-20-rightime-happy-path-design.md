# Rightime — Happy-Path MVP, Design Spec

**Date:** 2026-10-20
**Status:** Draft for review (no resources created yet)
**Author:** Claude Code session
**Scope class:** Architectural (first vertical slice of a larger platform)

> Rightime is a reconstruction of the Timeleft concept (dinners with strangers). This spec
> turns the demo into a **real, deployable web product** — one honest vertical slice first.

---

## 1. Goal & scope

**Goal:** a deployable web app where a real person can sign in, answer the matching
questionnaire, browse real events from a database, book a seat, and see it under "My events" —
with real auth and a real Postgres backend.

**In scope (this slice):**
- Magic-link email auth (Supabase Auth).
- Profile + questionnaire persisted to Postgres.
- Event browsing from the DB, filtered by city/format.
- Booking a seat with correct, concurrent-safe seat counts; a "My events" list; cancel.

**Out of scope (later slices, explicitly not built now):**
- Payments / Stripe / RevenueCat (booking is free here).
- Group chat / DMs / PubNub.
- The matching engine (events are seeded, not algorithmically formed).
- Crossed-paths, the Dinner Game, moderation, the no-show penalty, push notifications.

**Why a deployed web app and not the Artifact:** the Claude Artifact sandbox blocks network
calls to external hosts (its CSP permits scripts from a few CDNs only). A Supabase-backed app
cannot run there. The interactive artifact stays as the *demo/marketing* surface; the real
product is a separate deployed app.

## 2. Architecture

```
Browser ──> Next.js (App Router, on Vercel) ──> Supabase
             - server components read data        - Postgres (RLS on)
             - client components for forms         - Auth (magic link)
             - @supabase/ssr for auth cookies      - auto REST (PostgREST)
```

- **Front end:** Next.js (App Router) + TypeScript. Server Components fetch data with the
  user's session; a few Client Components handle the questionnaire and booking buttons.
- **Backend:** Supabase — Postgres, Auth, Row-Level Security, auto-generated REST. No custom
  server needed for this slice.
- **Auth transport:** `@supabase/ssr` (cookie-based sessions) so Server Components are
  authenticated.
- **Hosting:** Vercel. Two env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Design system:** reuse the existing Rightime visual language (Fraunces + Hanken Grotesk,
  the ember/claret OKLCH tokens, "The Menu" editorial voice) as a small CSS token file, so the
  product looks like the demo.

Keep it surgical (karpathy/YAGNI): no state library, no ORM, no component kit — Supabase client
+ server components + plain CSS tokens. Add abstractions only when a second consumer appears.

## 3. Data model (Postgres)

```sql
-- PROFILES: one row per auth user
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  city_id text,                         -- references a known city code, e.g. 'par'
  characteristics jsonb not null default '{}'::jsonb,  -- questionnaire answers
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- EVENTS: seeded for this slice (no matching engine yet)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dinner','women','coffee','drinks','walk','run')),
  name text not null,
  neighbourhood text,
  city_id text not null,
  starts_at timestamptz not null,
  seats int not null check (seats > 0),
  attendees_count int not null default 0,
  status text not null default 'open' check (status in ('open','full'))
);

-- BOOKINGS: a seat held by a user at an event
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);
```

**Seat integrity (concurrent-safe):** a trigger recomputes `attendees_count` and `status` from
the count of confirmed bookings, inside the transaction, so two people booking the last seat
can't both succeed:

```sql
create or replace function public.sync_event_seats() returns trigger
language plpgsql security definer as $$
declare eid uuid; cnt int; cap int;
begin
  eid := coalesce(new.event_id, old.event_id);
  select seats into cap from public.events where id = eid for update;
  select count(*) into cnt from public.bookings
    where event_id = eid and status = 'confirmed';
  if tg_op = 'INSERT' and new.status = 'confirmed' and cnt > cap then
    raise exception 'event is full';
  end if;
  update public.events
     set attendees_count = cnt, status = case when cnt >= cap then 'full' else 'open' end
   where id = eid;
  return null;
end $$;

create trigger trg_sync_seats
after insert or update or delete on public.bookings
for each row execute function public.sync_event_seats();
```

**Row-Level Security:**

```sql
alter table public.profiles enable row level security;
alter table public.events   enable row level security;
alter table public.bookings enable row level security;

-- profiles: a user sees and edits only their own
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile upsert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- events: readable by any signed-in user; no client writes (seeded by service role)
create policy "events readable" on public.events for select using (auth.role() = 'authenticated');

-- bookings: a user reads and writes only their own
create policy "own bookings read"   on public.bookings for select using (auth.uid() = user_id);
create policy "own bookings insert" on public.bookings for insert with check (auth.uid() = user_id);
create policy "own bookings update" on public.bookings for update using (auth.uid() = user_id);
```

A `handle_new_user` trigger on `auth.users` inserts a blank `profiles` row on signup.

## 4. Questionnaire fields (recovered from the real app)

Stored in `profiles.characteristics` jsonb. Sensitive fields (politics, religion) are **optional**
and clearly skippable:

`gender`, `birthdate` (decade), `relationship_status`, `industry`, `personality`, `interests[]`,
`drinks`, `children`, `languages[]`, `dietary[]`, and optional `politics`, `religion`.

## 5. Screens / routes

| Route | Purpose | Rendering |
|---|---|---|
| `/` | Landing → sign in (or continue) | server |
| `/auth/callback` | Supabase magic-link callback | route handler |
| `/onboarding` | Questionnaire (multi-step) → writes characteristics, then city | client |
| `/events` | Browse events for your city, filter by format | server + client filter |
| `/events/[id]` | Event detail + Book / Cancel | server + client action |
| `/me` | "My events" (confirmed + cancelled) | server |

Gate: unauthenticated → `/`; authenticated but `onboarding_complete=false` → `/onboarding`.

## 6. Security & privacy

- RLS everywhere; users touch only their own `profiles`/`bookings`.
- Events seeded with the **service role key used only in a local seed script**, never shipped to
  the client. The browser only ever gets the anon key.
- Questionnaire collects personal attributes (incl. optional politics/religion). For an MVP with
  the owner's own test accounts this is fine; a real launch needs a privacy policy + consent and
  a data-deletion path (`delete from auth.users` cascades). Noted as a launch gate, not built now.
- No secrets in the repo; keys live in Vercel/Supabase env + a gitignored `.env.local`.

## 7. Testing / verification

- **DB:** a SQL test that books the last seat twice and asserts the second fails ("event is
  full"); an RLS test that user A cannot read user B's bookings.
- **App:** manual e2e of the happy path on the deployed preview (sign in → onboarding → book →
  /me). A Playwright happy-path test is a nice-to-have, not required for this slice.

## 8. Deployment

- Code in a new folder `app/` on a branch of `nayqtr/righttime`, **or** a dedicated repo
  `rightime-app` — open question (§10).
- Supabase project created in the **AnyParties** org; migrations applied via the Supabase MCP.
- Vercel project linked to the repo/folder; env vars set; deploy → preview URL.

## 9. Build plan (ordered, each step verifiable)

1. Create Supabase project (AnyParties); apply schema + RLS + triggers (migration).
2. Seed ~12 events across cities/formats (service-role seed script).
3. Scaffold Next.js app; wire `@supabase/ssr`; magic-link sign-in + callback.
4. Onboarding questionnaire → persist characteristics + city; set `onboarding_complete`.
5. `/events` list + format filter (server read, RLS-scoped).
6. `/events/[id]` detail + Book/Cancel (insert/update booking; trigger keeps seats honest).
7. `/me` list.
8. Port Rightime CSS tokens for visual parity.
9. Deploy to Vercel; smoke-test the happy path on the preview URL.

## 10. Open questions for the user

1. **Repo location:** new folder in `nayqtr/righttime`, or a new dedicated repo?
2. **City list:** start with the six demo cities (Paris/London/NYC/Philadelphia/Denver/San Diego)?
3. **Deploy now or local-first:** build + deploy to a Vercel preview in one go, or build and
   hand you the code to deploy yourself?

## 11. Self-review notes

- Placeholder scan: none left (no TBD/TODO).
- Consistency: schema ↔ routes ↔ flow align; trigger enforces the seat rule the UI relies on.
- Scope: single vertical slice; payments/chat/matching explicitly deferred — fits one plan.
- Ambiguity: "real product" resolved to deployed web app (artifact CSP rationale in §1/§2).
