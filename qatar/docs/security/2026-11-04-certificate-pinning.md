# Certificate pinning in the app (NMX-53): recommendation

**Date:** 2026-11-04
**Status:** recommendation, waiting for the owner's decision.

## What was checked

**The API certificates, from public Certificate Transparency logs (crt.sh):**
- `*.supabase.co`, which covers the staging and production API hosts, has two current certificates.
- Both come from Google Trust Services: WE1 (ECDSA) and WR1 (RSA).
- Both were issued on 2026-08-26, with the usual 90-day life.
- A query for older certificates was rate-limited, so the history of issuers is not confirmed.

**The live headers:**
- The API answers through Cloudflare (`server: cloudflare`, `cf-ray`).
- The website answers through Vercel.

**The limit of this check:** the work environment reaches the internet through an inspecting proxy, so the chain seen from here is not the real one. The issuers above come from the public logs, not from this connection.

## What it means

- **We do not control the API certificate.** Supabase gets it through Cloudflare, it changes every few weeks, and the issuing authority can change without notice. Cloudflare can issue from more than one authority.
- **A wrong pin locks everyone out at once.** Pin to the certificate, the key or the issuer, and the day that changes, every copy of the app stops talking to the server.
  - That includes sign-in, meetup details and the forced-update screen (NMX-61).
  - The only fix is a new store release, and members must install it.
- **The main attack pinning prevents is already blocked.**
  - Android trusts only system certificate authorities (`network_security_config.xml`, 0615b36), so a certificate the user installs, or one that malware or a "monitoring" profile installs, cannot read the traffic.
  - iOS App Transport Security allows only valid public certificates.
  - What remains is a public certificate authority issuing a false certificate for `supabase.co`. That is rare, and Certificate Transparency makes it detectable.

## Recommendation

1. **Do not pin now.** The risk of locking members out is greater than the protection gained. OWASP MASVS v2 makes pinning a choice for higher-risk apps (MASVS-NETWORK-2), and its testing guide warns against pinning certificates you do not control.
2. **Keep what is in place:** system CAs only on Android, HTTPS only, no cleartext, iOS ATS without exceptions.
3. **Revisit pinning if one of these happens:**
   - The API moves to our own domain (for example `api.herzone.app`) with keys we control.
   - A threat assessment requires it (for example, targeted attacks on members).

   Then pin to at least two public keys, one of them a spare key kept offline, with a pin expiry date in the app. If a pin fails, the app falls back to normal validation and reports it to Sentry instead of refusing.

## Still open in NMX-53

- **File protection on iPhone** (`NSFileProtectionComplete` through the app's entitlements) needs the Apple developer account (NMX-46).
- Encrypted storage on the device is done: the Keychain and Keystore through flutter_secure_storage.
