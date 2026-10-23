-- =====================================================================================
-- 001_init.sql — Qatar social-dining platform, initial schema (v0.4)
-- Source of truth: Qatar_Phase2_Completion_v0.3 §2 (data dictionary).
-- Target: PostgreSQL 15+ (gen_random_uuid() is built in since PG13).
-- Run inside a transaction:   psql -v ON_ERROR_STOP=1 -1 -f 001_init.sql
-- Business rules enforced here: table size 4–6, one conversation language per session,
-- no date of birth stored, append-only consent & audit ledgers, immutable published
-- questionnaires, atomic seat hold, refund total never exceeds the payment.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS app;
SET search_path = app, public;

-- ---------------------------------------------------------------- enums
CREATE TYPE user_status        AS ENUM ('active','suspended','banned','deletion_requested','deleted');
CREATE TYPE consent_type       AS ENUM ('terms','conduct','privacy_notice','marketing','contact_after_event','special_data');
CREATE TYPE client_source      AS ENUM ('app_web','app_ios','app_android','admin');
CREATE TYPE qv_status          AS ENUM ('draft','review','published','retired');
CREATE TYPE question_scope     AS ENUM ('profile','booking');
CREATE TYPE answer_type        AS ENUM ('single','multi','tier','contact_request');
CREATE TYPE matching_use       AS ENUM ('hard_constraint','soft_factor','event_prep','ops_only','none');
CREATE TYPE privacy_class      AS ENUM ('P0','P1','P2','P3','P4');
CREATE TYPE response_status    AS ENUM ('draft','submitted','superseded');
CREATE TYPE venue_type         AS ENUM ('cafe','restaurant');
CREATE TYPE experience_type    AS ENUM ('coffee','dinner');
CREATE TYPE contract_status    AS ENUM ('prospect','offer_received','signed','paused','terminated');
CREATE TYPE session_status     AS ENUM ('draft','on_sale','sold_out','locked','in_progress','completed','cancelled');
CREATE TYPE table_status       AS ENUM ('planned','forming','locked','cancelled_quorum','cancelled_venue','completed');
CREATE TYPE booking_status     AS ENUM ('payment_pending','paid_awaiting_group','group_locked','revealed','checked_in',
                                        'completed','waitlisted','cancelled_by_user','cancelled_by_organizer',
                                        'payment_failed','expired');
CREATE TYPE cancel_actor       AS ENUM ('user','organizer','system');
CREATE TYPE waitlist_status    AS ENUM ('waiting','offered','accepted','expired','left');
CREATE TYPE matching_mode      AS ENUM ('dry_run','published');
CREATE TYPE payment_status     AS ENUM ('created','requires_action','processing','succeeded','failed','cancelled',
                                        'expired','partially_refunded','refunded','disputed');
CREATE TYPE payment_failure    AS ENUM ('declined','insufficient_funds','3ds_failed','expired_card','timeout','other');
CREATE TYPE refund_status      AS ENUM ('requested','processing','refunded','failed');
CREATE TYPE refund_reason      AS ENUM ('user_cancel_in_window','organizer_cancel','seat_unavailable','duplicate_charge',
                                        'goodwill','dispute');
CREATE TYPE report_category    AS ENUM ('harassment','threat_violence','photo_without_consent','stalking_unwanted_contact',
                                        'fraud','disruptive');
CREATE TYPE report_timing      AS ENUM ('during','after');
CREATE TYPE report_status      AS ENUM ('new','triaged','investigating','actioned','closed_no_action','appealed','closed');
CREATE TYPE report_action_type AS ENUM ('interim_block','temporary_suspension','warning','suspension','ban','no_action',
                                        'referral_authorities','appeal_upheld','appeal_rejected');
CREATE TYPE block_source       AS ENUM ('user','safety_case');
CREATE TYPE admin_role         AS ENUM ('owner','ops','finance','trust_safety','analyst','researcher','developer');
CREATE TYPE admin_status       AS ENUM ('active','disabled');
CREATE TYPE notify_channel     AS ENUM ('push','sms','email','in_app');
CREATE TYPE notify_status      AS ENUM ('queued','sent','failed','cancelled');
CREATE TYPE support_case_type  AS ENUM ('practical_arrangement_Q07','payment','refund','general');
CREATE TYPE support_case_status AS ENUM ('new','in_progress','waiting_user','resolved','closed');
CREATE TYPE legal_doc_type     AS ENUM ('terms','conduct','privacy','marketing','cancellation');

-- ---------------------------------------------------------------- shared trigger: updated_at
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- append-only guard (consent ledger, audit log)
CREATE FUNCTION forbid_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY: % rows cannot be updated or deleted', TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$;

