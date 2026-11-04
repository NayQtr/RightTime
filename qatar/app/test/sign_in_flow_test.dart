import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/config.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/main.dart' show scrub;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const config = AppConfig(apiBase: 'https://api.test', environment: 'staging', sentryDsn: '');

http.Response j(Object body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

/// A small fake of the HerZone API: OTP request/verify, refresh, me, logout.
MockClient fakeApi(List<String> log) => MockClient((r) async {
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
        case '/api/v1/auth/logout':
          return http.Response('', 204);
      }
      return j({'code': 'NOT_FOUND'}, 404);
    });

void main() {
  testWidgets('Arabic first: sign in with a Qatar number and the code, land on the tabs, switch to English (LTR), sign out', (tester) async {
    final log = <String>[];
    final store = MemoryTokenStore();
    await tester.pumpWidget(HerZoneApp(config: config, tokens: store, httpClientFactory: () => fakeApi(log)));
    await tester.pumpAndSettle();

    // phone screen, right to left
    expect(find.text('رقم جوالك'), findsOneWidget);
    expect(Directionality.of(tester.element(find.text('رقم جوالك'))), TextDirection.rtl);
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
    // English switches the whole app to left to right
    await tester.tap(find.byKey(const Key('lang')));
    await tester.pumpAndSettle();
    expect(find.text('Account'), findsWidgets);
    expect(Directionality.of(tester.element(find.text('Sign out'))), TextDirection.ltr);
    await tester.tap(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    expect(log, contains('POST /api/v1/auth/logout'));
    expect(store.token, isNull);
    expect(find.text('Your mobile number'), findsOneWidget);
    // the resend countdown timer must not outlive the test
    await tester.pump(const Duration(seconds: 60));
  });

  test('Sentry text is scrubbed of phone numbers, tokens and codes', () {
    expect(scrub('user +974 5550 1234 code 482913 jwt eyJhbGc.eyJzdWIi.c2ln'), 'user [phone] code [code] jwt [token]');
  });
}
