-- 024: sign-in numbers from every country except Israel (owner's decision, 11 Nov 2026, item 38).
-- PHONE_ALLOWED_COUNTRY_CODES becomes '*' (every calling code in api/src/lib/countries.js) instead of '974'.
-- PHONE_BLOCKED_COUNTRY_CODES is new and empty: Israel (+972) is refused by the code itself, whatever this row says,
-- so a wrong setting can never open it. The row is only there to block further codes if the owner ever asks.
-- Every name is schema-qualified, so it runs whatever the session's search_path. Re-running is safe.

UPDATE app.app_config
   SET value = '*',
       description = 'Calling codes allowed to sign in, comma-separated, or "*" for every country (Israel is always refused)'
 WHERE key = 'PHONE_ALLOWED_COUNTRY_CODES';

INSERT INTO app.app_config (key, value, description) VALUES
  ('PHONE_BLOCKED_COUNTRY_CODES', '', 'Further calling codes never accepted, comma-separated (+972 is always refused, whatever this says)')
ON CONFLICT (key) DO NOTHING;

UPDATE app.app_config
   SET description = 'Sign-in codes per hour for each country other than Qatar (paid-SMS abuse limit)'
 WHERE key = 'OTP_COUNTRY_HOURLY_CAP';
