# Certificate pinning postponed (item 8, NMX-53)

**Date:** 4 Nov 2026 (recommendation), kept on 10 Nov 2026. **Status:** recommended, not built.

**Context.** Pinning would make the app accept only one known server certificate or key. The API runs on
`*.supabase.co` behind Cloudflare: we do not control its certificate, it changes every few weeks, and its issuing
authority can change without notice. Full analysis: `qatar/docs/security/2026-11-04-certificate-pinning.md`.

**Decision.** Do not pin. Keep what protects the traffic today: HTTPS only, no cleartext, Android trusts only system
certificate authorities (`network_security_config.xml`), iOS App Transport Security without exceptions.

**Why.** A wrong pin locks every member out at once (sign-in, meetup details, the forced-update screen) until a new store
release is installed. The attack pinning stops (a certificate installed on the phone) is already blocked on Android
and iOS. OWASP MASVS v2 leaves pinning as a choice for higher-risk apps.

**Revisit when** the API moves to our own domain (for example `api.herzone.app`) with keys we control, or a threat
assessment asks for it. Then pin at least two public keys (one spare kept offline), with an expiry date in the app and a
fallback to normal checks that reports to Sentry.
