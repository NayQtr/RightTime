-- 015: name on the card vs the registered first name (identity check, line one against a man booking as a woman).
-- On a successful payment the API compares the two (lib/namematch.js). The card name is stored encrypted, always
-- (owner's decision of 4 Nov, for safety). A mismatch, or a member with no registered name, opens an identity review:
-- the booking stays paid but the venue, table code and tablemates are not shown to her until an admin approves.
-- A rejection is recorded as a safety case about her (category identity_mismatch): the booking is cancelled without a
-- refund, the account is suspended, and she can appeal under "Decisions about you"; an upheld appeal refunds the fee.
-- Needs 014 first. Re-running this file is safe.
SET search_path = app, pg_temp;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS cardholder_name_enc bytea;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS name_check varchar(12)
  CHECK (name_check IS NULL OR name_check IN ('match','mismatch','no_name','not_provided'));

CREATE TABLE IF NOT EXISTS identity_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL UNIQUE REFERENCES bookings(id),
  payment_id  uuid NOT NULL REFERENCES payments(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  result      varchar(12) NOT NULL CHECK (result IN ('mismatch','no_name')),
  status      varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by  uuid REFERENCES admin_users(id),
  decided_at  timestamptz,
  report_id   uuid REFERENCES safety_reports(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_review_decided CHECK (status = 'pending' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS identity_reviews_pending ON identity_reviews (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS identity_reviews_user_id_fk_idx ON identity_reviews (user_id);
CREATE INDEX IF NOT EXISTS identity_reviews_payment_id_fk_idx ON identity_reviews (payment_id);
CREATE INDEX IF NOT EXISTS identity_reviews_report_id_fk_idx ON identity_reviews (report_id);

-- a case the system raises (no member reported it)
ALTER TABLE safety_reports ALTER COLUMN reporter_user_id DROP NOT NULL;
ALTER TYPE report_category ADD VALUE IF NOT EXISTS 'identity_mismatch';

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
DO $$
DECLARE r text;
BEGIN
  ALTER TABLE app.identity_reviews ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS deny_all ON app.identity_reviews;
  CREATE POLICY deny_all ON app.identity_reviews AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON app.identity_reviews FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- an organiser cancellation is refunded automatically when the member does not choose; never for a rejected identity
CREATE OR REPLACE FUNCTION refund_unresolved_organizer_cancels(p_cancelled_before timestamptz)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; n integer := 0; v_payment uuid; v_amount integer;
BEGIN
  FOR r IN SELECT b.id AS booking_id FROM bookings b
            WHERE b.status = 'cancelled_by_organizer' AND b.cancelled_at < p_cancelled_before
              AND b.cancel_reason_code IS DISTINCT FROM 'identity_rejected'
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

-- account deletion (014) also removes the name on her cards
CREATE OR REPLACE FUNCTION app.finalize_account_deletions(grace interval DEFAULT interval '14 days') RETURNS integer
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO ids FROM (
    SELECT id FROM users WHERE status = 'deletion_requested' AND deletion_requested_at <= now() - grace FOR UPDATE
  ) due;
  IF cardinality(ids) = 0 THEN RETURN 0; END IF;

  DELETE FROM answers WHERE response_id IN (SELECT id FROM questionnaire_responses WHERE user_id = ANY (ids));
  DELETE FROM push_subscriptions WHERE user_id = ANY (ids);
  DELETE FROM notifications_outbox WHERE user_id = ANY (ids);
  UPDATE payments SET cardholder_name_enc = NULL WHERE user_id = ANY (ids);
  UPDATE refresh_tokens SET revoked_at = now() WHERE subject_id = ANY (ids) AND revoked_at IS NULL;

  UPDATE users
     SET display_name = NULL,
         phone_e164_enc = '\x'::bytea,
         phone_lookup_hash = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         status = 'deleted',
         deleted_at = now()
   WHERE id = ANY (ids);
  RETURN cardinality(ids);
END $$;
REVOKE ALL ON FUNCTION app.finalize_account_deletions(interval) FROM PUBLIC;

-- The API uses the check only once this file has run (it deploys before the database changes are applied).
INSERT INTO app_config (key, value, description) VALUES
  ('CARD_NAME_CHECK', 'true', 'Compare the name on the card with the registered first name; hold the venue for review on a mismatch (015)')
ON CONFLICT (key) DO NOTHING;
