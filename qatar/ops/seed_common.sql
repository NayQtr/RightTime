-- Common reference data for the Runbook A/B simulations (test data only — not real venues or people).
-- Requires 001_init.sql. Clock: both live sessions start at T = date_trunc('minute', now()) + 24h,
-- so lock_at (T-24h) is "now" and the T-24h decision can be executed immediately.
SET search_path = app, public;

INSERT INTO cities (id, name_ar, name_en, is_active) VALUES ('doh', 'الدوحة', 'Doha', true);

INSERT INTO legal_documents (version, type, text_ar, text_en, published_at) VALUES
  ('terms-qa-1',   'terms',        'الشروط (نسخة اختبار)',          'Terms (test copy)',        now()),
  ('conduct-qa-1', 'conduct',      'قواعد السلوك (نسخة اختبار)',    'Code of conduct (test)',   now()),
  ('privacy-qa-1', 'privacy',      'إشعار الخصوصية (نسخة اختبار)', 'Privacy notice (test)',    now()),
  ('cxl-qa-1',     'cancellation', 'سياسة الإلغاء (نسخة اختبار)',   'Cancellation policy (test)', now()),
  ('mkt-qa-1',     'marketing',    'رسائل تسويقية (نسخة اختبار)',   'Marketing messages (test copy)', now());

INSERT INTO admin_users (id, email, name, role, mfa_enabled) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'ops.oncall@example.test',  'Ops On-call',  'ops',          true),
  ('00000000-0000-0000-0000-00000000a002', 'finance@example.test',     'Finance Lead', 'finance',      true),
  ('00000000-0000-0000-0000-00000000a003', 'owner@example.test',       'Owner',        'owner',        true),
  ('00000000-0000-0000-0000-00000000a004', 'ts.primary@example.test',  'T&S Primary',  'trust_safety', true),
  ('00000000-0000-0000-0000-00000000a005', 'ts.second@example.test',   'T&S Second',   'trust_safety', true),
  ('00000000-0000-0000-0000-00000000a006', 'ts.appeals@example.test',  'T&S Appeals',  'trust_safety', true);

INSERT INTO budget_tiers (id, city_id, rank, max_spend_minor, label_ar, label_en, status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'doh', 1, 10000, 'اقتصادي',  'Value',    'published'),
  ('00000000-0000-0000-0000-0000000000b2', 'doh', 2, 20000, 'متوسط',    'Standard', 'published'),
  ('00000000-0000-0000-0000-0000000000b3', 'doh', 3, NULL,  'مرتفع',    'Premium',  'published');

INSERT INTO venues (id, city_id, name, district_ar, district_en, address_line, lat, lng, venue_type, supported_experiences,
                    total_bookable_tables, seats_per_table_max, price_band_min_minor, price_band_max_minor, budget_tier_id,
                    noise_level, separate_bills_confirmed, min_spend_policy, arrival_instructions_ar, arrival_instructions_en,
                    contract_status, is_active) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'doh', 'TEST Venue Lusail',   'لوسيل',          'Lusail',   'Test address 1', 25.420000, 51.490000,
   'restaurant', '{dinner,coffee}', 3, 6, 8000, 15000, '00000000-0000-0000-0000-0000000000b2', 2, true,
   'No minimum spend on the organizer; each guest orders and pays individually', 'اطلب طاولة {code}', 'Ask for table {code}', 'signed', true),
  ('00000000-0000-0000-0000-0000000000c2', 'doh', 'TEST Venue Msheireb', 'مشيرب',          'Msheireb', 'Test address 2', 25.286000, 51.526000,
   'cafe', '{coffee,dinner}', 2, 6, 3000, 8000, '00000000-0000-0000-0000-0000000000b1', 1, true,
   'No minimum spend on the organizer; each guest orders and pays individually', 'اطلب طاولة {code}', 'Ask for table {code}', 'signed', true),
  ('00000000-0000-0000-0000-0000000000c3', 'doh', 'TEST Venue West Bay', 'الخليج الغربي', 'West Bay', 'Test address 3', 25.322000, 51.530000,
   'restaurant', '{dinner}', 2, 6, 15000, 30000, '00000000-0000-0000-0000-0000000000b3', 2, true,
   'No minimum spend on the organizer; each guest orders and pays individually', 'اطلب طاولة {code}', 'Ask for table {code}', 'signed', true);