-- ================================================================ reference & admin
CREATE TABLE cities (
  id          varchar(10) PRIMARY KEY,
  name_ar     varchar(60) NOT NULL,
  name_en     varchar(60) NOT NULL,
  timezone    varchar(40) NOT NULL DEFAULT 'Asia/Qatar',
  is_active   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE legal_documents (
  version       varchar(20) PRIMARY KEY,
  type          legal_doc_type NOT NULL,
  text_ar       text NOT NULL,
  text_en       text NOT NULL,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(254) NOT NULL UNIQUE,
  name          varchar(80)  NOT NULL,
  role          admin_role   NOT NULL,
  mfa_enabled   boolean      NOT NULL DEFAULT false,
  status        admin_status NOT NULL DEFAULT 'active',
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_active_requires_mfa CHECK (status <> 'active' OR mfa_enabled)
);

-- ================================================================ identity & consent
CREATE TABLE users (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164_enc               bytea        NOT NULL,              -- AES-256-GCM ciphertext (app-side, KMS key)
  phone_lookup_hash            char(64)     NOT NULL UNIQUE,       -- HMAC-SHA256(phone, pepper), hex
  display_name                 varchar(30),
  locale                       varchar(2)   NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  age_eligibility_confirmed_at timestamptz,                        -- attestation only; NO date of birth column
  status                       user_status  NOT NULL DEFAULT 'active',
  registration_completed_at    timestamptz,
  last_login_at                timestamptz,
  deleted_at                   timestamptz,
  created_at                   timestamptz  NOT NULL DEFAULT now(),
  updated_at                   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT users_display_name_chars CHECK (display_name IS NULL OR display_name ~ '^[[:alpha:] \-]{1,30}$'),
  CONSTRAINT users_hash_hex CHECK (phone_lookup_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT users_registration_needs_age CHECK (registration_completed_at IS NULL OR age_eligibility_confirmed_at IS NOT NULL)
);

CREATE TABLE user_consents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  consent_type     consent_type NOT NULL,
  document_version varchar(20)  NOT NULL REFERENCES legal_documents(version),
  granted          boolean      NOT NULL,
  recorded_at      timestamptz  NOT NULL DEFAULT now(),
  source           client_source NOT NULL,
  ip_trunc         inet,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX user_consents_latest ON user_consents (user_id, consent_type, recorded_at DESC);
CREATE TRIGGER user_consents_append_only BEFORE UPDATE OR DELETE ON user_consents
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE VIEW current_consents AS
SELECT DISTINCT ON (user_id, consent_type) user_id, consent_type, document_version, granted, recorded_at
FROM user_consents ORDER BY user_id, consent_type, recorded_at DESC, created_at DESC;

CREATE TABLE otp_challenges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_lookup_hash char(64)    NOT NULL,
  code_hash         char(60)    NOT NULL,                  -- bcrypt
  attempts          smallint    NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  request_ip_trunc  inet,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_expiry_after_create CHECK (expires_at > created_at)
);
CREATE INDEX otp_by_phone_recent ON otp_challenges (phone_lookup_hash, created_at DESC);

-- ================================================================ questionnaire (versioned)
CREATE TABLE questionnaire_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(20) NOT NULL UNIQUE,
  status         qv_status   NOT NULL DEFAULT 'draft',
  published_at   timestamptz,
  retired_at     timestamptz,
  approved_by    uuid REFERENCES admin_users(id),
  change_log_ref varchar(50),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qv_published_needs_approval CHECK (status NOT IN ('published','retired') OR (approved_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT qv_retired_needs_ts CHECK (status <> 'retired' OR retired_at IS NOT NULL)
);
-- exactly one published version at a time
CREATE UNIQUE INDEX qv_one_published ON questionnaire_versions ((true)) WHERE status = 'published';

CREATE TABLE questions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_version_id uuid NOT NULL REFERENCES questionnaire_versions(id) ON DELETE CASCADE,
  key                      varchar(10)    NOT NULL CHECK (key ~ '^Q[0-9]{2}$'),
  scope                    question_scope NOT NULL,
  text_ar                  text NOT NULL,
  text_en                  text NOT NULL,
  purpose_ar               text NOT NULL,
  purpose_en               text NOT NULL,
  answer_type              answer_type    NOT NULL,
  max_selections           smallint CHECK (max_selections IS NULL OR max_selections >= 1),
  is_required              boolean NOT NULL DEFAULT false,
  matching_use             matching_use   NOT NULL,
  data_class               privacy_class  NOT NULL DEFAULT 'P2',
  sort_order               smallint NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (questionnaire_version_id, key),
  CONSTRAINT q07_is_restricted CHECK (key <> 'Q07' OR data_class = 'P4')
);

CREATE TABLE question_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  key          varchar(30)  NOT NULL,
  label_ar     varchar(120) NOT NULL,
  label_en     varchar(120) NOT NULL,
  is_exclusive boolean NOT NULL DEFAULT false,
  maps_to      jsonb,
  sort_order   smallint NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, key)
);

-- Published versions are immutable: only the transition published -> retired (+retired_at) is allowed,
-- and questions/options of a published or retired version cannot be inserted, changed or removed.
CREATE FUNCTION guard_published_questionnaire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('published','retired') THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_IMMUTABLE: version % is %', OLD.code, OLD.status USING ERRCODE = 'P0002';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('published','retired') THEN
    IF OLD.status = 'published' AND NEW.status = 'retired'
       AND NEW.code = OLD.code AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
       AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
       AND NEW.change_log_ref IS NOT DISTINCT FROM OLD.change_log_ref THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'QUESTIONNAIRE_IMMUTABLE: version % is %', OLD.code, OLD.status USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER qv_immutable BEFORE UPDATE OR DELETE ON questionnaire_versions
  FOR EACH ROW EXECUTE FUNCTION guard_published_questionnaire();

CREATE FUNCTION guard_question_children() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status qv_status; v_qid uuid;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    SELECT status INTO v_status FROM questionnaire_versions
     WHERE id = COALESCE(NEW.questionnaire_version_id, OLD.questionnaire_version_id);
  ELSE
    v_qid := COALESCE(NEW.question_id, OLD.question_id);
    SELECT qv.status INTO v_status FROM questions q JOIN questionnaire_versions qv ON qv.id = q.questionnaire_version_id
     WHERE q.id = v_qid;
  END IF;
  IF v_status IN ('published','retired') THEN
    RAISE EXCEPTION 'QUESTIONNAIRE_IMMUTABLE: % of a % version cannot change', TG_TABLE_NAME, v_status USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER questions_immutable BEFORE INSERT OR UPDATE OR DELETE ON questions
  FOR EACH ROW EXECUTE FUNCTION guard_question_children();
CREATE TRIGGER question_options_immutable BEFORE INSERT OR UPDATE OR DELETE ON question_options
  FOR EACH ROW EXECUTE FUNCTION guard_question_children();

CREATE TABLE questionnaire_responses (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id),
  questionnaire_version_id uuid NOT NULL REFERENCES questionnaire_versions(id),
  status                   response_status NOT NULL DEFAULT 'draft',
  submitted_at             timestamptz,
  completeness_required    smallint NOT NULL DEFAULT 0 CHECK (completeness_required >= 0),
  completeness_optional    smallint NOT NULL DEFAULT 0 CHECK (completeness_optional >= 0),
  idempotency_key          varchar(64),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_submitted_ts CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);
