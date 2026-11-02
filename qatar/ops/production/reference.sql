-- HerZone production: reference data and settings (no people, no test venues, no test documents).
-- Runs after migrations 001-013 (build with ops/production/build_setup.py). Re-running is a no-op.
--
-- Not here on purpose, each waiting on its Linear issue:
--   * legal documents (terms, conduct, privacy, cancellation): only after the lawyer's review (NMX-25, NMX-26)
--   * the owner admin account: needs the owner's email (NMX-20); she then publishes the questionnaire below
--   * venues and dinners: real contracts only (NMX-28)
--   * SMS provider and payment gateway: NMX-23, NMX-24 (until then sign-in and payment are off, which is correct)
SET search_path = app, public;

INSERT INTO cities (id, name_ar, name_en, is_active) VALUES ('doh', 'الدوحة', 'Doha', true)
ON CONFLICT (id) DO NOTHING;

-- Budget tiers: same ids as staging, because the questionnaire's Q04 options point at them (maps_to.budget_tier_id).
INSERT INTO budget_tiers (id, city_id, rank, max_spend_minor, label_ar, label_en, status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'doh', 1, 10000, 'اقتصادي', 'Value',    'published'),
  ('00000000-0000-0000-0000-0000000000b2', 'doh', 2, 20000, 'متوسط',   'Standard', 'published'),
  ('00000000-0000-0000-0000-0000000000b3', 'doh', 3, NULL,  'مرتفع',   'Premium',  'published')
ON CONFLICT (id) DO NOTHING;

-- Service fee per seat (QAR 59, as on staging) and the cancellation policy the code enforces (full refund until
-- 48 hours before; nothing after). Both are business decisions the owner can change before launch.
INSERT INTO price_plans (id, city_id, experience, service_fee_minor, valid_from) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'doh', 'dinner', 5900, now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO cancellation_policies (id, version, full_refund_until_hours, late_cancel_refund_pct, text_ar, text_en) VALUES
  ('00000000-0000-0000-0000-0000000000d2', 'cxl-1', 48, 0,
   'استرداد كامل حتى 48 ساعة قبل موعد اللقاء، ولا استرداد بعد ذلك.', 'Full refund until 48 hours before the meetup; no refund after that.')
ON CONFLICT (id) DO NOTHING;

-- Production settings. Sign-in test codes and the mock payment stay off (their defaults); only HerZone's own site may
-- call the API; errors are reported to Sentry as "production".
INSERT INTO app_config (key, value, description) VALUES
  ('WEB_BASE_URL', 'https://herzone.app', 'Public site address, used in links the API builds'),
  ('CORS_ORIGINS', 'https://herzone.app', 'Origins allowed to call the API from a browser (comma-separated)'),
  ('OTP_DEV_MODE', 'false', 'Never true in production: true returns the sign-in code in the API response'),
  ('MOCK_PSP_ENABLED', 'false', 'Never true in production: true enables the fake checkout'),
  ('SENTRY_DSN', 'https://be467e3dddbe8219c2640243e16b3ce4@o4512359059488768.ingest.de.sentry.io/4512359079739472', 'Sentry project herzone-api'),
  ('SENTRY_ENVIRONMENT', 'production', 'Environment name on Sentry events')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
