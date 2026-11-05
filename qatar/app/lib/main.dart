import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app/app.dart';
import 'core/config.dart';
import 'core/install_marker.dart';
import 'core/link_opener.dart';
import 'core/token_store.dart';
import 'data/onboarding.dart';
import 'data/trip_store.dart';

/// Removes phone numbers (international and local), tokens, 6-digit codes and table codes from text sent to Sentry
/// (same rules as web/monitor.js, plus local numbers and table codes: app review #9).
String scrub(String s) => s
    .replaceAll(RegExp(r'eyJ[\w-]+\.[\w-]+\.[\w-]+'), '[token]')
    .replaceAll(RegExp(r'\brt_[\w-]{20,}'), '[token]')
    .replaceAll(RegExp(r'\+?974[\s-]?\d{4}[\s-]?\d{4}'), '[phone]')
    .replaceAll(RegExp(r'(?<![\w-])[3-7]\d{3}[\s-]?\d{4}(?![\w-])'), '[phone]')
    .replaceAll(RegExp(r'(?<![\w-])\d{6}(?![\w-])'), '[code]')
    .replaceAll(RegExp(r'\bT\d{2,3}\b'), '[table]');

Object? _scrubValue(Object? v) => switch (v) {
      String s => scrub(s),
      Map m => m.map((k, x) => MapEntry(k, _scrubValue(x))),
      List l => l.map(_scrubValue).toList(),
      _ => v,
    };

/// Scrubs a breadcrumb's message and data (navigation, HTTP and console breadcrumbs travel with every event).
Breadcrumb? scrubBreadcrumb(Breadcrumb? b) {
  if (b == null) return null;
  if (b.message != null) b.message = scrub(b.message!);
  if (b.data != null) b.data = b.data!.map((k, v) => MapEntry(k, _scrubValue(v)));
  return b;
}

/// Everything in an error report that can carry free text: no user, no request, scrubbed message, exceptions and
/// breadcrumbs.
SentryEvent scrubEvent(SentryEvent event) {
  event.user = null;
  event.request = null;
  final m = event.message;
  if (m != null) {
    m.formatted = scrub(m.formatted);
    if (m.template != null) m.template = scrub(m.template!);
    m.params = null;
  }
  for (final e in event.exceptions ?? const <SentryException>[]) {
    if (e.value != null) e.value = scrub(e.value!);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).whereType<Breadcrumb>().toList();
  return event;
}

Future<void> main() async {
  const config = AppConfig.fromEnvironment;
  WidgetsFlutterBinding.ensureInitialized();
  final tokens = SecureTokenStore(), trips = SecureTripStore(), quiz = QuizStore();
  await wipeAfterReinstall(PrefsInstallMarker(), [tokens.clear, trips.clear, quiz.clear]);
  final app = HerZoneApp(config: config, tokens: tokens, trips: trips, quizStore: quiz, linkOpener: LinkOpener(extraHosts: LinkOpener.hostsFromEnvironment()));
  if (config.sentryDsn.isEmpty) return runApp(app);
  // Crash-free sessions (NMX-62) and error reports. No user, IP or request bodies; messages scrubbed.
  await SentryFlutter.init((o) {
    o.dsn = config.sentryDsn;
    o.environment = config.environment;
    o.sendDefaultPii = false;
    o.enableAutoSessionTracking = true;
    o.attachScreenshot = false;
    o.attachViewHierarchy = false;
    o.beforeSend = (event, hint) => scrubEvent(event);
    o.beforeBreadcrumb = (b, hint) => scrubBreadcrumb(b);
  }, appRunner: () => runApp(app));
}
