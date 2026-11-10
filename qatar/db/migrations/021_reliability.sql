-- 021: reliability (provisional, owner's request of 10 Nov: build the recommended option, the owner reviews it later).
--   1. Waitlist offers (Notion fix 3): when a seat frees up in a session with a waitlist, the first member waiting gets the
--      seat held for her for WAITLIST_OFFER_HOURS (app_config, provisional 2 hours, never past the booking close), with a
--      WAITLIST_OFFER notification; she books and pays inside that time. Not taken in time: the seat passes to the next
--      member (release_expired_holds, which pg_cron already runs every minute and the API runs on the session and booking
--      paths). The kept seat counts in seats_sold, so nobody else can take it meanwhile.
--   2. Phone notification retries (Notion fix 6): attempts and the last error per notification; the API's dispatcher tries
--      a failed delivery again at most 3 times with growing gaps, then marks it failed, and the admin console lists failed
--      ones for coordinators (handled_at / handled_by once she was reached another way).
--   3. Booking status guard (Notion fix 15): a booking moves only along the status model of v0.3 §1.0.1. Leaving a final
--      status (cancelled, expired, payment failed, completed) used to be possible in the database and did not take the
--      seat back, so the session could be oversold.
--   4. Step counter (item 44 / plan U2): counts of "reached step X" per day, step and platform only, no user, IP, cookie
--      or device. Off (FUNNEL_COUNTER_ENABLED = false) until the privacy notice has a line for it.
-- Re-running this file is safe.
SET search_path = app, pg_temp;

INSERT INTO app.app_config (key, value, description) VALUES
  ('WAITLIST_OFFER_HOURS', '2', 'Provisional (owner, 10 Nov): hours a freed seat is held for the first member on the waitlist before it passes to the next (never past the booking close)'),
  ('FUNNEL_COUNTER_ENABLED', 'false', 'Provisional (item 44): anonymous step counter (day, step, platform only). Keep false until the privacy notice has a line for it; the env var of the same name overrides this')
ON CONFLICT (key) DO NOTHING;

-- ================================================================ 1. waitlist offers
-- Offers free seats of one session to the members waiting, first come first served, while seats are free, the session is
-- on sale and booking is open. Each offer keeps the seat (seats_sold + 1) and queues WAITLIST_OFFER in her language
-- ({window}: minutes left, rendered by the API). Skips accounts that are not active and members already booked on it.
CREATE OR REPLACE FUNCTION app.waitlist_offer_seats(p_session uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE s event_sessions; w record; n integer := 0; v_hours numeric; v_until timestamptz;
BEGIN
  SELECT value::numeric INTO v_hours FROM app_config WHERE key = 'WAITLIST_OFFER_HOURS' AND value ~ '^[0-9]+(\.[0-9]+)?$';
  v_hours := COALESCE(NULLIF(v_hours, 0), 2);
  LOOP
    SELECT * INTO s FROM event_sessions WHERE id = p_session FOR UPDATE;
    EXIT WHEN NOT FOUND OR s.status NOT IN ('on_sale','sold_out') OR s.seats_sold >= s.max_seats
           OR now() NOT BETWEEN s.booking_opens_at AND s.booking_closes_at;
    SELECT e.id, e.user_id, u.locale INTO w
      FROM waitlist_entries e JOIN users u ON u.id = e.user_id
     WHERE e.session_id = p_session AND e.status = 'waiting' AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = e.user_id AND b.session_id = p_session
                         AND b.status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed'))
     ORDER BY e.position, e.created_at
     LIMIT 1 FOR UPDATE OF e SKIP LOCKED;
    EXIT WHEN NOT FOUND;
    v_until := LEAST(now() + make_interval(mins => round(v_hours * 60)::int), s.booking_closes_at);
    UPDATE waitlist_entries SET status = 'offered', offer_expires_at = v_until WHERE id = w.id;
    UPDATE event_sessions SET seats_sold = seats_sold + 1,
           status = CASE WHEN status = 'on_sale' AND seats_sold + 1 >= max_seats THEN 'sold_out'::session_status ELSE status END
     WHERE id = p_session;
    INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
    VALUES (w.user_id, 'push', 'WAITLIST_OFFER', w.locale,
            jsonb_build_object('session_id', p_session, 'date', s.starts_at, 'offer_expires_at', v_until,
                               'window', ceil(extract(epoch FROM v_until - now()) / 60)::int));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION app.waitlist_offer_seats(uuid) FROM PUBLIC;

-- Every path that frees a seat lowers seats_sold (cancellation trigger, expired holds, expired offers) or an admin raises
-- max_seats: the waitlist is offered the seat in the same transaction.
CREATE OR REPLACE FUNCTION app.offer_freed_seats() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  PERFORM app.waitlist_offer_seats(NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS event_sessions_offer_freed_seats ON app.event_sessions;
CREATE TRIGGER event_sessions_offer_freed_seats AFTER UPDATE OF seats_sold, max_seats ON app.event_sessions
  FOR EACH ROW WHEN (NEW.seats_sold < NEW.max_seats AND (NEW.seats_sold < OLD.seats_sold OR NEW.max_seats > OLD.max_seats))
  EXECUTE FUNCTION app.offer_freed_seats();

-- Atomic seat hold (001), plus: a member holding a live waitlist offer takes the seat kept for her (the session may show
-- as sold out because of it). Her hold runs to the end of the offer (at least the normal payment minutes).
CREATE OR REPLACE FUNCTION hold_seat(p_user_id uuid, p_session_id uuid, p_budget_tier_id uuid, p_response_id uuid,
                          p_alternates uuid[] DEFAULT '{}', p_idempotency_key varchar DEFAULT NULL,
                          p_hold_minutes integer DEFAULT 10)
RETURNS bookings LANGUAGE plpgsql AS $$
DECLARE s event_sessions; b bookings; v_price integer; v_policy varchar; w waitlist_entries; v_offer boolean;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO b FROM bookings WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN b; END IF;
  END IF;

  SELECT * INTO w FROM waitlist_entries WHERE user_id = p_user_id AND session_id = p_session_id
     AND status = 'offered' AND offer_expires_at > now() FOR UPDATE;
  v_offer := FOUND;

  SELECT * INTO s FROM event_sessions WHERE id = p_session_id;
  IF NOT FOUND OR NOT (s.status = 'on_sale' OR (v_offer AND s.status = 'sold_out'))
     OR now() NOT BETWEEN s.booking_opens_at AND s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings WHERE user_id = p_user_id AND session_id = p_session_id
             AND status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed')) THEN
    RAISE EXCEPTION 'ALREADY_BOOKED' USING ERRCODE = 'P0012';
  END IF;

  IF v_offer THEN
    -- the seat was counted in seats_sold when it was offered
    UPDATE waitlist_entries SET status = 'accepted' WHERE id = w.id;
  ELSE
    UPDATE event_sessions SET seats_sold = seats_sold + 1
     WHERE id = p_session_id AND status = 'on_sale' AND seats_sold < max_seats;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010';
    END IF;
  END IF;

  SELECT pp.service_fee_minor, cp.version INTO v_price, v_policy
    FROM price_plans pp, cancellation_policies cp
   WHERE pp.id = s.price_plan_id AND cp.id = s.cancellation_policy_id;

  INSERT INTO bookings (booking_ref, user_id, session_id, alternate_session_ids, conversation_language,
                        budget_tier_id, questionnaire_response_id, status, hold_expires_at, price_minor,
                        cancellation_policy_version, idempotency_key)
  VALUES (gen_booking_ref(), p_user_id, p_session_id, COALESCE(p_alternates,'{}'), s.conversation_language,
          p_budget_tier_id, p_response_id, 'payment_pending',
          CASE WHEN v_offer THEN GREATEST(w.offer_expires_at, now() + make_interval(mins => p_hold_minutes))
               ELSE now() + make_interval(mins => p_hold_minutes) END,
          v_price, v_policy, p_idempotency_key)
  RETURNING * INTO b;

  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_session_id AND seats_sold = max_seats;
  RETURN b;
END $$;
ALTER FUNCTION hold_seat(uuid, uuid, uuid, uuid, uuid[], varchar, integer) SET search_path = app, pg_temp;

-- Releases expired holds (001), plus waitlist offers not taken in time: each gives its seat back, which offers it to the
-- next member waiting (trigger above). Returns holds and offers released.
CREATE OR REPLACE FUNCTION release_expired_holds() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id, session_id FROM bookings
           WHERE status = 'payment_pending' AND hold_expires_at < now()
           FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = r.id;
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = r.session_id;
    n := n + 1;
  END LOOP;
  FOR r IN SELECT id, session_id FROM waitlist_entries
           WHERE status = 'offered' AND offer_expires_at < now()
           FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE waitlist_entries SET status = 'expired' WHERE id = r.id;
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = r.session_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
ALTER FUNCTION release_expired_holds() SET search_path = app, pg_temp;

CREATE INDEX IF NOT EXISTS waitlist_offer_expiry ON app.waitlist_entries (offer_expires_at) WHERE status = 'offered';
CREATE INDEX IF NOT EXISTS waitlist_entries_user_id_fk_idx ON app.waitlist_entries (user_id);

-- ================================================================ 2. phone notification retries
ALTER TABLE app.notifications_outbox ADD COLUMN IF NOT EXISTS attempts smallint NOT NULL DEFAULT 0;     -- delivery tries made
ALTER TABLE app.notifications_outbox ADD COLUMN IF NOT EXISTS last_error varchar(200);                -- the push service's last answer
ALTER TABLE app.notifications_outbox ADD COLUMN IF NOT EXISTS handled_at timestamptz;                 -- failed: a coordinator reached her
ALTER TABLE app.notifications_outbox ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES app.admin_users(id);
CREATE INDEX IF NOT EXISTS notifications_outbox_handled_by_fk_idx ON app.notifications_outbox (handled_by);
CREATE INDEX IF NOT EXISTS outbox_failed_open ON app.notifications_outbox (created_at) WHERE status = 'failed' AND handled_at IS NULL;

-- ================================================================ 3. booking status guard
-- The allowed moves of v0.3 §1.0.1 (plus check-in and no-show completion straight from group_locked, as the API does).
-- Final statuses never change. Keeping a status is always allowed.
CREATE OR REPLACE FUNCTION app.booking_transition_allowed(p_from app.booking_status, p_to app.booking_status) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = app, pg_temp AS $$
  SELECT p_from = p_to OR (p_from::text || '>' || p_to::text) = ANY (ARRAY[
    'payment_pending>paid_awaiting_group', 'payment_pending>expired', 'payment_pending>payment_failed',
    'payment_pending>cancelled_by_user', 'payment_pending>cancelled_by_organizer',
    'paid_awaiting_group>group_locked', 'paid_awaiting_group>waitlisted',
    'paid_awaiting_group>cancelled_by_user', 'paid_awaiting_group>cancelled_by_organizer',
    'waitlisted>paid_awaiting_group', 'waitlisted>group_locked', 'waitlisted>cancelled_by_user', 'waitlisted>cancelled_by_organizer',
    'group_locked>revealed', 'group_locked>checked_in', 'group_locked>completed',
    'group_locked>cancelled_by_user', 'group_locked>cancelled_by_organizer',
    'revealed>checked_in', 'revealed>completed', 'revealed>cancelled_by_user', 'revealed>cancelled_by_organizer',
    'checked_in>completed']);
$$;

CREATE OR REPLACE FUNCTION app.guard_booking_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  IF NOT app.booking_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_FORBIDDEN: % -> %', OLD.status, NEW.status USING ERRCODE = 'P0060';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_status_guard ON app.bookings;
CREATE TRIGGER bookings_status_guard BEFORE UPDATE OF status ON app.bookings
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION app.guard_booking_status();

-- ================================================================ 4. step counter
CREATE TABLE IF NOT EXISTS app.funnel_daily (
  day      date NOT NULL,                                  -- Asia/Qatar calendar day
  step     varchar(30) NOT NULL,
  platform varchar(10) NOT NULL CHECK (platform IN ('web','ios','android')),
  count    integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, step, platform)
);

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['funnel_daily'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_all ON app.%I', t);
    EXECUTE format('CREATE POLICY deny_all ON app.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)', t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON app.%I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;
