import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/testing.dart';

import 'sign_in_flow_test.dart' show config, fakeHandler, j;

void main() {
  testWidgets('Decisions about you: the decision in words, the appeal date, and the appeal is sent once', (tester) async {
    final log = <String>[];
    final base = fakeHandler(log);
    await tester.pumpWidget(HerZoneApp(
      config: config,
      tokens: MemoryTokenStore()..token = 'rt_1',
      trips: MemoryTripStore(),
      quizStore: QuizStore.memory(),
      httpClientFactory: () => MockClient((r) async {
        if (r.url.path == '/api/v1/cases/mine') {
          log.add('GET cases');
          return j({'cases': [
            {'case_ref': 'TS-2026-0007', 'event_date': '2026-11-12T19:30:00+03:00', 'category': 'harassment', 'decision': 'warning',
             'decision_label': 'تنبيه', 'status': 'actioned', 'appeal_until': '2026-11-26T19:30:00+03:00', 'can_appeal': true},
          ]});
        }
        if (r.url.path == '/api/v1/cases/TS-2026-0007/appeal') {
          log.add('POST appeal ${r.headers['Idempotency-Key'] != null}');
          return j({'case_ref': 'TS-2026-0007', 'status': 'appealed'}, 202);
        }
        if (r.url.path == '/api/v1/auth/token:refresh') return j({'access_token': 'at_1', 'refresh_token': 'rt_1', 'token_type': 'Bearer', 'expires_in': 900});
        return base(r);
      }),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cases')));
    await tester.pumpAndSettle();
    expect(find.text('تنبيه'), findsOneWidget, reason: 'the decision in words, not the code');
    expect(find.textContaining('تحرش'), findsOneWidget, reason: 'the category in words');
    expect(find.textContaining('يمكنكِ الاعتراض حتى'), findsOneWidget);
    await tester.tap(find.byKey(const Key('appeal-TS-2026-0007')));
    await tester.pumpAndSettle();
    expect(log, contains('POST appeal true'));
    expect(find.byKey(const Key('appeal-sent')), findsOneWidget);
    expect(find.byKey(const Key('appeal-TS-2026-0007')), findsNothing, reason: 'no second appeal from the same screen');
  });
}
