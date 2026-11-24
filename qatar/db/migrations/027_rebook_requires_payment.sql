-- 027: a rebook needs a captured payment (security review of 23 Nov 2026, finding 1).
--   An organiser cancellation of a booking that was never paid (an unpaid hold cancelled by a suspension or a ban) used
--   to be rebookable: rebook_booking (001, 026) checked the status and that nothing was resolved yet, but never that a
--   payment was captured, so the new booking was 'paid_awaiting_group' without a fee ever paid. It now refuses with
--   P0030 'NOT_REBOOKABLE: not paid' unless captured_payment_for() (003) finds a captured payment on the booking or the
--   chain it was rebooked from. The function is otherwise the one of 026 (seats and companion move with the booking).
--   The API (routes/user.js) makes the same check before calling it and offers no resolution for an unpaid booking;
--   routes/admin.js lets an unpaid hold expire instead of cancelling it.
-- Every name is schema-qualified; re-running this file is safe (CREATE OR REPLACE, same signature).
SET search_path = app, pg_temp;

CREATE OR REPLACE FUNCTION app.rebook_booking(p_booking_id uuid, p_user_id uuid, p_target_session uuid)
RETURNS app.bookings LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE old bookings; s event_sessions; nb bookings;
BEGIN
  SELECT * INTO old FROM bookings WHERE id = p_booking_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR old.status <> 'cancelled_by_organizer' THEN
    RAISE EXCEPTION 'NOT_REBOOKABLE' USING ERRCODE = 'P0030';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE rebooked_from_booking_id = old.id)
     OR EXISTS (SELECT 1 FROM refunds WHERE booking_id = old.id AND status <> 'failed') THEN
    RAISE EXCEPTION 'NOT_REBOOKABLE: already resolved' USING ERRCODE = 'P0030';
  END IF;
  -- the fee moves with the booking (v0.4 C10): no captured payment, nothing to move, no free seat
  IF app.captured_payment_for(old.id) IS NULL THEN
    RAISE EXCEPTION 'NOT_REBOOKABLE: not paid' USING ERRCODE = 'P0030';
  END IF;
  SELECT * INTO s FROM event_sessions WHERE id = p_target_session;
  IF NOT FOUND OR s.status <> 'on_sale' OR now() > s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;
  IF s.conversation_language <> old.conversation_language THEN
    RAISE EXCEPTION 'LANGUAGE_CONFLICT' USING ERRCODE = 'P0031';
  END IF;
  UPDATE event_sessions SET seats_sold = seats_sold + old.seats
   WHERE id = p_target_session AND status = 'on_sale' AND seats_sold + old.seats <= max_seats;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010'; END IF;

  INSERT INTO bookings (booking_ref, user_id, session_id, conversation_language, budget_tier_id,
                        questionnaire_response_id, status, price_minor, cancellation_policy_version,
                        idempotency_key, rebooked_from_booking_id, seats, guest_name)
  VALUES (gen_booking_ref(), old.user_id, p_target_session, old.conversation_language, old.budget_tier_id,
          old.questionnaire_response_id, 'paid_awaiting_group', old.price_minor, old.cancellation_policy_version,
          'rebook-' || old.id, old.id, old.seats, old.guest_name)
  RETURNING * INTO nb;
  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_target_session AND seats_sold = max_seats;
  RETURN nb;
END $$;
REVOKE ALL ON FUNCTION app.rebook_booking(uuid, uuid, uuid) FROM PUBLIC;

-- no client role may run it (002 revokes by default; said again here so this file stands alone)
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION app.rebook_booking(uuid, uuid, uuid) FROM %I', r);
    END IF;
  END LOOP;
END $$;
