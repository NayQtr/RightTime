# SMS provider: Twilio (item 37)

**Date:** 10 Nov 2026. **Status:** provisional; built, off until the owner adds the secrets.

**Context.** Production cannot send sign-in codes: without an SMS provider the API answers 503 (launch condition T3).
Options were an international provider, a Qatar-local one, or WhatsApp with SMS fallback.

**Decision.** Twilio Programmable Messaging (`qatar/api/src/lib/sms.js`), used for members' sign-in codes and
coordinator alerts. Off unless `SMS_PROVIDER=twilio` and its Edge Function secrets are set (names only, the owner enters
the values in Supabase): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM`.

**Why.** One API reaches Qatar and other countries if the allowed list widens (item 38), it offers WhatsApp later, and
it works with plain HTTPS from Supabase Edge. A local provider can be added behind the same `sendSms` function.

**How to change.** Set `SMS_PROVIDER` to another provider once it is added to `lib/sms.js`; empty turns SMS off.

**Revisit** before launch: delivery rate and price to Qatar numbers, sender name registration in Qatar, and whether
WhatsApp codes should come first.
