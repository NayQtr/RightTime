// A meetup opened from its card grows out of that card (owner-approved design study item 2, 13 Nov 2026, after Apple's
// spatial continuity): the details route scales up from the card's centre. With reduced motion it simply appears.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/ui/common/card_origin.dart';

import 'meetups_test.dart' as m show api, bookingId;
import 'sign_in_flow_test.dart' show config;

Future<void> openFromCard(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390 * 3, 900 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(),
      quizStore: QuizStore.memory(), httpClientFactory: () => m.api(online: () => true)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('session-s1')));   // s1 is her booked meetup
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 60));
}

void main() {
  testWidgets('the details grow out of the tapped card, from its centre', (tester) async {
    await openFromCard(tester);
    final zoom = find.byType(CardZoomTransition);
    expect(zoom, findsOneWidget);
    expect(find.byKey(const ValueKey('card-zoom-scale')), findsOneWidget);
    final card = tester.getRect(find.byKey(const Key('session-s1')));
    final origin = tester.widget<CardZoomTransition>(zoom).origin.rect;
    expect((origin.center - card.center).distance, lessThan(1));
    await tester.pumpAndSettle();
    expect(find.textContaining('RT-ABC123'), findsWidgets);   // the details page opened
    expect(m.bookingId, isNotEmpty);
  });

  testWidgets('with reduced motion the details simply appear', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await openFromCard(tester);
    expect(find.byType(CardZoomTransition), findsOneWidget);
    expect(find.byKey(const ValueKey('card-zoom-scale')), findsNothing);
    await tester.pumpAndSettle();
    expect(find.textContaining('RT-ABC123'), findsWidgets);
  });
}
