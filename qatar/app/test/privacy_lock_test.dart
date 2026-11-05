import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/device_unlock.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'meetups_test.dart' show tallScreen;
import 'sign_in_flow_test.dart' show config, j;

MockClient api() => MockClient((r) async => switch (r.url.path) {
      '/api/v1/auth/token:refresh' => j({'access_token': 'at_1', 'refresh_token': 'rt_2'}),
      '/api/v1/users/me' => j({'user': {'id': 'u1', 'status': 'active', 'registration_status': 'complete'}}),
      '/api/v1/questionnaires/current' => j({'questionnaire_version_id': 'v4', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true}),
      '/api/v1/sessions' => j({'sessions': []}),
      '/api/v1/notifications' => j({'notifications': [{'id': 'n1', 'text': 'تم تأكيد طاولتك في لوسيل الخميس 7:30 م.', 'created_at': '2026-11-10T10:00:00+03:00'}]}),
      _ => http.Response('{}', 404),
    });

void main() {
  testWidgets('notification details open only after Face ID / fingerprint, and lock again in the background (NMX-52)', (tester) async {
    tallScreen(tester);
    final unlock = AlwaysUnlock()..allow = false;
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), deviceUnlock: unlock, httpClientFactory: api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('الإشعارات').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('inbox-locked')), findsOneWidget);
    expect(find.textContaining('لوسيل'), findsNothing);

    // failed check: still locked
    await tester.tap(find.byKey(const Key('unlock')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('inbox-locked')), findsOneWidget);

    unlock.allow = true;
    await tester.tap(find.byKey(const Key('unlock')));
    await tester.pumpAndSettle();
    expect(find.textContaining('لوسيل'), findsOneWidget);
    expect(unlock.calls, 2);

    // app goes to the background: locked again
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('privacy-cover')), findsOneWidget, reason: 'the app switcher snapshot shows only the brand');
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('inbox-locked')), findsOneWidget);
    expect(find.byKey(const Key('privacy-cover')), findsNothing);
  });
}
