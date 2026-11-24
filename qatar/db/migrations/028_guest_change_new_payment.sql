-- 028: a changed total needs a new payment (developer backlog item 6, before a real payment provider).
--   set_booking_guest (026) rewrote the amount of the booking's unpaid payment in place when the companion was added or
--   removed. A real provider's payment intent carries a fixed amount: the hosted page she had already opened would still
--   charge the old total, which the webhook then refunds (services/payments.js, payment_total_mismatch). Now a change of
--   the total CANCELS the booking's unpaid payments ('created', 'failed'), and the API creates a new payment, with a new
--   intent, for the new total in the same transaction (routes/user.js setGuest). A rename of the companion changes no
--   amount and touches no payment. The function is otherwise the one of 026.
-- Every name is schema-qualified; re-running this file is safe (CREATE OR REPLACE, same signature).
SET search_path = app, pg_temp;

CREATE OR REPLACE FUNCTION app.set_booking_guest(p_booking_id uuid, p_user_id uuid, p_guest_name text)
RETURNS app.bookings LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE b bookings; v_unit integer; v_old_total integer; v_seats smallint := CASE WHEN p_guest_name IS NULL THEN 1 ELSE 2 END;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'payment_pending' OR b.hold_expires_at IS NULL OR b.hold_expires_at <= now() THEN
    RAISE EXCEPTION 'GUEST_NOT_CHANGEABLE' USING ERRCODE = 'P0014';
  END IF;
  v_unit := b.price_minor / b.seats;
  v_old_total := b.price_minor;
  IF v_seats > b.seats THEN
    UPDATE event_sessions SET seats_sold = seats_sold + 1
     WHERE id = b.session_id AND status = 'on_sale' AND seats_sold < max_seats;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ENOUGH_SEATS' USING ERRCODE = 'P0013'; END IF;
    UPDATE event_sessions SET status = 'sold_out' WHERE id = b.session_id AND status = 'on_sale' AND seats_sold = max_seats;
  ELSIF v_seats < b.seats THEN
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = b.session_id;
  END IF;
  UPDATE bookings SET seats = v_seats, guest_name = p_guest_name, price_minor = v_unit * v_seats WHERE id = b.id RETURNING * INTO b;
  -- a payment for another total is never paid: the API creates the new one (a provider's intent has a fixed amount)
  IF b.price_minor <> v_old_total THEN
    UPDATE payments SET status = 'cancelled' WHERE booking_id = b.id AND status IN ('created','failed');
  END IF;
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION app.set_booking_guest(uuid, uuid, text) FROM PUBLIC;

-- no client role may run it (002 revokes by default; said again here so this file stands alone)
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION app.set_booking_guest(uuid, uuid, text) FROM %I', r);
    END IF;
  END LOOP;
END $$;
