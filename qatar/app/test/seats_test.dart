// Seats left (owner's decision of 13 Nov 2026, from the MUJI restraint study): a session card shows the count only
// when 3 or fewer seats are left; a session with plenty of room says nothing about seats.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'meetups_test.dart' as m show api;
import 'sign_in_flow_test.dart' show config, j;

http.Client api() {
  final inner = m.api(online: () => true);
  return MockClient((r) async {
    if (r.url.path == '/api/v1/sessions') {
      return j({'sessions': [
        {'id': 'roomy', 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true, 'starts_at': '2026-11-20T19:30:00+03:00', 'district': 'لوسيل', 'seats_left': 18, 'is_full': false, 'my_booking_id': null},
        {'id': 'few', 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true, 'starts_at': '2026-11-21T19:30:00+03:00', 'district': 'مشيرب', 'seats_left': 3, 'is_full': false, 'my_booking_id': null},
      ]});
    }
    return inner.send(http.Request(r.method, r.url)..headers.addAll(r.headers)..body = r.body).then(http.Response.fromStream);
  });
}

String cardText(WidgetTester tester, String id) => tester
    .widgetList<Text>(find.descendant(of: find.byKey(Key('session-$id')), matching: find.byType(Text)))
    .map((w) => w.data ?? '')
    .join(' | ');

void main() {
  for (final (lang, few, any) in [('ar', '3 مقاعد متبقية', 'متبقية'), ('en', '3 seats left', 'seats left')]) {
    testWidgets('$lang: only the session with 3 seats left shows the count', (tester) async {
      tester.view.physicalSize = const Size(390 * 3, 1400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(),
          quizStore: QuizStore.memory(), httpClientFactory: api));
      await tester.pumpAndSettle();
      if (lang == 'en') {
        Provider.of<LocaleController>(tester.element(find.byType(Navigator).first), listen: false).toggle();
        await tester.pumpAndSettle();
      }
      expect(find.byKey(const Key('session-roomy')), findsOneWidget);
      expect(cardText(tester, 'roomy'), isNot(contains(any)));
      expect(cardText(tester, 'few'), contains(few));
    });
  }
}
