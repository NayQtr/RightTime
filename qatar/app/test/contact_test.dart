import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/link_opener.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';

import 'meetups_test.dart' show api, tallScreen;
import 'sign_in_flow_test.dart' show config;

void main() {
  testWidgets('request contact: one button; the screen blurs and call and WhatsApp stand one above the other', (tester) async {
    tallScreen(tester);
    final links = RecordingLinkOpener();
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), linkOpener: links, httpClientFactory: () => api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1'))); // the booked session opens its details
    await tester.pumpAndSettle();
    expect(find.text('طلب تواصل'), findsOneWidget);
    expect(find.byKey(const Key('call-coord')), findsNothing, reason: 'one button until she asks');

    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    expect(find.byType(BackdropFilter), findsOneWidget, reason: 'the screen behind blurs');
    expect(find.text('طلب اتصال'), findsOneWidget);
    expect(find.text('التواصل عبر الواتساب'), findsOneWidget);
    final call = tester.getRect(find.byKey(const Key('call-coord')));
    final wa = tester.getRect(find.byKey(const Key('wa-coord')));
    expect(call.bottom, lessThanOrEqualTo(wa.top), reason: 'one above the other');

    await tester.tap(find.byKey(const Key('call-coord')));
    await tester.pumpAndSettle();
    expect(links.opened.single.toString(), 'tel:+97460053006', reason: 'the call opens the phone');
    expect(find.byKey(const Key('call-coord')), findsNothing, reason: 'the sheet closes');

    // closing without choosing leaves nothing opened
    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('contact-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wa-coord')), findsNothing);
    expect(links.opened.length, 1);
  });
}
