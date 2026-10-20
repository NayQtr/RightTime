-- "Who's at your table": privacy-safe RPC.
-- SECURITY DEFINER so it can read other profiles, but it returns NO PII
-- (no names, emails, or user ids) and only to a confirmed attendee of that event.
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

  -- Caller must hold a confirmed seat at this event, or they get nothing.
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

  -- De-identified, shuffled one-liners for the OTHER confirmed guests.
  select coalesce(jsonb_agg(blurb order by rnd), '[]'::jsonb) into v_blurbs
  from (
    select
      coalesce(nullif(trim(p.characteristics->>'personality'), ''), 'A guest')
      || case
           when nullif(trim(p.characteristics->>'industry'), '') is not null
           then ' · in ' || (p.characteristics->>'industry')
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
