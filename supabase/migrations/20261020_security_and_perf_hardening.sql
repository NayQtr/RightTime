-- Consolidated hardening from the 2026-10-20 review (see docs/reviews/2026-10-20-rightime-audit.md).

-- [HIGH] Overbooking fix: capacity must be enforced on UPDATE too, not only INSERT.
-- Previously a user could INSERT a 'cancelled' booking then UPDATE it to 'confirmed'
-- to bypass the full-table check. Now any resulting 'confirmed' row is capped.
create or replace function public.sync_event_seats()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare eid uuid; cnt int; cap int;
begin
  eid := coalesce(new.event_id, old.event_id);
  select seats into cap from public.events where id = eid for update;
  select count(*) into cnt from public.bookings where event_id = eid and status = 'confirmed';
  if tg_op in ('INSERT','UPDATE') and new.status = 'confirmed' and cnt > cap then
    raise exception 'event is full';
  end if;
  update public.events
     set attendees_count = cnt, status = case when cnt >= cap then 'full' else 'open' end
   where id = eid;
  return null;
end $function$;

-- [MEDIUM] Trigger functions should not be callable as PostgREST RPCs.
revoke execute on function public.sync_event_seats() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- [PERF] Evaluate auth.* once per statement, not per row.
alter policy "own profile read"    on public.profiles using ((select auth.uid()) = id);
alter policy "own profile insert"  on public.profiles with check ((select auth.uid()) = id);
alter policy "own profile update"  on public.profiles using ((select auth.uid()) = id);
alter policy "events readable"     on public.events  using ((select auth.role()) = 'authenticated');
alter policy "own bookings read"   on public.bookings using ((select auth.uid()) = user_id);
alter policy "own bookings insert" on public.bookings with check ((select auth.uid()) = user_id);
alter policy "own bookings update" on public.bookings using ((select auth.uid()) = user_id);

-- [PERF] Covering index for the bookings.event_id FK (seat trigger + tablemates).
create index if not exists bookings_event_idx on public.bookings(event_id);

-- [LOW] tablemates: trim the appended industry value so "  Tech  " renders cleanly.
create or replace function public.tablemates(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_seat  boolean;
  v_total int;
  v_seats int;
  v_blurbs jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.bookings
    where event_id = p_event and user_id = v_uid and status = 'confirmed'
  ) into v_seat;
  if not v_seat then
    raise exception 'not a confirmed attendee' using errcode = '42501';
  end if;

  select seats into v_seats from public.events where id = p_event;

  select count(*) into v_total
  from public.bookings
  where event_id = p_event and status = 'confirmed';

  select coalesce(jsonb_agg(blurb order by rnd), '[]'::jsonb) into v_blurbs
  from (
    select
      coalesce(nullif(trim(p.characteristics->>'personality'), ''), 'A guest')
      || case
           when nullif(trim(p.characteristics->>'industry'), '') is not null
           then ' · in ' || trim(p.characteristics->>'industry')
           else ''
         end as blurb,
      random() as rnd
    from public.bookings b
    join public.profiles p on p.id = b.user_id
    where b.event_id = p_event
      and b.status = 'confirmed'
      and b.user_id <> v_uid
  ) s;

  return jsonb_build_object('total', v_total, 'seats', v_seats, 'blurbs', v_blurbs);
end;
$$;

revoke all on function public.tablemates(uuid) from public, anon;
grant execute on function public.tablemates(uuid) to authenticated;