CREATE UNIQUE INDEX qr_one_submitted_per_user ON questionnaire_responses (user_id) WHERE status = 'submitted';
CREATE UNIQUE INDEX qr_one_draft_per_version  ON questionnaire_responses (user_id, questionnaire_version_id) WHERE status = 'draft';
CREATE UNIQUE INDEX qr_idempotency            ON questionnaire_responses (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE answers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES questionnaire_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  option_id   uuid NOT NULL REFERENCES question_options(id),
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id, option_id)
);
-- option must belong to the question it answers
CREATE FUNCTION check_answer_option() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM question_options WHERE id = NEW.option_id AND question_id = NEW.question_id) THEN
    RAISE EXCEPTION 'OPTION_NOT_IN_QUESTION' USING ERRCODE = 'P0003';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answers_option_matches BEFORE INSERT OR UPDATE ON answers
  FOR EACH ROW EXECUTE FUNCTION check_answer_option();

-- ================================================================ venues, pricing, policy
CREATE TABLE budget_tiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id         varchar(10) NOT NULL REFERENCES cities(id),
  rank            smallint    NOT NULL CHECK (rank >= 1),
  max_spend_minor integer     CHECK (max_spend_minor IS NULL OR max_spend_minor > 0),  -- NULL = open
  label_ar        varchar(60) NOT NULL,
  label_en        varchar(60) NOT NULL,
  status          varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, rank)
);

CREATE TABLE venues (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id                   varchar(10) NOT NULL REFERENCES cities(id),
  name                      varchar(120) NOT NULL,
  district_ar               varchar(60) NOT NULL,
  district_en               varchar(60) NOT NULL,
  address_line              varchar(200) NOT NULL,
  lat                       numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                       numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  google_place_id           varchar(100),
  venue_type                venue_type NOT NULL,
  supported_experiences     experience_type[] NOT NULL CHECK (cardinality(supported_experiences) >= 1),
  total_bookable_tables     smallint NOT NULL CHECK (total_bookable_tables >= 1),
  seats_per_table_max       smallint NOT NULL CHECK (seats_per_table_max >= 6),
  price_band_min_minor      integer  NOT NULL CHECK (price_band_min_minor >= 0),
  price_band_max_minor      integer  NOT NULL,
  budget_tier_id            uuid NOT NULL REFERENCES budget_tiers(id),
  noise_level               smallint NOT NULL CHECK (noise_level BETWEEN 1 AND 3),
  accessibility             jsonb NOT NULL DEFAULT '{}'::jsonb,
  separate_bills_confirmed  boolean NOT NULL DEFAULT false,
  min_spend_policy          varchar(200) NOT NULL,
  arrival_instructions_ar   text NOT NULL,
  arrival_instructions_en   text NOT NULL,
  contract_status           contract_status NOT NULL DEFAULT 'prospect',
  contract_expires_on       date,
  is_active                 boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_price_band CHECK (price_band_max_minor >= price_band_min_minor),
  -- a venue can only be signed (and therefore assigned) with separate bills and written min-spend terms (F06, A06)
  CONSTRAINT venue_signed_requirements CHECK (contract_status <> 'signed' OR (separate_bills_confirmed AND length(trim(min_spend_policy)) > 0)),
  CONSTRAINT venue_active_requires_signed CHECK (NOT is_active OR contract_status = 'signed')
);
CREATE INDEX venues_assignable ON venues (city_id, budget_tier_id) WHERE is_active;

CREATE TABLE venue_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name              varchar(80) NOT NULL,
  phone_e164_enc    bytea NOT NULL,
  role              varchar(40),
  is_day_of_contact boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id           varchar(10) NOT NULL REFERENCES cities(id),
  experience        experience_type NOT NULL,
  service_fee_minor integer NOT NULL CHECK (service_fee_minor > 0),
  currency          char(3) NOT NULL DEFAULT 'QAR' CHECK (currency = 'QAR'),
  valid_from        timestamptz NOT NULL,
  valid_to          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_window CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE cancellation_policies (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                     varchar(20) NOT NULL UNIQUE,
  full_refund_until_hours     smallint NOT NULL CHECK (full_refund_until_hours BETWEEN 0 AND 720),
  late_cancel_refund_pct      smallint NOT NULL CHECK (late_cancel_refund_pct BETWEEN 0 AND 100),
  organizer_cancel_refund_pct smallint NOT NULL DEFAULT 100 CHECK (organizer_cancel_refund_pct = 100),
  no_show_fee_pct             smallint NOT NULL DEFAULT 0 CHECK (no_show_fee_pct = 0),   -- non-punitive by design (v0.3, F11)
  text_ar                     text NOT NULL,
  text_en                     text NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ================================================================ sessions, tables, bookings
CREATE TABLE event_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id                varchar(10) NOT NULL REFERENCES cities(id),
  experience             experience_type NOT NULL,
  conversation_language  char(2) NOT NULL CHECK (conversation_language IN ('ar','en')),   -- one language per session (F04)
  starts_at              timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL,
  district_hint_ar       varchar(60) NOT NULL,
  district_hint_en       varchar(60) NOT NULL,
  price_plan_id          uuid NOT NULL REFERENCES price_plans(id),
  cancellation_policy_id uuid NOT NULL REFERENCES cancellation_policies(id),
  max_seats              smallint NOT NULL CHECK (max_seats >= 4),
  seats_sold             smallint NOT NULL DEFAULT 0,
  booking_opens_at       timestamptz NOT NULL,
  booking_closes_at      timestamptz NOT NULL,
  lock_at                timestamptz NOT NULL,
  reveal_at              timestamptz NOT NULL,
  check_in_opens_at      timestamptz NOT NULL,
  status                 session_status NOT NULL DEFAULT 'draft',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_seats CHECK (seats_sold BETWEEN 0 AND max_seats),
  CONSTRAINT session_window CHECK (ends_at > starts_at AND booking_opens_at < booking_closes_at
                                   AND booking_closes_at <= starts_at AND lock_at <= reveal_at
                                   AND reveal_at <= starts_at AND check_in_opens_at <= starts_at)
);
CREATE INDEX sessions_on_sale ON event_sessions (city_id, starts_at) WHERE status = 'on_sale';

