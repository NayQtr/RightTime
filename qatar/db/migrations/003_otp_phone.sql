-- =====================================================================================
-- 003_otp_phone.sql — otp:verify must create the user with the encrypted phone, but the
-- challenge only held its lookup hash. The ciphertext is kept on the challenge (P3) and is
-- purged with the challenge (RET-04, <= 24 h).
-- =====================================================================================
SET search_path = app, public;

ALTER TABLE otp_challenges ADD COLUMN phone_e164_enc bytea;

-- RET-04: OTP challenges older than 24 h are deleted (called by the API on each otp:request)
CREATE FUNCTION purge_otp_challenges() RETURNS integer LANGUAGE sql AS $$
  WITH d AS (DELETE FROM otp_challenges WHERE created_at < now() - interval '24 hours' RETURNING 1)
  SELECT count(*)::integer FROM d;
$$;
ALTER FUNCTION purge_otp_challenges() SET search_path = app, pg_temp;
REVOKE EXECUTE ON FUNCTION purge_otp_challenges() FROM PUBLIC;

-- A rebooked booking (v0.4 C10) carries no payment of its own: the fee stays on the original booking.
-- captured_payment_for() walks rebooked_from_booking_id back to the captured payment.
CREATE FUNCTION captured_payment_for(p_booking_id uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain(id, src, depth) AS (
    SELECT id, rebooked_from_booking_id, 0 FROM bookings WHERE id = p_booking_id
    UNION ALL
    SELECT b.id, b.rebooked_from_booking_id, c.depth + 1 FROM bookings b JOIN chain c ON b.id = c.src)
  SELECT p.id FROM payments p JOIN chain c ON c.id = p.booking_id
   WHERE p.status IN ('succeeded','partially_refunded') ORDER BY c.depth LIMIT 1;
$$;
ALTER FUNCTION captured_payment_for(uuid) SET search_path = app, pg_temp;
REVOKE EXECUTE ON FUNCTION captured_payment_for(uuid) FROM PUBLIC;

-- Chain-aware version of the automatic refund after the choice deadline (rebooked bookings included).
CREATE OR REPLACE FUNCTION refund_unresolved_organizer_cancels(p_cancelled_before timestamptz)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; n integer := 0; v_payment uuid; v_amount integer;
BEGIN
  FOR r IN SELECT b.id AS booking_id FROM bookings b
            WHERE b.status = 'cancelled_by_organizer' AND b.cancelled_at < p_cancelled_before
              AND NOT EXISTS (SELECT 1 FROM bookings c WHERE c.rebooked_from_booking_id = b.id)
              AND NOT EXISTS (SELECT 1 FROM refunds f WHERE f.booking_id = b.id AND f.status <> 'failed')
  LOOP
    v_payment := captured_payment_for(r.booking_id);
    CONTINUE WHEN v_payment IS NULL;
    SELECT amount_minor - COALESCE((SELECT sum(amount_minor) FROM refunds WHERE payment_id = v_payment AND status IN ('requested','processing','refunded')), 0)
      INTO v_amount FROM payments WHERE id = v_payment;
    CONTINUE WHEN v_amount <= 0;
    INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
    VALUES (v_payment, r.booking_id, v_amount, 'organizer_cancel', 'requested', 'auto-oc-' || r.booking_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
ALTER FUNCTION refund_unresolved_organizer_cancels(timestamptz) SET search_path = app, pg_temp;
