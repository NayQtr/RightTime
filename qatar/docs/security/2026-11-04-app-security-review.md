# HerZone app security review (NMX-55)

**Date:** 2026-11-04
**Code:** `qatar/app` on branch `rightime-app`.
**Method:**
- An automated check of every app package.
- An independent read-only review of the app against OWASP MASVS v2. The reviewer also read the API code where the app depends on it.

## Summary

- **Packages:**
  - 92 locked packages were checked against osv.dev. None has a known vulnerability.
  - The check now runs in CI on every push (`tool/osv_check.py`). It is proven to fail on a known-vulnerable version.
  - Licences: BSD, MIT and Apache-2.0 only. No copyleft.
  - One unused package was removed (`cupertino_icons`).
- **Review:** no critical or high issues. It found 3 medium issues, 7 low issues, and some informational notes.
  - 8 are fixed, each with a test.
  - 2 need a product decision from the owner (below).
- **Found while preparing the store listings:** the app had no account deletion. Apple (guideline 5.1.1(v)) and Google Play require it, so it is now in the Account tab.

## Fixed

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | Medium | Sign-out after an automatic token refresh sent the old refresh token, so the server session stayed alive for 30 days. This affected the website too. | The server also ends the session the access token belongs to (its `sid`). | `api/test/session.test.mjs` |
| 2 | Medium | The Android recent-apps preview could capture the venue and table code before the privacy cover was drawn. | On Android 13 and later, the preview is left blank (`setRecentsScreenshotEnabled(false)`). Older Android: see decision B. | Needs a device check; no Android SDK here |
| 4 | Low | Links from the server (payment page, WhatsApp, phone) opened without any check. | Allowlist: `https` to HerZone's sites, `wa.me` and `maps.google.com`, and the payment host set at build time; `tel:` only with a number. Everything else is refused. | `link_opener_test.dart` |
| 5 | Low | Unsent quiz answers, and the last phone number typed, stayed after sign-out. On a shared phone, the next person to register could get those answers. | Cleared on every sign-out and deletion. | `sign_in_flow_test.dart` |
| 6 | Low | A server error while loading the profile looked like a sign-out, but the token and saved meetups stayed. | A server error now counts as offline. A real 401 wipes the device. | `sign_in_flow_test.dart` |
| 7 | Low | iPhone Keychain items survive deleting the app. A member who deleted it was still signed in after reinstalling. | The first launch after an install wipes the Keychain items. | `install_marker_test.dart` |
| 8 | Low | No request timeout, so a stalled connection showed an endless spinner instead of the saved copy. | 15-second timeout, then offline. A write is retried with the same Idempotency-Key. | `api_client_test.dart` |
| 9 | Low | Sentry scrubbing missed the event message, breadcrumbs, local 8-digit numbers and table codes. | All of these are scrubbed now. The local-number rule is also added to the website and API. | `sign_in_flow_test.dart`, `monitor.test.mjs` |
| 10 | Low | The venue map link was copied to the clipboard, which other apps can read. | The link opens the map instead. | `meetups_test.dart` |
| 11 | Info | A release build made without the `--dart-define` flags pointed at staging, where the sign-in code can be shown. | Release builds default to production. `INTERNET` is now declared explicitly. | — |

## Needs a decision from the owner

- **A. Should Face ID or the fingerprint also protect meetup details (finding #3)?**
  - Today only the Notifications tab is locked.
  - Anyone holding an unlocked phone can open My meetups and see the venue, the table code and tablemates' names.
  - Locking that too protects more, but adds one step on the day of the meetup.
- **B. Should screenshots and screen recording be blocked (finding #2)?**
  - On Android this is `FLAG_SECURE`. It also hides the screen in the recent-apps preview on older Android.
  - It stops members from screenshotting their own booking.

## Still open (needs accounts or devices)

- **Release signing:** release builds are still signed with the debug key. The real signing key comes with the Google Play account (NMX-45).
- **Native crashes:** Java and Objective-C crashes are not scrubbed by the Dart hook. Sentry's native SDK sends no request bodies, and `sendDefaultPii` is off. Check on the first device build.
- **Certificate pinning:** NMX-53.

## Checked and found sound

- The access token is kept in memory only. The refresh token is in the Keychain or Keystore, not synced, and not backed up.
- Refreshes run one at a time. Only a 401 on refresh signs the member out.
- Cleartext traffic is off. Only system CAs are trusted, and iOS ATS has no exceptions.
- Only the launcher activity is exported. There are no deep links, custom schemes or WebViews.
- Idempotency keys are reused on both kinds of retry.
- Seat tokens are HMACs. There is no client-side path to another member's data.
- There are no `print` or `debugPrint` calls. Sentry has `sendDefaultPii` off, and screenshots and the view hierarchy are not attached.