CREATE TABLE event_tables (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  venue_id           uuid REFERENCES venues(id),
  table_code         varchar(10) NOT NULL,
  capacity           smallint NOT NULL DEFAULT 6 CHECK (capacity BETWEEN 4 AND 6),
  min_quorum         smallint NOT NULL DEFAULT 4 CHECK (min_quorum = 4),
  confirmed_count    smallint NOT NULL DEFAULT 0,
  status             table_status NOT NULL DEFAULT 'planned',
  venue_confirmed_at timestamptz,
  locked_at          timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      varchar(40) CHECK (cancel_reason IS NULL OR cancel_reason IN ('below_quorum','venue_unavailable','safety','force_majeure')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, table_code),
  CONSTRAINT table_count CHECK (confirmed_count BETWEEN 0 AND capacity),
  CONSTRAINT table_lock_quorum CHECK (status <> 'locked' OR (confirmed_count >= min_quorum AND venue_id IS NOT NULL AND locked_at IS NOT NULL)),
  CONSTRAINT table_cancel_reason CHECK (status NOT IN ('cancelled_quorum','cancelled_venue') OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
);

CREATE TABLE bookings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref                 varchar(12) NOT NULL UNIQUE CHECK (booking_ref ~ '^RT-[A-HJ-NP-Z2-9]{6}$'),
  user_id                     uuid NOT NULL REFERENCES users(id),      -- always from the JWT, never the request body
  session_id                  uuid NOT NULL REFERENCES event_sessions(id),
  alternate_session_ids       uuid[] NOT NULL DEFAULT '{}',
  conversation_language       char(2) NOT NULL CHECK (conversation_language IN ('ar','en')),
  budget_tier_id              uuid NOT NULL REFERENCES budget_tiers(id),
  questionnaire_response_id   uuid NOT NULL REFERENCES questionnaire_responses(id),
  status                      booking_status NOT NULL DEFAULT 'payment_pending',
  hold_expires_at             timestamptz,
  price_minor                 integer NOT NULL CHECK (price_minor > 0),
  currency                    char(3) NOT NULL DEFAULT 'QAR' CHECK (currency = 'QAR'),
  cancellation_policy_version varchar(20) NOT NULL REFERENCES cancellation_policies(version),
  cancelled_at                timestamptz,
  cancel_actor                cancel_actor,
  cancel_reason_code          varchar(30),
  checked_in_at               timestamptz,
  no_show                     boolean,
  idempotency_key             varchar(64),
  rebooked_from_booking_id    uuid UNIQUE REFERENCES bookings(id),   -- v0.4 addition: SCR-08b "ننقل رسمك كما هو" fee transfer
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_hold CHECK (status <> 'payment_pending' OR hold_expires_at IS NOT NULL),
  CONSTRAINT booking_cancel_fields CHECK (status NOT IN ('cancelled_by_user','cancelled_by_organizer') OR (cancelled_at IS NOT NULL AND cancel_actor IS NOT NULL)),
  CONSTRAINT booking_alt_not_primary CHECK (NOT (session_id = ANY (alternate_session_ids)))
);
-- one active booking per user per session
CREATE UNIQUE INDEX bookings_one_active_per_session ON bookings (user_id, session_id)
  WHERE status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed');
CREATE UNIQUE INDEX bookings_idempotency ON bookings (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX bookings_session_status ON bookings (session_id, status);
CREATE INDEX bookings_hold_expiry ON bookings (hold_expires_at) WHERE status = 'payment_pending';

CREATE TABLE matching_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES event_sessions(id),
  mode                     matching_mode NOT NULL,
  rule_version             varchar(20) NOT NULL,
  questionnaire_version_id uuid NOT NULL REFERENCES questionnaire_versions(id),
  algorithm                varchar(20) NOT NULL CHECK (algorithm IN ('baseline_random','interest_opt_v1')),
  seed                     bigint NOT NULL,
  inputs_hash              char(64) NOT NULL,
  result_summary           jsonb NOT NULL,
  explanations             jsonb,
  run_by                   uuid REFERENCES admin_users(id),        -- NULL = system job
  published_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT run_published_ts CHECK (mode <> 'published' OR published_at IS NOT NULL)
);

CREATE TABLE table_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id),
  table_id        uuid NOT NULL REFERENCES event_tables(id),
  matching_run_id uuid NOT NULL REFERENCES matching_runs(id),
  is_current      boolean NOT NULL DEFAULT true,
  member_score    numeric(5,4) CHECK (member_score IS NULL OR member_score BETWEEN 0 AND 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assignments_one_current_per_booking ON table_assignments (booking_id) WHERE is_current;
CREATE INDEX assignments_by_table ON table_assignments (table_id) WHERE is_current;

CREATE TABLE waitlist_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  session_id       uuid NOT NULL REFERENCES event_sessions(id),
  position         integer NOT NULL CHECK (position >= 1),
  status           waitlist_status NOT NULL DEFAULT 'waiting',
  offer_expires_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_offer_ts CHECK (status <> 'offered' OR offer_expires_at IS NOT NULL)
);
CREATE UNIQUE INDEX waitlist_one_open ON waitlist_entries (user_id, session_id) WHERE status IN ('waiting','offered');

