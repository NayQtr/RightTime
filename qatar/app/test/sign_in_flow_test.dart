import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/config.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/main.dart' show scrub, scrubEvent;
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const config = AppConfig(apiBase: 'https://api.test', environment: 'staging', sentryDsn: '');

http.Response j(Object body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

/// A small fake of the HerZone API: OTP request/verify, refresh, me, logout.
MockClient fakeApi(List<String> log) => MockClient(fakeHandler(log));

Future<http.Response> Function(http.Request) fakeHandler(List<String> log) => (r) async {
      log.add('${r.method} ${r.url.path}');
      final body = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
      switch (r.url.path) {
        case '/api/v1/auth/otp:request':
          return j({'challenge_id': '11111111-1111-4111-8111-111111111111', 'expires_in': 300, 'resend_after': 45, 'code_length': 6, 'dev_code': '482913'}, 202);
        case '/api/v1/auth/otp:verify':
          return body['code'] == '482913'
              ? j({'access_token': 'at_1', 'refresh_token': 'rt_1', 'token_type': 'Bearer', 'expires_in': 900})
              : j({'code': 'OTP_INVALID', 'message': 'الرمز غير صحيح.'}, 400);
        case '/api/v1/users/me':
          return r.headers['Authorization'] == 'Bearer at_1'
              ? j({'user': {'id': 'u1', 'display_name': 'مريم', 'status': 'active', 'registration_status': 'complete'}})
              : j({'code': 'UNAUTHENTICATED'}, 401);
        case '/api/v1/questionnaires/current':
          return j({'questionnaire_version_id': 'v1', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true});
        case '/api/v1/auth/logout':
          return http.Response('', 204);
        case '/api/v1/legal/current':
          return j({
            'terms': {'document_version': 'terms-1', 'required': true, 'text': 'نص الشروط'},
            'conduct': {'document_version': 'conduct-1', 'required': true, 'text': 'نص قواعد السلوك'},
            'privacy_notice': {'document_version': 'privacy-1', 'required': true, 'text': 'نص إشعار الخصوصية'},
            'marketing': {'document_version': 'marketing-1', 'required': false, 'text': 'تسويق'},
          });
        case '/api/v1/auth/token:refresh':
          return j({'access_token': 'at_1', 'refresh_token': 'rt_1', 'token_type': 'Bearer', 'expires_in': 900});
      }
      if (r.method == 'DELETE' && r.url.path == '/api/v1/users/me') return j({'status': 'deletion_requested'}, 202);
      return j({'code': 'NOT_FOUND'}, 404);
    };

void main() {
  testWidgets('Arabic first: sign in with a Qatar number and the code, land on the tabs, switch to English (LTR), sign out', (tester) async {
    final log = <String>[];
    final store = MemoryTokenStore();
    await tester.pumpWidget(HerZoneApp(config: config, tokens: store, trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi(log)));
    await tester.pumpAndSettle();

    // welcome, then "I have an account" opens the phone screen, right to left
    await tester.tap(find.byKey(const Key('have-account')));
    await tester.pumpAndSettle();
    expect(find.text('رقم جوالك'), findsOneWidget);
    expect(Directionality.of(tester.element(find.text('رقم جوالك'))), TextDirection.rtl);
    // the ids Maestro uses (NMX-56) are on the screen
    final semantics = tester.ensureSemantics();
    expect(find.bySemanticsIdentifier('phone'), findsOneWidget);
    semantics.dispose();
    await tester.enterText(find.byKey(const Key('phone')), '1234');
    await tester.tap(find.byKey(const Key('send')));
    await tester.pumpAndSettle();
    expect(find.text('أدخلي 8 أرقام تبدأ بأحد الأرقام من 3 إلى 7.'), findsOneWidget);
    expect(log, isEmpty, reason: 'an invalid number is not sent');

    await tester.enterText(find.byKey(const Key('phone')), '5550 1234');
    await tester.tap(find.byKey(const Key('send')));
    await tester.pumpAndSettle();
    expect(find.text('أدخلي الرمز'), findsOneWidget);
    expect(find.text('+974 5550 1234'), findsOneWidget);
    expect(find.byKey(const Key('devCode')), findsOneWidget);

    // a wrong code shows the server's message; the right one signs in
    await tester.enterText(find.byKey(const Key('code')), '000000');
    await tester.pumpAndSettle();
    expect(find.text('الرمز غير صحيح.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('code')), '482913');
    await tester.pumpAndSettle();
    expect(find.text('الرئيسية'), findsWidgets);
    expect(store.token, 'rt_1', reason: 'refresh token in the secure store; access token in memory only');

    // account tab: sign out ends the session on the server and returns to sign-in
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    expect(find.text('مريم'), findsOneWidget);
    // light or dark by choice: one tap switches the whole app, the next switches back
    Brightness shown() => Theme.of(tester.element(find.byKey(const Key('theme')))).brightness;
    expect(shown(), Brightness.light);
    await tester.tap(find.byKey(const Key('theme')));
    await tester.pumpAndSettle();
    expect(shown(), Brightness.dark);
    expect(find.text('الوضع العادي'), findsOneWidget);
    await tester.tap(find.byKey(const Key('theme')));
    await tester.pumpAndSettle();
    expect(shown(), Brightness.light);
    expect(find.text('الوضع الداكن'), findsOneWidget);
    // English switches the whole app to left to right
    await tester.tap(find.byKey(const Key('lang')));
    await tester.pumpAndSettle();
    expect(find.text('Account'), findsWidgets);
    expect(Directionality.of(tester.element(find.text('Sign out'))), TextDirection.ltr);
    await tester.tap(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    expect(log, contains('POST /api/v1/auth/logout'));
    expect(store.token, isNull);
    expect(find.text('Meet people who get you.'), findsOneWidget, reason: 'back to the welcome screen, in English');
    // the resend countdown timer must not outlive the test
    await tester.pump(const Duration(seconds: 60));
  });

  testWidgets('account deletion from inside the app (store rule): confirm first, server first, then the device is wiped', (tester) async {
    final log = <String>[];
    final store = MemoryTokenStore()..token = 'rt_1';
    final trips = MemoryTripStore();
    await trips.save('b1', {'id': 'b1', 'venue': 'x'});
    await tester.pumpWidget(HerZoneApp(config: config, tokens: store, trips: trips, quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi(log)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();

    // "keep my account" sends nothing
    await tester.ensureVisible(find.byKey(const Key('deleteAccount'))); // the last item on a longer profile
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('deleteAccount')));
    await tester.pumpAndSettle();
    expect(find.text('سنحذف بياناتك وفق سياسة الاحتفاظ. هل أنتِ متأكدة؟'), findsOneWidget);
    await tester.tap(find.byKey(const Key('deleteNo')));
    await tester.pumpAndSettle();
    expect(log, isNot(contains('DELETE /api/v1/users/me')));
    expect(store.token, 'rt_1');

    await tester.ensureVisible(find.byKey(const Key('deleteAccount'))); // the last item on a longer profile
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('deleteAccount')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('deleteYes')));
    await tester.pumpAndSettle();
    expect(log, contains('DELETE /api/v1/users/me'));
    expect(store.token, isNull);
    expect(trips.trips, isEmpty, reason: 'saved meetup details leave the device with the account');
    expect(find.byKey(const Key('have-account')), findsOneWidget, reason: 'back to the welcome screen');
  });

  testWidgets('sign-out also forgets unsent quiz answers on this device (app review #5)', (tester) async {
    final log = <String>[];
    final store = MemoryTokenStore()..token = 'rt_1';
    final quiz = QuizStore.memory();
    await quiz.write('v1', {'q1': {'o1'}}, 1);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: store, trips: MemoryTripStore(), quizStore: quiz, httpClientFactory: () => fakeApi(log)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    expect(await quiz.read(), isNull);
  });

  testWidgets('a server error while loading her profile is not shown as signed out, and keeps her session (app review #6)', (tester) async {
    final log = <String>[];
    final store = MemoryTokenStore()..token = 'rt_1';
    await tester.pumpWidget(HerZoneApp(config: config, tokens: store, trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => MockClient((r) async {
      log.add('${r.method} ${r.url.path}');
      if (r.url.path == '/api/v1/auth/token:refresh') return j({'access_token': 'at_1', 'refresh_token': 'rt_1', 'token_type': 'Bearer', 'expires_in': 900});
      return j({'code': 'INTERNAL'}, 500);
    })));
    await tester.pumpAndSettle();
    expect(store.token, 'rt_1');
    expect(find.byKey(const Key('have-account')), findsNothing, reason: 'not the signed-out welcome screen');
  });

  testWidgets('the privacy notice, terms and code of conduct open from Account (App Store 5.1.1(i))', (tester) async {
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi([])));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('documents')));
    await tester.pumpAndSettle();
    expect(find.text('الشروط'), findsOneWidget);
    expect(find.text('قواعد السلوك'), findsOneWidget);
    expect(find.byKey(const Key('open-marketing')), findsNothing, reason: 'marketing is a choice, not a document to read here');
    await tester.tap(find.byKey(const Key('open-privacy_notice')));
    await tester.pumpAndSettle();
    expect(find.text('نص إشعار الخصوصية'), findsOneWidget);
  });

  test('Sentry text is scrubbed of phone numbers, tokens and codes', () {
    expect(scrub('user +974 5550 1234 code 482913 jwt eyJhbGc.eyJzdWIi.c2ln'), 'user [phone] code [code] jwt [token]');
    expect(scrub('local 5550 1234 or 55501234, table T03'), 'local [phone] or [phone], table [table]');
    expect(scrub('booking 2b9c1f0e-1111-4111-8111-111111111111 at 19:30'), 'booking 2b9c1f0e-1111-4111-8111-111111111111 at 19:30');
  });

  test('the whole error report is scrubbed: message, exceptions and breadcrumbs (app review #9)', () {
    final e = scrubEvent(SentryEvent(
      message: SentryMessage('failed for 5550 1234', template: 'failed for %s', params: ['5550 1234']),
      exceptions: [SentryException(type: 'X', value: 'code 482913')],
      breadcrumbs: [Breadcrumb(message: 'typed 6601 2345', data: {'phone': '+97455501234', 'nested': {'t': 'T07'}})],
      user: SentryUser(id: 'u1'),
    ));
    expect(e.user, isNull);
    expect(e.message!.formatted, 'failed for [phone]');
    expect(e.message!.params, isNull);
    expect(e.exceptions!.single.value, 'code [code]');
    expect(e.breadcrumbs!.single.message, 'typed [phone]');
    expect(e.breadcrumbs!.single.data, {'phone': '[phone]', 'nested': {'t': '[table]'}});
  });
}
