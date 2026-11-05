-- 016: the venue portal (owner's design of 5 Nov). A partner restaurant signs in at /venue with an email the admins
-- registered for it and a one-time code, sees the hosting requests HerZone sends it, accepts or declines them, and on
-- the day sees its tables (code, number of women, first names from 3 hours before) and marks arrivals.
--
-- Requests: when a session is created the admins plan one or more contracted venues for it (session_venues). Three days
-- before the session the venue is notified (venue_outbox, sent by WhatsApp once connected; until then the coordinator
-- copies it from the admin console). No answer within 2 hours: a reminder. Still none 2 hours later, or a decline: an
-- alert for the coordinator, who moves the booking to another contracted venue. Members pay in any case.
-- Matching uses only the venues that confirmed, when a session has planned venues (sessions without any keep the old
-- behaviour: every active venue).
-- Re-running this file is safe.
SET search_path = app, pg_temp;

CREATE TABLE IF NOT EXISTS app.venue_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES app.venues(id) ON DELETE CASCADE,
  email         varchar(254) NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status        varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_by    uuid REFERENCES app.admin_users(id),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_users_venue_id_fk_idx ON app.venue_users (venue_id);
CREATE INDEX IF NOT EXISTS venue_users_created_by_fk_idx ON app.venue_users (created_by);

CREATE TABLE IF NOT EXISTS app.venue_login_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_user_id uuid REFERENCES app.venue_users(id) ON DELETE CASCADE,   -- NULL: an unknown email (same answer, nothing sent)
  email_hash    char(64) NOT NULL,
  code_hash     varchar(64),
  expires_at    timestamptz NOT NULL,
  attempts      smallint NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  ip_trunc      inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_login_codes_email ON app.venue_login_codes (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS venue_login_codes_ip ON app.venue_login_codes (ip_trunc, created_at DESC);
CREATE INDEX IF NOT EXISTS venue_login_codes_user_fk_idx ON app.venue_login_codes (venue_user_id);

CREATE TABLE IF NOT EXISTS app.venue_portal_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_user_id uuid NOT NULL REFERENCES app.venue_users(id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_portal_sessions_user_fk_idx ON app.venue_portal_sessions (venue_user_id);

CREATE TABLE IF NOT EXISTS app.session_venues (
  session_id     uuid NOT NULL REFERENCES app.event_sessions(id) ON DELETE CASCADE,
  venue_id       uuid NOT NULL REFERENCES app.venues(id),
  planned_guests smallint NOT NULL CHECK (planned_guests BETWEEN 4 AND 120),
  status         varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined','withdrawn')),
  notified_at    timestamptz,     -- the request went out (3 days before the session)
  reminded_at    timestamptz,     -- no answer after 2 hours: reminder
  escalated_at   timestamptz,     -- still no answer 2 hours later: coordinator alerted
  decided_at     timestamptz,
  decided_by     uuid REFERENCES app.venue_users(id),
  decline_reason varchar(300),
  created_by     uuid REFERENCES app.admin_users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, venue_id)
);
CREATE INDEX IF NOT EXISTS session_venues_venue ON app.session_venues (venue_id, status);
CREATE INDEX IF NOT EXISTS session_venues_decided_by_fk_idx ON app.session_venues (decided_by);
CREATE INDEX IF NOT EXISTS session_venues_created_by_fk_idx ON app.session_venues (created_by);

-- Messages for venues and the coordinator. The API turns kind + the session into the text; a WhatsApp sender (later)
-- sends 'queued' rows; until then the coordinator copies them from the admin console and marks them sent.
CREATE TABLE IF NOT EXISTS app.venue_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES app.event_sessions(id) ON DELETE CASCADE,
  venue_id    uuid NOT NULL REFERENCES app.venues(id),
  kind        varchar(20) NOT NULL CHECK (kind IN ('request','reminder','coordinator_overdue','coordinator_declined')),
  status      varchar(10) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','cancelled')),
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_outbox_queued ON app.venue_outbox (created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS venue_outbox_session_fk_idx ON app.venue_outbox (session_id);
CREATE INDEX IF NOT EXISTS venue_outbox_venue_fk_idx ON app.venue_outbox (venue_id);

-- arrivals marked by the venue (the member's own "I'm here" leaves it NULL)
ALTER TABLE app.bookings ADD COLUMN IF NOT EXISTS checked_in_by_venue_user uuid REFERENCES app.venue_users(id);
CREATE INDEX IF NOT EXISTS bookings_checked_in_by_venue_user_fk_idx ON app.bookings (checked_in_by_venue_user);

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['venue_users','venue_login_codes','venue_portal_sessions','session_venues','venue_outbox'] LOOP
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

-- The request clock: request 3 days before, reminder after 2 hours, coordinator alert 2 hours after that.
-- Runs every 5 minutes (pg_cron) and whenever the admin or venue lists are opened. Returns how many steps it took.
CREATE OR REPLACE FUNCTION app.venue_requests_tick() RETURNS integer
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE n integer := 0; k integer;
BEGIN
  WITH due AS (
    UPDATE session_venues sv SET notified_at = now(), updated_at = now()
      FROM event_sessions s
     WHERE s.id = sv.session_id AND sv.status = 'pending' AND sv.notified_at IS NULL
       AND s.status NOT IN ('cancelled','completed') AND s.starts_at > now() AND now() >= s.starts_at - interval '3 days'
    RETURNING sv.session_id, sv.venue_id)
  INSERT INTO venue_outbox (session_id, venue_id, kind) SELECT session_id, venue_id, 'request' FROM due;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  WITH due AS (
    UPDATE session_venues sv SET reminded_at = now(), updated_at = now()
     WHERE sv.status = 'pending' AND sv.reminded_at IS NULL AND sv.notified_at <= now() - interval '2 hours'
    RETURNING sv.session_id, sv.venue_id)
  INSERT INTO venue_outbox (session_id, venue_id, kind) SELECT session_id, venue_id, 'reminder' FROM due;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  WITH due AS (
    UPDATE session_venues sv SET escalated_at = now(), updated_at = now()
     WHERE sv.status = 'pending' AND sv.escalated_at IS NULL AND sv.reminded_at <= now() - interval '2 hours'
    RETURNING sv.session_id, sv.venue_id)
  INSERT INTO venue_outbox (session_id, venue_id, kind) SELECT session_id, venue_id, 'coordinator_overdue' FROM due;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION app.venue_requests_tick() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $q$SELECT cron.schedule('app_venue_requests_tick', '*/5 * * * *', $j$SELECT app.venue_requests_tick()$j$)$q$;
  END IF;
END $$;

-- Matching: a session with planned venues uses only those that confirmed, up to the tables their guest count needs
-- (tables seat 4 to 6, so at most planned_guests / 4). A session without planned venues keeps every active venue.
CREATE OR REPLACE FUNCTION app.matching_input(p_session uuid) RETURNS json LANGUAGE sql STABLE
SET search_path = app, pg_temp AS $$
  SELECT json_build_object(
    'session_id', s.id,
    'questionnaire_version_id', (SELECT id FROM questionnaire_versions WHERE status = 'published'),
    'questionnaire', COALESCE((
      SELECT json_object_agg(x.key, x.opts) FROM (
        SELECT q.key, json_agg(o.key ORDER BY o.key) AS opts
          FROM questions q JOIN question_options o ON o.question_id = q.id
         WHERE q.questionnaire_version_id = (SELECT id FROM questionnaire_versions WHERE status = 'published')
         GROUP BY q.key) x), '{}'::json),
    'bookings', COALESCE((
      SELECT json_agg(json_build_object(
        'booking_id', b.id, 'user_id', b.user_id, 'session_id', b.session_id, 'status', b.status,
        'conversation_language', b.conversation_language, 'budget_tier_rank', bt.rank,
        'q05_topics', (SELECT json_agg(o.key ORDER BY o.key) FROM answers a
                         JOIN questions q ON q.id = a.question_id AND q.key = 'Q05'
                         JOIN question_options o ON o.id = a.option_id
                        WHERE a.response_id = b.questionnaire_response_id),
        'answers', (SELECT json_object_agg(x.key, x.opts) FROM (
                      SELECT q.key, json_agg(o.key ORDER BY o.key) AS opts FROM answers a
                        JOIN questions q ON q.id = a.question_id
                        JOIN question_options o ON o.id = a.option_id
                       WHERE a.response_id = b.questionnaire_response_id
                       GROUP BY q.key) x),
        'consents_current', (SELECT count(*) = 3 FROM current_consents c
                              WHERE c.user_id = b.user_id AND c.granted
                                AND c.consent_type IN ('terms','conduct','privacy_notice')),
        'age_attested', u.age_eligibility_confirmed_at IS NOT NULL,
        'account_active', u.status = 'active') ORDER BY b.id)
      FROM bookings b JOIN users u ON u.id = b.user_id JOIN budget_tiers bt ON bt.id = b.budget_tier_id
      WHERE b.session_id = s.id AND b.status = 'paid_awaiting_group'), '[]'::json),
    'blocks', COALESCE((SELECT json_agg(json_build_array(ub.blocker_user_id, ub.blocked_user_id))
                          FROM user_blocks ub), '[]'::json),
    'venues', COALESCE((SELECT json_agg(json_build_object('venue_id', v.id, 'tier_rank', bt.rank,
                                 'capacity', LEAST(v.seats_per_table_max, 6),
                                 'tables_available', CASE WHEN sv.venue_id IS NULL THEN v.total_bookable_tables
                                                          ELSE LEAST(v.total_bookable_tables, GREATEST(1, sv.planned_guests / 4)) END)
                                 ORDER BY v.id)
                          FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id
                          LEFT JOIN session_venues sv ON sv.session_id = s.id AND sv.venue_id = v.id
                         WHERE v.city_id = s.city_id AND v.is_active AND s.experience = ANY (v.supported_experiences)
                           AND (NOT EXISTS (SELECT 1 FROM session_venues x WHERE x.session_id = s.id)
                                OR sv.status = 'confirmed')),
                       '[]'::json))
  FROM event_sessions s WHERE s.id = p_session;
$$;
ALTER FUNCTION app.matching_input(uuid) SET search_path = app, pg_temp;