-- ================================================================ payments & refunds
CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL REFERENCES bookings(id),
  user_id               uuid NOT NULL REFERENCES users(id),
  psp                   varchar(30) NOT NULL,
  psp_payment_intent_id varchar(100) NOT NULL UNIQUE,
  amount_minor          integer NOT NULL CHECK (amount_minor > 0),
  currency              char(3) NOT NULL DEFAULT 'QAR' CHECK (currency = 'QAR'),
  status                payment_status NOT NULL DEFAULT 'created',
  failure_code          payment_failure,
  method_brand          varchar(20),
  card_last4            char(4) CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  idempotency_key       varchar(64) NOT NULL UNIQUE,
  succeeded_at          timestamptz,
  fee_minor             integer CHECK (fee_minor IS NULL OR fee_minor >= 0),
  reconciled_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_failed_code CHECK (status <> 'failed' OR failure_code IS NOT NULL),
  CONSTRAINT payment_success_ts CHECK (status NOT IN ('succeeded','partially_refunded','refunded') OR succeeded_at IS NOT NULL)
);
CREATE INDEX payments_by_booking ON payments (booking_id);
-- at most one successful (or later-refunded) payment per booking: duplicates must be refunded, never kept
CREATE UNIQUE INDEX payments_one_success_per_booking ON payments (booking_id)
  WHERE status IN ('succeeded','partially_refunded','refunded','disputed');

CREATE TABLE refunds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid NOT NULL REFERENCES payments(id),
  booking_id      uuid NOT NULL REFERENCES bookings(id),
  amount_minor    integer NOT NULL CHECK (amount_minor > 0),
  reason          refund_reason NOT NULL,
  status          refund_status NOT NULL DEFAULT 'requested',
  psp_refund_id   varchar(100) UNIQUE,
  initiated_by    uuid REFERENCES admin_users(id),     -- NULL = system policy refund
  approved_by     uuid REFERENCES admin_users(id),
  idempotency_key varchar(64) NOT NULL UNIQUE,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- maker-checker for discretionary refunds
  CONSTRAINT refund_manual_needs_checker CHECK (reason NOT IN ('goodwill','dispute') OR (initiated_by IS NOT NULL AND approved_by IS NOT NULL AND approved_by <> initiated_by)),
  CONSTRAINT refund_done_ts CHECK (status <> 'refunded' OR completed_at IS NOT NULL)
);
CREATE INDEX refunds_by_payment ON refunds (payment_id);

-- total of live refunds never exceeds the captured payment (R07)
CREATE FUNCTION check_refund_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_paid integer; v_refunded integer;
BEGIN
  SELECT amount_minor INTO v_paid FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT COALESCE(sum(amount_minor),0) INTO v_refunded FROM refunds
   WHERE payment_id = NEW.payment_id AND status IN ('requested','processing','refunded') AND id <> NEW.id;
  IF NEW.status IN ('requested','processing','refunded') AND v_refunded + NEW.amount_minor > v_paid THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAYMENT: % + % > %', v_refunded, NEW.amount_minor, v_paid USING ERRCODE = 'P0004';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refunds_total_guard BEFORE INSERT OR UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION check_refund_total();

CREATE TABLE payment_webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  psp              varchar(30) NOT NULL,
  psp_event_id     varchar(100) NOT NULL,
  event_type       varchar(60) NOT NULL,
  signature_valid  boolean NOT NULL,
  payload          jsonb NOT NULL,
  processed_at     timestamptz,
  processing_error text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (psp, psp_event_id)
);
CREATE INDEX webhooks_unprocessed ON payment_webhook_events (created_at) WHERE processed_at IS NULL;

-- ================================================================ feedback, connections, safety
CREATE TABLE event_feedback (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid NOT NULL UNIQUE REFERENCES bookings(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  table_id         uuid NOT NULL REFERENCES event_tables(id),
  venue_id         uuid NOT NULL REFERENCES venues(id),
  overall_rating   smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  comfort_rating   smallint NOT NULL CHECK (comfort_rating BETWEEN 1 AND 5),
  venue_rating     smallint CHECK (venue_rating BETWEEN 1 AND 5),
  would_book_again boolean,
  comment_private  varchar(500),
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE MATERIALIZED VIEW venue_scores AS
SELECT venue_id,
       count(*)                                   AS n,
       round(avg(venue_rating)::numeric, 2)        AS avg_venue_rating,
       round(avg(comfort_rating)::numeric, 2)      AS avg_comfort,
       count(*) FILTER (WHERE submitted_at > now() - interval '90 days') AS last_90d_n
FROM event_feedback GROUP BY venue_id;
CREATE UNIQUE INDEX venue_scores_pk ON venue_scores (venue_id);

CREATE TABLE connection_consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     uuid NOT NULL REFERENCES event_tables(id),
  from_user_id uuid NOT NULL REFERENCES users(id),
  to_user_id   uuid NOT NULL REFERENCES users(id),
  choice       boolean NOT NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, from_user_id, to_user_id),
  CONSTRAINT connection_not_self CHECK (from_user_id <> to_user_id)
);
CREATE VIEW mutual_connections AS
SELECT a.table_id, a.from_user_id AS user_a, a.to_user_id AS user_b
FROM connection_consents a JOIN connection_consents b
  ON b.table_id = a.table_id AND b.from_user_id = a.to_user_id AND b.to_user_id = a.from_user_id
WHERE a.choice AND b.choice AND a.from_user_id < a.to_user_id;

CREATE TABLE safety_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref         varchar(14) NOT NULL UNIQUE CHECK (case_ref ~ '^TS-[0-9]{4}-[0-9]{4}$'),
  reporter_user_id uuid NOT NULL REFERENCES users(id),
  reported_user_id uuid REFERENCES users(id),
  booking_id       uuid REFERENCES bookings(id),
  table_id         uuid REFERENCES event_tables(id),
  category         report_category NOT NULL,
  timing           report_timing   NOT NULL,
  immediate_danger boolean NOT NULL DEFAULT false,
  description_enc  bytea,                                   -- encrypted app-side (P4)
  severity         smallint CHECK (severity BETWEEN 1 AND 4),
  status           report_status NOT NULL DEFAULT 'new',
  assigned_to      uuid REFERENCES admin_users(id),
  sla_due_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_not_self CHECK (reported_user_id IS NULL OR reported_user_id <> reporter_user_id),
  CONSTRAINT report_danger_is_s1 CHECK (NOT immediate_danger OR severity IS NULL OR severity = 1)
);
CREATE SEQUENCE safety_case_seq;

