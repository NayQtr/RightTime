/// Build-time configuration (`--dart-define`). Defaults point at staging; release builds pass the production values.
///   flutter build ipa --dart-define=HZ_ENV=production --dart-define=API_BASE=https://pwxxulqgdydrkowmtkia.supabase.co/functions/v1
class AppConfig {
  const AppConfig({required this.apiBase, required this.environment, required this.sentryDsn});

  final String apiBase;
  final String environment;
  final String sentryDsn;

  bool get isStaging => environment != 'production';

  static const fromEnvironment = AppConfig(
    apiBase: String.fromEnvironment('API_BASE', defaultValue: 'https://fvodcnqmxskgzziwuwmz.supabase.co/functions/v1'),
    environment: String.fromEnvironment('HZ_ENV', defaultValue: 'staging'),
    // a DSN is a public, write-only key by design; empty = no error reporting (tests, local runs)
    sentryDsn: String.fromEnvironment('SENTRY_DSN', defaultValue: ''),
  );
}