INSERT INTO price_plans (id, city_id, experience, service_fee_minor, valid_from) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'doh', 'dinner', 5900, now() - interval '30 days');
INSERT INTO cancellation_policies (id, version, full_refund_until_hours, late_cancel_refund_pct, text_ar, text_en) VALUES
  ('00000000-0000-0000-0000-0000000000d2', 'cxl-qa-1', 48, 0, 'انظر وثيقة السياسة cxl-qa-1', 'See policy document cxl-qa-1');

-- questionnaire QA-2026-01 (v0.3 §1.2): Q05 (read by the matcher) first, then Q01, Q04, Q06, Q07, Q08
INSERT INTO questionnaire_versions (id, code, status) VALUES ('00000000-0000-0000-0000-0000000000e1', 'QA-2026-01', 'draft');
INSERT INTO questions (id, questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                       max_selections, matching_use, data_class, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e1', 'Q05', 'profile',
   'اختر حتى ثلاثة موضوعات تستمتع بالحديث عنها.', 'Choose up to three topics you enjoy discussing.',
   'لنقترح طاولة باهتمامات مشتركة', 'To suggest a table with shared interests', 'multi', 3, 'soft_factor', 'P3', 5);
INSERT INTO question_options (question_id, key, label_ar, label_en, is_exclusive, sort_order)
SELECT '00000000-0000-0000-0000-0000000000e5', k, la, le, k = 'no_pref', o FROM (VALUES
  ('food','طعام','Food',1), ('travel','سفر','Travel',2), ('sport','رياضة','Sport',3),
  ('books_culture','كتب وثقافة','Books & culture',4), ('creative_hobbies','هوايات إبداعية','Creative hobbies',5),
  ('tech','تقنية','Tech',6), ('no_pref','لا تفضيل','No preference',7)
) v(k, la, le, o);
-- the other profile questions of v0.3 §1.2 (Q01, Q04, Q06, Q07, Q08); Q02/Q03 are asked per booking on SCR-04
INSERT INTO questions (id, questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                       max_selections, is_required, matching_use, data_class, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e1', 'Q01', 'profile',
   'ما اللغة التي ترتاح لإجراء محادثة جماعية كاملة بها؟', 'In which language can you comfortably hold a full group conversation?',
   'لتحديد لغة الطاولة؛ لا نجمع طاولة بلغات لا تتقاطع.', 'To set your table''s language; we never seat people without a shared language.',
   'multi', NULL, true, 'hard_constraint', 'P3', 1),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e1', 'Q04', 'profile',
   'ما الحد الأعلى المناسب لإنفاقك على الطعام والمشروبات، بخلاف رسم الخدمة الظاهر؟', 'What is your maximum food and drink budget, excluding the displayed service fee?',
   'لاختيار مكان ضمن ميزانيتك؛ لا يرى أحد على الطاولة إجابتك.', 'To choose a venue within your budget; no one at your table sees this answer.',
   'tier', NULL, true, 'hard_constraint', 'P3', 2),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e1', 'Q06', 'profile',
   'ما الذي يساعدك على المشاركة براحة في لقاء أول؟', 'What helps you participate comfortably in a first meeting?',
   'لنقترح بداية مريحة للحوار على طاولتك.', 'To suggest a comfortable way to start the conversation at your table.',
   'multi', NULL, false, 'event_prep', 'P3', 4),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e1', 'Q07', 'profile',
   'هل تحتاج إلى ترتيب عملي في المكان أو الوجبة لإتمام الحجز؟', 'Do you need a practical venue or meal arrangement to complete your booking?',
   'لنتواصل معك بشكل خاص؛ لا تكتب تفاصيل هنا.', 'So our team can contact you privately; please don''t write details here.',
   'contact_request', NULL, false, 'ops_only', 'P4', 5),
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000e1', 'Q08', 'profile',
   'كيف تفضل إتاحة التواصل بعد اللقاء؟', 'How would you like contact to be enabled after the event?',
   'لا نشارك أي وسيلة تواصل إلا بموافقة الطرفين.', 'We never share contact details unless both people agree.',
   'single', NULL, false, 'ops_only', 'P3', 6);
