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
flutter run --dart-define=HZ_ENV=staging   # staging API (default)
flutter build ipa --dart-define=HZ_ENV=production --dart-define=API_BASE=https://pwxxulqgdydrkowmtkia.supabase.co/functions/v1 --dart-define=SENTRY_DSN=https://3fb67a1705758dee095b424fd43737c2@o4512359059488768.ingest.de.sentry.io/4512371282542672
```
Store builds need the Apple and Google developer accounts (NMX-45, NMX-46) and a Mac or a cloud build service for iOS (NMX-47).

Sentry project `herzone-app` (crash-free sessions, NMX-62/NMX-50). A DSN is a public, write-only key, so it can live in this file.
