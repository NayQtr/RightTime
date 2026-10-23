-- Expected end state of the Runbook A simulation (raises on the first mismatch).
SET search_path = app, public;
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(table_code || ':' || confirmed_count || ':' || status, ',' ORDER BY table_code) INTO v
    FROM event_tables WHERE session_id = '00000000-0000-0000-0000-00000000f001';
  IF v <> 'T01:6:locked,T02:6:locked' THEN RAISE EXCEPTION 'S1 tables: %', v; END IF;
  IF EXISTS (SELECT 1 FROM event_tables WHERE confirmed_count > 6) THEN RAISE EXCEPTION 'table above 6'; END IF;

  SELECT string_agg(status::text, ',') INTO v FROM event_tables WHERE session_id = '00000000-0000-0000-0000-00000000f002';
  IF v <> 'cancelled_quorum' THEN RAISE EXCEPTION 'S2 table: %', v; END IF;

  IF (SELECT count(*) FROM bookings WHERE session_id = '00000000-0000-0000-0000-00000000f001' AND status = 'revealed') <> 12
    THEN RAISE EXCEPTION 'S1 revealed count'; END IF;
  IF (SELECT count(*) FROM bookings WHERE status = 'cancelled_by_user') <> 2 THEN RAISE EXCEPTION 'late cancels'; END IF;
  IF EXISTS (SELECT 1 FROM refunds r JOIN bookings b ON b.id = r.booking_id WHERE b.status = 'cancelled_by_user')
    THEN RAISE EXCEPTION 'late cancel was refunded (policy is 0 %% after T-48h)'; END IF;

  SELECT string_agg(right(b.user_id::text, 2) || ':' || r.amount_minor || ':' || r.status, ',' ORDER BY b.user_id) INTO v
    FROM refunds r JOIN bookings b ON b.id = r.booking_id;
  IF v <> '15:5900:refunded,16:5900:refunded' THEN RAISE EXCEPTION 'refunds: %', v; END IF;

  SELECT string_agg(o.cancel_reason_code || ':' || n.status, ',' ORDER BY o.cancel_reason_code) INTO v
    FROM bookings n JOIN bookings o ON o.id = n.rebooked_from_booking_id
   WHERE n.session_id = '00000000-0000-0000-0000-00000000f003';
  IF v <> 'below_quorum:paid_awaiting_group,no_table_formed:paid_awaiting_group' THEN RAISE EXCEPTION 'S3 rebooks: %', v; END IF;
  IF (SELECT count(*) FROM bookings WHERE session_id = '00000000-0000-0000-0000-00000000f003' AND rebooked_from_booking_id IS NULL) <> 0
    THEN RAISE EXCEPTION 'rebook without source booking'; END IF;

  SELECT string_agg(seats_sold::text, ',' ORDER BY id) INTO v FROM event_sessions;
  IF v <> '12,0,2' THEN RAISE EXCEPTION 'seats_sold S1,S2,S3: %', v; END IF;

  SELECT string_agg(template_key || '=' || n, ',' ORDER BY template_key) INTO v
    FROM (SELECT template_key, count(*) n FROM notifications_outbox GROUP BY 1) x;
  IF v <> 'QUORUM_FAIL_CHOICE=4,REFUND_DONE=2,TABLE_LOCKED=12,VENUE_REVEALED=12' THEN RAISE EXCEPTION 'notifications: %', v; END IF;

  SELECT string_agg(action || '=' || n, ',' ORDER BY action) INTO v
    FROM (SELECT action, count(*) n FROM audit_logs GROUP BY 1) x;
  IF v <> 'booking_cancel_organizer=1,refund_batch_approve=2,table_cancel=1,table_lock=2,venue_notified=1'
    THEN RAISE EXCEPTION 'audit: %', v; END IF;

  RAISE NOTICE 'RUNBOOK A SIMULATION PASSED';
END $$;