CREATE TABLE report_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid NOT NULL REFERENCES safety_reports(id),
  action           report_action_type NOT NULL,
  actor_id         uuid REFERENCES admin_users(id),         -- NULL = automatic interim action
  second_approver  uuid REFERENCES admin_users(id),
  effective_from   timestamptz NOT NULL DEFAULT now(),
  effective_to     timestamptz,
  rationale_enc    bytea,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ban_needs_second_approver CHECK (action <> 'ban' OR (actor_id IS NOT NULL AND second_approver IS NOT NULL AND second_approver <> actor_id)),
  CONSTRAINT appeal_needs_reviewer CHECK (action NOT IN ('appeal_upheld','appeal_rejected') OR actor_id IS NOT NULL)
);

CREATE TABLE user_blocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id uuid NOT NULL REFERENCES users(id),
  blocked_user_id uuid NOT NULL REFERENCES users(id),
  source          block_source NOT NULL,
  report_id       uuid REFERENCES safety_reports(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_user_id, blocked_user_id),
  CONSTRAINT block_not_self CHECK (blocker_user_id <> blocked_user_id),
  CONSTRAINT block_case_link CHECK (source <> 'safety_case' OR report_id IS NOT NULL)
);
-- matching reads blocks as mutual
CREATE VIEW blocked_pairs AS
SELECT LEAST(blocker_user_id, blocked_user_id) AS user_a, GREATEST(blocker_user_id, blocked_user_id) AS user_b
FROM user_blocks GROUP BY 1, 2;

-- ================================================================ audit, notifications, support
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES admin_users(id),               -- NULL = system
  action      varchar(60) NOT NULL,                         -- e.g. 'read_p4', 'refund_create', 'table_cancel'
  entity      varchar(60) NOT NULL,
  entity_id   uuid,
  reason_code varchar(40),
  before_hash char(64),
  after_hash  char(64),
  ip_trunc    inet,
  at          timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p4_read_needs_reason CHECK (action <> 'read_p4' OR (actor_id IS NOT NULL AND reason_code IS NOT NULL))
);
CREATE INDEX audit_by_entity ON audit_logs (entity, entity_id, at DESC);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TABLE notifications_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  channel      notify_channel NOT NULL,
  template_key varchar(40) NOT NULL,
  locale       varchar(2) NOT NULL CHECK (locale IN ('ar','en')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  send_after   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  status       notify_status NOT NULL DEFAULT 'queued',
  provider_ref varchar(100),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_due ON notifications_outbox (send_after) WHERE status = 'queued';

CREATE TABLE support_cases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  booking_id   uuid REFERENCES bookings(id),
  type         support_case_type NOT NULL,
  status       support_case_status NOT NULL DEFAULT 'new',
  assigned_to  uuid REFERENCES admin_users(id),
  notes_enc    bytea,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ================================================================ updated_at triggers (every table with the column)
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
           WHERE c.table_schema = 'app' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
             AND c.table_name NOT IN ('user_consents','audit_logs')
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()',
                   t.table_name || '_updated_at', t.table_name);
  END LOOP;
END $$;

-- ================================================================ functions: booking ref, seat hold, holds release, table counts
CREATE FUNCTION gen_booking_ref() RETURNS varchar LANGUAGE plpgsql AS $$
DECLARE alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r text;
BEGIN
  LOOP
    r := 'RT-';
    FOR i IN 1..6 LOOP r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM bookings WHERE booking_ref = r);
  END LOOP;
  RETURN r;
END $$;

-- Atomic seat hold (v0.3 §2.29). Raises SQLSTATE 'P0010' SESSION_FULL, 'P0011' SESSION_NOT_ON_SALE,
-- 'P0012' ALREADY_BOOKED. Idempotent per (user, idempotency_key): a replay returns the existing booking.
CREATE FUNCTION hold_seat(p_user_id uuid, p_session_id uuid, p_budget_tier_id uuid, p_response_id uuid,
                          p_alternates uuid[] DEFAULT '{}', p_idempotency_key varchar DEFAULT NULL,
                          p_hold_minutes integer DEFAULT 10)
RETURNS bookings LANGUAGE plpgsql AS $$
DECLARE s event_sessions; b bookings; v_price integer; v_policy varchar;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO b FROM bookings WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN b; END IF;
  END IF;

  SELECT * INTO s FROM event_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.status <> 'on_sale' OR now() NOT BETWEEN s.booking_opens_at AND s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings WHERE user_id = p_user_id AND session_id = p_session_id
             AND status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed')) THEN
    RAISE EXCEPTION 'ALREADY_BOOKED' USING ERRCODE = 'P0012';
  END IF;

  UPDATE event_sessions SET seats_sold = seats_sold + 1
   WHERE id = p_session_id AND status = 'on_sale' AND seats_sold < max_seats;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010';
  END IF;

  SELECT pp.service_fee_minor, cp.version INTO v_price, v_policy
    FROM price_plans pp, cancellation_policies cp
   WHERE pp.id = s.price_plan_id AND cp.id = s.cancellation_policy_id;

  INSERT INTO bookings (booking_ref, user_id, session_id, alternate_session_ids, conversation_language,
                        budget_tier_id, questionnaire_response_id, status, hold_expires_at, price_minor,
                        cancellation_policy_version, idempotency_key)
  VALUES (gen_booking_ref(), p_user_id, p_session_id, COALESCE(p_alternates,'{}'), s.conversation_language,
          p_budget_tier_id, p_response_id, 'payment_pending', now() + make_interval(mins => p_hold_minutes),
          v_price, v_policy, p_idempotency_key)
  RETURNING * INTO b;

  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_session_id AND seats_sold = max_seats;
  RETURN b;
END $$;

-- Releases expired holds; each release gives the seat back in the same transaction. Returns rows released.
CREATE FUNCTION release_expired_holds() RETURNS integer LANGUAGE plpgsql AS $$
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
  RETURN n;
END $$;

-- Cancelling a booking frees its session seat (user or organizer cancellation), keeping seats_sold exact.
CREATE FUNCTION release_seat_on_cancel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('cancelled_by_user','cancelled_by_organizer','payment_failed')
     AND OLD.status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed') THEN
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_release_seat AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION release_seat_on_cancel();

