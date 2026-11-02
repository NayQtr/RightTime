# MASVS checklist for the HerZone app

Every control in OWASP MASVS v2, applied to HerZone: a Flutter app for iPhone and Android on the existing HerZone API.
For each control: whether it applies, what HerZone does or must do, how we check it, and where it stands.

HerZone holds data that can hurt someone if it leaks: women's phone numbers, where and when they will be at dinner,
who sits at their table, and private safety reports. That is why HerZone targets **L2** on storage, network and
authentication, and adds the resilience controls (R) even though they are optional in MASVS.

Status: **Done** (verified), **Server done** (the API side is in place; the app side comes with the app),
**To do** (Linear issue), **N/A** (does not apply, with the reason).

## STORAGE

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-STORAGE-1: stores sensitive data securely | Refresh token in iOS Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) and Android Keystore-backed storage. Access token in memory only. Booking details kept for offline use are encrypted, with `completeFileProtection` on iOS. Nothing sensitive in SharedPreferences/UserDefaults. | Inspect app storage on a rooted/jailbroken test device after sign-in and after a booking | Server done: access tokens die when the session ends (NMX-17). App: NMX-50, NMX-53 |
| MASVS-STORAGE-2: prevents leakage of sensitive data | No phone numbers, codes or tokens in logs or crash reports (Sentry scrubs them). Screens with the table code, venue or tablemates are hidden from the app switcher snapshot. Sign-in code field excluded from keyboard learning. Backups exclude the token store. | Read device logs and Sentry events during a full journey; check the app-switcher image | Server done: Sentry scrubbing (web and API). App: NMX-50, NMX-53 |

## CRYPTO

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-CRYPTO-1: uses current strong cryptography | Only the platform's crypto (Keychain, Keystore, AES-GCM); no custom algorithms. Server: AES-GCM for phone numbers and report text, HMAC for phone lookup, ES256 tokens. | Code review of every crypto call | Server done. App: NMX-53 |
| MASVS-CRYPTO-2: manages keys according to best practices | No keys or secrets in the app binary (the app ships only the public API address). Device keys are hardware-backed and never leave the device. Server keys are sealed with a key-encryption key outside the database. | Search the built app for keys (`strings`, jadx); review the server key loader | Server done (keys.js). App: NMX-53, NMX-55 |

## AUTH

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-AUTH-1: secure authentication and authorization | SMS code sign-in; 15-minute access tokens tied to a session; refresh tokens rotate, and reusing one ends the session; sign-out and account deletion end sessions at once. The server decides every permission (member, admin role, suspended). | API tests: `session.test.mjs`, e2e; try a revoked token | Server done (NMX-17). Production SMS: NMX-23 |
| MASVS-AUTH-2: performs local authentication securely | Optional Face ID / fingerprint unlock, only as a CryptoObject that decrypts the refresh token (never a true/false check that Frida can flip). | Try to bypass with Frida on a test device | Later (after launch) |
| MASVS-AUTH-3: secures sensitive operations with extra authentication | Deleting the account and reporting are confirmed in the app; account deletion asks for a fresh sign-in code before it is sent. | Manual test | To do: NMX-51 |

## NETWORK

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-NETWORK-1: secures all network traffic | HTTPS only (TLS 1.2+); no cleartext exceptions in Android network security config or iOS ATS. Website has HSTS (two years, subdomains). | Proxy the app through mitmproxy without its CA trusted: every request must fail | Web done. App: NMX-53 |
| MASVS-NETWORK-2: pins the identity of its own endpoints | Public-key pinning for the API host with a backup pin; app update path for pin rotation. | mitmproxy with a trusted CA: API requests must still fail | To do: NMX-53 |

## PLATFORM

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-PLATFORM-1: uses IPC securely | Android: only the launcher activity is exported; deep links handled by App Links/Universal Links on herzone.app only, with every parameter validated. iOS: no custom URL scheme for sign-in. | `adb shell dumpsys package`, jadx manifest review; open crafted links | To do: NMX-54 |
| MASVS-PLATFORM-2: uses WebViews securely | Checkout opens in the system browser tab (SFSafariViewController / Custom Tabs), not a WebView; no JavaScript bridge. | Code review | To do: NMX-51 |
| MASVS-PLATFORM-3: uses the user interface securely | Hide sensitive screens in the app switcher; no sensitive data in notifications on the lock screen (wording decided in NMX-21). | Manual test on both systems | To do: NMX-21, NMX-53 |

## CODE

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-CODE-1: requires an up-to-date platform | Minimum iOS and Android versions set to ones that still get security updates. | Build settings review | To do: NMX-48 |
| MASVS-CODE-2: can enforce app updates | The API returns a minimum app version; older apps show "update to continue". | Test with an old build | To do: NMX-61 |
| MASVS-CODE-3: uses components without known vulnerabilities | Dependency scan before every release; the website build already stops on high or critical npm advisories. | `flutter pub outdated`, OSV scan in the build | Web done (build gate). App: NMX-55 |
| MASVS-CODE-4: validates all untrusted input | The server validates every field (documented in the OpenAPI description); the app also validates links, push payloads and deep-link parameters. | API tests; fuzz deep links | Server done. App: NMX-51, NMX-54 |

## RESILIENCE (R, optional in MASVS; HerZone adopts it)

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-RESILIENCE-1: validates platform integrity | Detect rooted/jailbroken devices and emulators; warn the member, and report to the server (never silently block). Play Integrity and App Attest on sign-in. | Run on a rooted device and an emulator | To do: NMX-54 |
| MASVS-RESILIENCE-2: anti-tampering | Release builds signed, signature checked at runtime; Play Integrity / App Attest verdicts checked by the server. | Repackage the APK and run it | To do: NMX-54 |
| MASVS-RESILIENCE-3: anti-static analysis | Flutter release build with `--obfuscate --split-debug-info`; symbols kept privately for Sentry. | Decompile the release build | To do: NMX-54 |
| MASVS-RESILIENCE-4: anti-dynamic analysis | Detect Frida and debuggers in release builds. | Attach Frida to the release build | To do: NMX-54 |

## PRIVACY

| Control | HerZone | How we check | Status |
|---|---|---|---|
| MASVS-PRIVACY-1: minimizes access to sensitive data | No contacts, location tracking, camera, microphone or photo access. Notifications permission asked only after explaining why. | Store privacy labels match the permissions in the build | To do: NMX-58 |
| MASVS-PRIVACY-2: prevents identification of the user | No advertising IDs, no third-party analytics SDKs. Sentry events carry no user ID, IP, phone or request body. | Network capture of a full journey | Web done. App: NMX-50 |
| MASVS-PRIVACY-3: transparent about data collection | Privacy notice says every answer is used for matching (being updated: NMX-25); App Privacy and Data Safety labels match it. | Compare notice, labels and code | To do: NMX-25, NMX-58 |
| MASVS-PRIVACY-4: user control over their data | Delete the account in the app; export of her data and new-device alert. | Manual test | Deletion done. Export and alert: NMX-38 |

## Before each store release

1. Every row above is Done or N/A.
2. Independent security review of the app (NMX-55), using the MASTG tests for each control.
3. The checks in the "How we check" column are run on a release build, not a debug build.
