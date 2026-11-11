# Coordinator alerts: push and SMS (item 40)

**Date:** 10 Nov 2026. **Status:** provisional; built.

**Context.** A serious report during a meetup only wrote an audit row; nobody was told (launch condition T13). Spec
v0.3 §4.4.2 says "page the on-call coordinator (push + SMS)".

**Decision.** Both channels (`qatar/api/src/services/coordinator_alerts.js`):
- Raised for every S1 or S2 report made during the meetup, and for every "I am in danger now".
- Sent at once by Web Push to coordinators (roles `owner` and `ops`) who turned alerts on in the admin console, and by
  SMS, when a provider is set up, to the numbers in the Edge Function secret `COORDINATOR_ALERT_PHONES`.
- If nobody acknowledges it within `COORDINATOR_ESCALATE_MINUTES` (default 5), it is sent again to everyone, once.
- The texts carry the kind, severity and case reference only, nothing from the report.

**Why.** Push alone is missed when the console is closed or the phone is silent; SMS alone has no acknowledgement. Both
together follow the spec.

**How to change.** `COORDINATOR_ROLES` in `coordinator_alerts.js`, the escalation minutes in config.js, and the numbers
in the secret.

**Revisit** when the night rota is set (who is on duty), or if alerts prove too noisy.