-- Keeps event_tables.confirmed_count = current assignments whose booking is paid and not cancelled.
CREATE FUNCTION refresh_table_count(p_table_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE event_tables t SET confirmed_count = (
    SELECT count(*) FROM table_assignments a JOIN bookings b ON b.id = a.booking_id
     WHERE a.table_id = t.id AND a.is_current
       AND b.status IN ('paid_awaiting_group','group_locked','revealed','checked_in','completed'))
  WHERE t.id = p_table_id;
$$;

CREATE FUNCTION on_assignment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM refresh_table_count(OLD.table_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM refresh_table_count(NEW.table_id); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER assignments_count AFTER INSERT OR UPDATE OR DELETE ON table_assignments
  FOR EACH ROW EXECUTE FUNCTION on_assignment_change();

CREATE FUNCTION on_booking_status_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t uuid;
BEGIN
  SELECT table_id INTO t FROM table_assignments WHERE booking_id = NEW.id AND is_current;
  IF t IS NOT NULL THEN PERFORM refresh_table_count(t); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER bookings_status_count AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION on_booking_status_count();

-- Safety case reference TS-YYYY-NNNN
CREATE FUNCTION next_case_ref() RETURNS varchar LANGUAGE sql AS $$
  SELECT 'TS-' || to_char(now() AT TIME ZONE 'Asia/Qatar', 'YYYY') || '-' || lpad(nextval('app.safety_case_seq')::text, 4, '0');
$$;

-- ================================================================ ops functions (v0.4, used by Runbook A)
-- Cancels a table that missed quorum at lock_at, atomically: table -> cancelled_quorum, every paid member ->
-- cancelled_by_organizer (seat released by trigger), one QUORUM_FAIL_CHOICE per member in their locale, audit row.
-- Returns the number of bookings cancelled. Refunds are NOT created here: the member chooses rebook or refund
-- until the choice deadline; no choice => automatic full refund (see refund_unresolved_organizer_cancels).
CREATE FUNCTION cancel_table_quorum(p_table_id uuid, p_actor uuid, p_choice_hours integer DEFAULT 48)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE t event_tables; s event_sessions; n integer := 0; r record; v_deadline timestamptz;
BEGIN
  SELECT * INTO t FROM event_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'P0020'; END IF;
  IF t.status NOT IN ('planned','forming') THEN
    RAISE EXCEPTION 'TABLE_NOT_CANCELLABLE: status %', t.status USING ERRCODE = 'P0021';
  END IF;
  IF t.confirmed_count >= t.min_quorum THEN
    RAISE EXCEPTION 'TABLE_HAS_QUORUM: % confirmed', t.confirmed_count USING ERRCODE = 'P0022';
  END IF;
  SELECT * INTO s FROM event_sessions WHERE id = t.session_id;
  v_deadline := now() + make_interval(hours => p_choice_hours);

  FOR r IN SELECT b.id, b.user_id, u.locale FROM table_assignments a
             JOIN bookings b ON b.id = a.booking_id JOIN users u ON u.id = b.user_id
            WHERE a.table_id = p_table_id AND a.is_current
              AND b.status IN ('paid_awaiting_group','group_locked')
  LOOP
    UPDATE bookings SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
                        cancel_reason_code = 'below_quorum'
     WHERE id = r.id;
    INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
    VALUES (r.user_id, 'push', 'QUORUM_FAIL_CHOICE', r.locale,
            jsonb_build_object('booking_id', r.id, 'date', s.starts_at, 'deadline', v_deadline));
    n := n + 1;
  END LOOP;

  UPDATE event_tables SET status = 'cancelled_quorum', cancelled_at = now(), cancel_reason = 'below_quorum'
   WHERE id = p_table_id;
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
  VALUES (p_actor, 'table_cancel', 'event_tables', p_table_id, 'below_quorum');
  RETURN n;
END $$;

-- Member choice "rebook": moves an organizer-cancelled booking's fee to a new session (same language,
-- venue tier <= the member's cap, seat available). p_user_id comes from the JWT; ownership is enforced here.
-- Raises P0030 NOT_REBOOKABLE, P0031 LANGUAGE_CONFLICT, P0010 SESSION_FULL, P0011 SESSION_NOT_ON_SALE.
CREATE FUNCTION rebook_booking(p_booking_id uuid, p_user_id uuid, p_target_session uuid)
RETURNS bookings LANGUAGE plpgsql AS $$
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
  SELECT * INTO s FROM event_sessions WHERE id = p_target_session;
  IF NOT FOUND OR s.status <> 'on_sale' OR now() > s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;
  IF s.conversation_language <> old.conversation_language THEN
    RAISE EXCEPTION 'LANGUAGE_CONFLICT' USING ERRCODE = 'P0031';
  END IF;
  UPDATE event_sessions SET seats_sold = seats_sold + 1
   WHERE id = p_target_session AND status = 'on_sale' AND seats_sold < max_seats;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010'; END IF;

  INSERT INTO bookings (booking_ref, user_id, session_id, conversation_language, budget_tier_id,
                        questionnaire_response_id, status, price_minor, cancellation_policy_version,
                        idempotency_key, rebooked_from_booking_id)
  VALUES (gen_booking_ref(), old.user_id, p_target_session, old.conversation_language, old.budget_tier_id,
          old.questionnaire_response_id, 'paid_awaiting_group', old.price_minor, old.cancellation_policy_version,
          'rebook-' || old.id, old.id)
  RETURNING * INTO nb;
  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_target_session AND seats_sold = max_seats;
  RETURN nb;
END $$;

-- After the choice deadline: every organizer-cancelled booking with neither a rebook nor a live refund
-- gets a full automatic refund (reason organizer_cancel, no approval). Returns refunds created.
CREATE FUNCTION refund_unresolved_organizer_cancels(p_cancelled_before timestamptz)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT b.id AS booking_id, p.id AS payment_id, p.amount_minor
             FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.status = 'succeeded'
            WHERE b.status = 'cancelled_by_organizer' AND b.cancelled_at < p_cancelled_before
              AND NOT EXISTS (SELECT 1 FROM bookings c WHERE c.rebooked_from_booking_id = b.id)
              AND NOT EXISTS (SELECT 1 FROM refunds f WHERE f.booking_id = b.id AND f.status <> 'failed')
  LOOP
    INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
    VALUES (r.payment_id, r.booking_id, r.amount_minor, 'organizer_cancel', 'requested', 'auto-oc-' || r.booking_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Same-session move (decision-tree step 1 MERGE, or an admin manual adjust). Re-validates every hard
-- constraint; queues MOVED_TABLE; audits with a reason code. Never moves across sessions or languages.
CREATE FUNCTION move_booking_table(p_booking_id uuid, p_to_table uuid, p_actor uuid, p_reason varchar)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE b bookings; cur table_assignments; dst event_tables; v_member_rank smallint; v_venue_rank smallint; v_locale varchar;
BEGIN
  IF p_reason NOT IN ('quorum_merge','friend_request_separate','accessibility_fit','ops_balance','other') THEN
    RAISE EXCEPTION 'REASON_CODE_REQUIRED' USING ERRCODE = 'P0040';
  END IF;
  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT * INTO cur FROM table_assignments WHERE booking_id = p_booking_id AND is_current FOR UPDATE;
  SELECT * INTO dst FROM event_tables WHERE id = p_to_table FOR UPDATE;
  IF b.id IS NULL OR cur.id IS NULL OR dst.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0041'; END IF;
  IF dst.session_id <> b.session_id THEN RAISE EXCEPTION 'CROSS_SESSION_MOVE_FORBIDDEN' USING ERRCODE = 'P0042'; END IF;
  IF dst.status NOT IN ('planned','forming') THEN RAISE EXCEPTION 'TABLE_NOT_OPEN' USING ERRCODE = 'P0043'; END IF;
  IF dst.confirmed_count >= dst.capacity THEN RAISE EXCEPTION 'TABLE_FULL' USING ERRCODE = 'P0044'; END IF;
  SELECT rank INTO v_member_rank FROM budget_tiers WHERE id = b.budget_tier_id;
  SELECT bt.rank INTO v_venue_rank FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id WHERE v.id = dst.venue_id;
  IF v_venue_rank IS NOT NULL AND v_venue_rank > v_member_rank THEN
    RAISE EXCEPTION 'TIER_ABOVE_CAP' USING ERRCODE = 'P0045';
  END IF;
  IF EXISTS (SELECT 1 FROM table_assignments a JOIN bookings ob ON ob.id = a.booking_id
              JOIN user_blocks ub ON (ub.blocker_user_id = ob.user_id AND ub.blocked_user_id = b.user_id)
                                  OR (ub.blocked_user_id = ob.user_id AND ub.blocker_user_id = b.user_id)
             WHERE a.table_id = p_to_table AND a.is_current) THEN
    RAISE EXCEPTION 'BLOCKED_PAIR' USING ERRCODE = 'P0046';
  END IF;
  UPDATE table_assignments SET is_current = false WHERE id = cur.id;
  INSERT INTO table_assignments (booking_id, table_id, matching_run_id, is_current)
  VALUES (p_booking_id, p_to_table, cur.matching_run_id, true);
  SELECT locale INTO v_locale FROM users WHERE id = b.user_id;
  INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
  VALUES (b.user_id, 'push', 'MOVED_TABLE', v_locale, jsonb_build_object('booking_id', b.id));
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
  VALUES (p_actor, 'table_move', 'table_assignments', p_booking_id, p_reason);
END $$;

-- Matching input for one session as JSON (consumed by qatar/matching/publish_run.py).
-- Only pseudonymous-safe fields leave the database: ids, language, tier rank, Q05 option keys, flags.
CREATE FUNCTION matching_input(p_session uuid) RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'session_id', s.id,
    'questionnaire_version_id', (SELECT id FROM questionnaire_versions WHERE status = 'published'),
    'bookings', COALESCE((
      SELECT json_agg(json_build_object(
        'booking_id', b.id, 'user_id', b.user_id, 'session_id', b.session_id, 'status', b.status,
        'conversation_language', b.conversation_language, 'budget_tier_rank', bt.rank,
        'q05_topics', (SELECT json_agg(o.key ORDER BY o.key) FROM answers a
                         JOIN questions q ON q.id = a.question_id AND q.key = 'Q05'
                         JOIN question_options o ON o.id = a.option_id
                        WHERE a.response_id = b.questionnaire_response_id),
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
                                 'capacity', LEAST(v.seats_per_table_max, 6), 'tables_available', v.total_bookable_tables)
                                 ORDER BY v.id)
                          FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id
                         WHERE v.city_id = s.city_id AND v.is_active AND s.experience = ANY (v.supported_experiences)),
                       '[]'::json))
  FROM event_sessions s WHERE s.id = p_session;
$$;

-- Appeals are reviewed by someone who neither decided nor second-approved the case (v0.3 §4.4.2 step 7),
-- and a case gets one appeal decision only.
CREATE FUNCTION check_appeal_reviewer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action IN ('appeal_upheld','appeal_rejected') THEN
    IF EXISTS (SELECT 1 FROM report_actions
                WHERE report_id = NEW.report_id AND action IN ('appeal_upheld','appeal_rejected')) THEN
      RAISE EXCEPTION 'APPEAL_ALREADY_DECIDED' USING ERRCODE = 'P0050';
    END IF;
    IF EXISTS (SELECT 1 FROM report_actions
                WHERE report_id = NEW.report_id
                  AND action IN ('warning','suspension','ban','no_action','referral_authorities')
                  AND (actor_id = NEW.actor_id OR second_approver = NEW.actor_id)) THEN
      RAISE EXCEPTION 'APPEAL_REVIEWER_CONFLICT' USING ERRCODE = 'P0051';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_actions_appeal_guard BEFORE INSERT ON report_actions
  FOR EACH ROW EXECUTE FUNCTION check_appeal_reviewer();
