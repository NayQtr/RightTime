-- 006 (audit remediation F10): coordinator on duty as a real contact channel (call + WhatsApp buttons in the app).
-- Values are environment data; change them in app.app_config without a deploy (the API reloads config every 30 s).
SET search_path = app, pg_temp;

INSERT INTO app.app_config (key, value, description) VALUES
  ('COORDINATOR_PHONE_E164', '+97460053006', 'Coordinator on duty, E.164. Shown to users as a call button; empty string hides the contact.'),
  ('COORDINATOR_WHATSAPP',   'true',          'true = also show a WhatsApp button (wa.me) for the coordinator number.')
ON CONFLICT (key) DO NOTHING;
