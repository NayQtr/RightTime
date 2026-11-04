import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app/app.dart';
import 'core/config.dart';
import 'core/token_store.dart';
import 'data/onboarding.dart';
import 'data/trip_store.dart';

/// Removes phone numbers, tokens and 6-digit codes from text sent to Sentry (same rules as web/monitor.js).
String scrub(String s) => s
    .replaceAll(RegExp(r'eyJ[\w-]+\.[\w-]+\.[\w-]+'), '[token]')
    .replaceAll(RegExp(r'\brt_[\w-]{20,}'), '[token]')
    .replaceAll(RegExp(r'\+?974[\s-]?\d{4}[\s-]?\d{4}'), '[phone]')
    .replaceAll(RegExp(r'(?<![\w-])\d{6}(?![\w-])'), '[code]');

Future<void> main() async {
  const config = AppConfig.fromEnvironment;
  final app = HerZoneApp(config: config, tokens: SecureTokenStore(), trips: SecureTripStore(), quizStore: QuizStore());
  if (config.sentryDsn.isEmpty) return runApp(app);
  // Crash-free sessions (NMX-62) and error reports. No user, IP or request bodies; messages scrubbed.
  await SentryFlutter.init((o) {
    o.dsn = config.sentryDsn;
    o.environment = config.environment;
    o.sendDefaultPii = false;
    o.enableAutoSessionTracking = true;
    o.attachScreenshot = false;
    o.attachViewHierarchy = false;
    o.beforeSend = (event, hint) {
      event.user = null;
      event.request = null;
      for (final e in event.exceptions ?? const <SentryException>[]) {
        if (e.value != null) e.value = scrub(e.value!);
      }
      return event;
    };
  }, appRunner: () => runApp(app));
}
