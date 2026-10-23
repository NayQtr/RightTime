-- T-25h: two S2 members cancel (u17, u18). Policy cxl-qa-1: full refund until T-48h, 0 % after,
-- so these late cancellations create no refund. The seat-release trigger gives the seats back.
SET search_path = app, public;
UPDATE bookings b SET status = 'cancelled_by_user', cancelled_at = c.t - interval '25 hours', cancel_actor = 'user',
       cancel_reason_code = 'schedule_changed'
FROM sim.clock c
WHERE b.session_id = '00000000-0000-0000-0000-00000000f002'
  AND b.user_id IN ('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0000-000000000118');
SELECT t.table_code, t.confirmed_count, t.status FROM event_tables t
WHERE t.session_id = '00000000-0000-0000-0000-00000000f002';
