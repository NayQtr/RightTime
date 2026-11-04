/// Build-time configuration (`--dart-define`). Debug and test runs default to staging. A release build defaults to
/// production, so a store build made without the flags can never reach staging, where the sign-in code may be shown on
/// screen (app review #11). A staging release (internal testing) passes HZ_ENV=staging and the staging API_BASE.
///   flutter build ipa --dart-define=HZ_ENV=production --dart-define=API_BASE=https://pwxxulqgdydrkowmtkia.supabase.co/functions/v1
class AppConfig {
  const AppConfig({required this.apiBase, required this.environment, required this.sentryDsn});

  final String apiBase;
  final String environment;
  final String sentryDsn;

  bool get isStaging => environment != 'production';

  /// This build's version, the same as `version:` in pubspec.yaml (a test keeps them equal). Sent to the server so it
  /// can require an update (NMX-61).
  static const appVersion = '1.0.0+1';

  static const _release = bool.fromEnvironment('dart.vm.product');
  static const stagingApi = 'https://fvodcnqmxskgzziwuwmz.supabase.co/functions/v1';
  static const productionApi = 'https://pwxxulqgdydrkowmtkia.supabase.co/functions/v1';

  static const fromEnvironment = AppConfig(
    apiBase: String.fromEnvironment('API_BASE', defaultValue: _release ? productionApi : stagingApi),
    environment: String.fromEnvironment('HZ_ENV', defaultValue: _release ? 'production' : 'staging'),
    // a DSN is a public, write-only key by design; empty = no error reporting (tests, local runs)
    sentryDsn: String.fromEnvironment('SENTRY_DSN', defaultValue: ''),
  );
}