UPDATE questions SET sort_order = 3 WHERE id = '00000000-0000-0000-0000-0000000000e5';

INSERT INTO question_options (question_id, key, label_ar, label_en, is_exclusive, maps_to, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000e3', 'lang_ar',    'العربية',    'Arabic',           false, '{"language":"ar"}', 1),
  ('00000000-0000-0000-0000-0000000000e3', 'lang_en',    'الإنجليزية', 'English',          false, '{"language":"en"}', 2),
  ('00000000-0000-0000-0000-0000000000e3', 'lang_other', 'لغة أخرى',   'Another language', false, '{}', 3),
  ('00000000-0000-0000-0000-0000000000e4', 'tier_1', 'حتى 100 ر.ق',  'Up to QAR 100',  false, '{"budget_tier_id":"00000000-0000-0000-0000-0000000000b1"}', 1),
  ('00000000-0000-0000-0000-0000000000e4', 'tier_2', 'حتى 200 ر.ق',  'Up to QAR 200',  false, '{"budget_tier_id":"00000000-0000-0000-0000-0000000000b2"}', 2),
  ('00000000-0000-0000-0000-0000000000e4', 'tier_3', 'أكثر من 200 ر.ق', 'More than QAR 200', false, '{"budget_tier_id":"00000000-0000-0000-0000-0000000000b3"}', 3),
  ('00000000-0000-0000-0000-0000000000e6', 'opener_question',  'سؤال افتتاحي',      'An opening question',        false, NULL, 1),
  ('00000000-0000-0000-0000-0000000000e6', 'simple_activity',  'نشاط بسيط',         'A simple activity',          false, NULL, 2),
  ('00000000-0000-0000-0000-0000000000e6', 'spontaneous',      'مساحة لحوار عفوي',  'Room for spontaneous talk',  false, NULL, 3),
  ('00000000-0000-0000-0000-0000000000e6', 'turn_taking',      'إتاحة الدور للجميع', 'Everyone gets a turn',       false, NULL, 4),
  ('00000000-0000-0000-0000-0000000000e6', 'no_pref',          'لا تفضيل',           'No preference',              true,  NULL, 5),
  ('00000000-0000-0000-0000-0000000000e7', 'no',               'لا',                 'No',                         false, NULL, 1),
  ('00000000-0000-0000-0000-0000000000e7', 'private_contact',  'أرغب في تواصل خاص بشأن ترتيب عملي', 'I''d like private contact about a practical arrangement', false, NULL, 2),
  ('00000000-0000-0000-0000-0000000000e8', 'no_sharing',       'لا مشاركة',          'No sharing',                 false, NULL, 1),
  ('00000000-0000-0000-0000-0000000000e8', 'mutual_consent',   'تواصل بعد موافقة متبادلة', 'Contact after mutual agreement', false, NULL, 2);
UPDATE question_options SET is_exclusive = true WHERE question_id = '00000000-0000-0000-0000-0000000000e5' AND key = 'no_pref';

UPDATE questionnaire_versions SET status = 'published', published_at = now(), approved_by = '00000000-0000-0000-0000-00000000a003'
 WHERE id = '00000000-0000-0000-0000-0000000000e1';

-- 20 test users (u01..u20), all AR locale, tier 2 cap, consents current, Q05 answered (u05 left it blank)
INSERT INTO users (id, phone_e164_enc, phone_lookup_hash, display_name, locale, age_eligibility_confirmed_at, registration_completed_at)
SELECT ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, '\x00'::bytea,
       encode(sha256(('+974-test-' || g)::bytea), 'hex'), 'Tester ' || chr(64 + g), 'ar', now() - interval '20 days', now() - interval '20 days'
FROM generate_series(1, 20) g;

INSERT INTO user_consents (user_id, consent_type, document_version, granted, source)
SELECT u.id, c.t::consent_type, c.v, true, 'app_ios'
FROM users u CROSS JOIN (VALUES ('terms','terms-qa-1'), ('conduct','conduct-qa-1'), ('privacy_notice','privacy-qa-1')) c(t, v);

INSERT INTO questionnaire_responses (id, user_id, questionnaire_version_id, status, submitted_at, completeness_required)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000000e1', 'submitted', now() - interval '20 days', 2
FROM generate_series(1, 20) g;

INSERT INTO answers (response_id, question_id, option_id)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000e5', o.id
FROM generate_series(1, 20) g
JOIN question_options o ON o.question_id = '00000000-0000-0000-0000-0000000000e5'
 AND o.key = ANY (CASE g % 4 WHEN 0 THEN ARRAY['food','travel'] WHEN 1 THEN ARRAY['books_culture','tech']
                             WHEN 2 THEN ARRAY['food','creative_hobbies'] ELSE ARRAY['sport','travel'] END)
WHERE g <> 5;

-- Q01 = Arabic, Q04 = tier 2 for every test user (matches bookings.budget_tier_id b2)
INSERT INTO answers (response_id, question_id, option_id)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid, o.question_id, o.id
FROM generate_series(1, 20) g
JOIN question_options o ON (o.question_id, o.key) IN (('00000000-0000-0000-0000-0000000000e3'::uuid, 'lang_ar'),
                                                     ('00000000-0000-0000-0000-0000000000e4'::uuid, 'tier_2'));

-- sessions: S1 and S2 at T (Arabic dinner, Lusail / West Bay hints); S3 a week later for rebooking
CREATE SCHEMA sim;  -- simulation-only helpers; never create this schema in production
CREATE TABLE sim.clock AS SELECT date_trunc('minute', now()) + interval '24 hours' AS t;
ALTER TABLE sim.clock ADD COLUMN id boolean PRIMARY KEY DEFAULT true CHECK (id);  -- single-row table
INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, booking_opens_at, booking_closes_at, lock_at, reveal_at, check_in_opens_at, status)
SELECT x.id, 'doh', 'dinner', 'ar', c.t + x.shift, c.t + x.shift + interval '2 hours', x.dar, x.den,
       '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 18,
       c.t + x.shift - interval '14 days', c.t + x.shift - interval '1 hour',
       c.t + x.shift - interval '24 hours', c.t + x.shift - interval '24 hours', c.t + x.shift - interval '30 minutes', 'on_sale'
