# HerZone app (Flutter)

iPhone and Android app for HerZone, on the same API as herzone.app (`qatar/api`, described in `qatar/api/openapi/openapi.json`).

## Layout
- `lib/core`: configuration (`--dart-define`), the API client (access token in memory, refresh token in the Keychain / Keystore, one refresh at a time, Idempotency-Key on writes) and errors.
- `lib/data`: repositories over the API (sign-in, the signed-in member).
- `lib/domain`: app-wide state (`Session`, `LocaleController`), as ChangeNotifiers.
- `lib/ui`: screens and their view models; `ui/theme.dart` builds the theme from `lib/design/herzone_tokens.dart`, which is generated from `qatar/design/tokens.json` (run `python3 qatar/design/build_tokens_dart.py`).
- `lib/app`: wiring (provider) and routes (go_router). The session decides the route: splash, sign-in, or the four tabs.
- `lib/l10n`: Arabic (default, right to left) and English strings.

## Run
```
flutter test                      # unit and widget tests
flutter analyze
HZ_SCREENSHOTS=1 flutter test --update-goldens test/screens_golden_test.dart   # screenshots in test/goldens
flutter run --dart-define=HZ_ENV=staging   # staging API (default for debug runs; release builds default to production)
flutter build ipa --dart-define=HZ_ENV=production --dart-define=API_BASE=https://pwxxulqgdydrkowmtkia.supabase.co/functions/v1 --dart-define=SENTRY_DSN=https://3fb67a1705758dee095b424fd43737c2@o4512359059488768.ingest.de.sentry.io/4512371282542672
```
Once the payment provider is chosen (NMX-24), add its checkout host to the link allowlist: `--dart-define=LINK_HOSTS=pay.example.com`. Links to any other host are refused.

Release builds always obfuscate the Dart code and keep the symbols out of the app (for Sentry):
```
flutter build appbundle --obfuscate --split-debug-info=build/symbols --dart-define=HZ_ENV=production ...
flutter build ipa       --obfuscate --split-debug-info=build/symbols --dart-define=HZ_ENV=production ...
```

Security settings already in the project (MASVS, `qatar/docs/masvs-herzone.md`):
- Android: no backups, HTTPS only, only system certificate authorities (`res/xml/network_security_config.xml`), code shrinking in release.
- iOS: tokens and saved meetups in the Keychain, this device only (never iCloud).
- Both: access token in memory only; notifications behind Face ID / fingerprint; the app switcher shows only the brand.

Store builds need the Apple and Google developer accounts (NMX-45, NMX-46) and a Mac or a cloud build service for iOS (NMX-47).

Sentry project `herzone-app` (crash-free sessions, NMX-62/NMX-50). A DSN is a public, write-only key, so it can live in this file.

## Journey tests (Maestro, NMX-56)

`.maestro/` drives the real app against **staging** (never production): the sign-in code is read from the screen and payment uses the mock page.

- `01_onboarding.yaml`: questionnaire → phone and code → sign-up → tabs → locked notifications → sign out and back in → delete the account.
- `02_book_pay_meetup.yaml`: book → pay (mock) → meetup details → offline copy (Android) → "I'm in danger now" shows the 999 call (never tapped) → cancel with the refund shown first → delete the account.

Each run uses a new random Qatar number and deletes its account at the end. Flow 02 needs an open Arabic staging session with free seats.

```sh
flutter build apk --debug --dart-define=HZ_ENV=staging && adb install build/app/outputs/flutter-apk/app-debug.apk
maestro test .maestro
```

Or on GitHub: Actions → "App journey (Maestro)" → Run workflow (Android 14 emulator; manual only).

Elements the flows use carry a stable id (`TestId`, `lib/ui/common/test_id.dart`): `resource-id` on Android and `accessibilityIdentifier` on iOS, the same names as the widget keys in the Flutter tests. Buttons are found by their Arabic text.
