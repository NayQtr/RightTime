// Provisional items of 10 Nov in the app: the nameless celebration line for the other women at a revealed table (33),
// the meetup time without "Asia/Qatar" (28), and the next step after the generic error (13d-2). The welcome screen says
// nothing about one country any more (owner, 11 Nov 2026). The website has the same (qatar/api/test/booking-ui.test.mjs).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/api_error.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/l10n/app_localizations.dart';
import 'package:herzone/ui/auth/widgets.dart' show errorText;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'meetups_test.dart' show api, bookingId, details, tallScreen;
import 'sign_in_flow_test.dart' show config, fakeApi, j;

/// The meetups fake, with the event details changed by [edit].
MockClient withDetails(void Function(Map<String, dynamic> d) edit) {
  final base = api(online: () => true);
  return MockClient((r) async {
    if (r.url.path == '/api/v1/bookings/$bookingId/event-details') {
      final d = details();
      edit(d);
      return j(d);
    }
    final copy = http.Request(r.method, r.url)..headers.addAll(r.headers);
    if (r.body.isNotEmpty) copy.body = r.body;
    return http.Response.fromStream(await base.send(copy));
  });
}

Future<void> openDetails(WidgetTester tester, MockClient client) async {
  tallScreen(tester);
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => client));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('session-s1')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('welcome: nothing is said about one country any more', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi([])));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('qatar-only')), findsNothing);
    expect(find.textContaining('قطر فقط'), findsNothing);
    final y = tester.getTopLeft(find.text('أسئلة قصيرة تأخذ دقائق قليلة.')).dy;
    expect(tester.getTopLeft(find.byKey(const Key('start'))).dy < y && y < tester.getTopLeft(find.byKey(const Key('have-account'))).dy, true,
        reason: 'the length hint still sits between Start and I have an account');
  });

  testWidgets('revealed table: a birthday at the table reads as a nameless line with the cake icon; the time has no "Asia/Qatar"', (tester) async {
    await openDetails(tester, withDetails((d) => (d['table'] as Map<String, dynamic>)['celebration'] = 'birthday'));
    expect(find.byKey(const Key('celebration')), findsOneWidget);
    expect(find.text('إحدى الضيفات تحتفل بعيد ميلادها'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('celebration')), matching: find.byIcon(Icons.cake_outlined)), findsOneWidget);
    expect(find.textContaining('Asia/Qatar'), findsNothing);
    expect(find.text('الموعد'), findsOneWidget, reason: 'the time label alone, as on the website');
  });

  testWidgets('revealed table: another occasion reads as its own line with the sparkle icon', (tester) async {
    await openDetails(tester, withDetails((d) => (d['table'] as Map<String, dynamic>)['celebration'] = 'other'));
    expect(find.text('إحدى الضيفات تحتفل بمناسبة خاصة'), findsOneWidget);
    expect(find.byIcon(Icons.auto_awesome_outlined), findsOneWidget);
  });

  testWidgets('no celebration at the table: no line', (tester) async {
    await openDetails(tester, withDetails((d) {})); // the table carries no celebration
    expect(find.byKey(const Key('venue')), findsOneWidget);
    expect(find.byKey(const Key('celebration')), findsNothing);
  });

  test('the generic error gets its next step (ours or the server\'s same words); other messages stay as they are', () {
    for (final (code, generic, next, other) in [
      ('ar', 'حدث خطأ. حاولي مرة أخرى.', 'إن تكرّر الخطأ، تواصلي معنا.', 'الرمز غير صحيح.'),
      ('en', 'Something went wrong. Please try again.', 'If it happens again, contact us.', 'That code isn\'t correct.'),
    ]) {
      final t = lookupAppLocalizations(Locale(code));
      expect(errorText(t, const ApiError(status: 500, code: 'INTERNAL', message: '')), '$generic $next');
      expect(errorText(t, ApiError(status: 500, code: 'INTERNAL', message: generic)), '$generic $next');
      expect(errorText(t, ApiError(status: 400, code: 'OTP_INVALID', message: other)), other);
      expect(errorText(t, ApiError.offline), t.offline);
    }
  });
}