FROM sim.clock c CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-00000000f001'::uuid, interval '0', 'لوسيل', 'Lusail'),
  ('00000000-0000-0000-0000-00000000f002'::uuid, interval '0', 'الخليج الغربي', 'West Bay'),
  ('00000000-0000-0000-0000-00000000f003'::uuid, interval '7 days', 'مشيرب', 'Msheireb')
) x(id, shift, dar, den);

-- helper used by the seeds: hold a seat through the real function, then record a successful hosted-checkout payment
CREATE FUNCTION sim.book_and_pay(p_user int, p_session uuid, p_alternates uuid[] DEFAULT '{}') RETURNS uuid
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE b app.bookings; uid uuid := ('00000000-0000-0000-0000-0000000001' || lpad(p_user::text, 2, '0'))::uuid;
BEGIN
  b := app.hold_seat(uid, p_session, '00000000-0000-0000-0000-0000000000b2',
                     ('00000000-0000-0000-0000-0000000002' || lpad(p_user::text, 2, '0'))::uuid,
                     p_alternates, 'seed-' || p_user || '-' || p_session);
  INSERT INTO app.payment_webhook_events (psp, psp_event_id, event_type, signature_valid, payload, processed_at)
  VALUES ('test_psp', 'evt_' || b.id, 'payment.succeeded', true,
          jsonb_build_object('payment_intent', 'pi_' || b.id, 'amount', 5900, 'currency', 'QAR'), now());
  INSERT INTO app.payments (booking_id, user_id, psp, psp_payment_intent_id, amount_minor, status, method_brand, card_last4,
                            idempotency_key, succeeded_at)
  VALUES (b.id, uid, 'test_psp', 'pi_' || b.id, 5900, 'succeeded', 'visa', '4242', 'pay-' || b.id, now());
  UPDATE app.bookings SET status = 'paid_awaiting_group', hold_expires_at = NULL WHERE id = b.id;
  RETURN b.id;
END $$;

-- Supabase: the simulation schema is never reachable by client roles
REVOKE ALL ON SCHEMA sim FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA sim FROM %I', r);
    END IF;
  END LOOP;
END $$;
