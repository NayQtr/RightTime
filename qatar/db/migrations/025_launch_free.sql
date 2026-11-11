-- 025: the launch period's announced price (item 41, the owner's option (ج) of 11 Nov 2026).
-- While PRICING_LAUNCH_FREE is true the organising fee is announced as "free for a limited period". The amount is
-- still taken and refunded in full, so the card-name check — the real women-only gate — keeps working, and the
-- price_minor > 0 constraint is never broken. Only what the member is told changes, and she is told it at the last
-- step alone: nothing about money is said earlier in the sign-up (owner, 11 Nov).
-- Default false, so turning the offer on is the owner's deliberate act. Every name is schema-qualified and re-running
-- is safe.

INSERT INTO app.app_config (key, value, description) VALUES
  ('PRICING_LAUNCH_FREE', 'false',
   'true while the organising fee is announced as free for a limited period (the amount is still taken and refunded in full)')
ON CONFLICT (key) DO NOTHING;
