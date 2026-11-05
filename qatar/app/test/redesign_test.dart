import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/design/herzone_tokens.dart';
import 'package:herzone/ui/common/motion.dart';
import 'package:herzone/ui/theme.dart';

import 'meetups_test.dart' show api, bookingId, tallScreen;
import 'sign_in_flow_test.dart' show config;

Widget _host(Widget child, {bool reduceMotion = false}) => MaterialApp(
      theme: herZoneTheme(Brightness.light, 'ar'),
      builder: (context, w) => MediaQuery(data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion), child: w!),
      home: Scaffold(body: child),
    );

void main() {
  testWidgets('my meetups: the next meetup is the one filled card, in the brand colour', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    expect(find.text('لقاؤك القادم'), findsOneWidget);
    final card = tester.widget<Material>(find.byKey(const Key('booking-$bookingId')));
    expect(card.color, HzColors.light.primary);
  });

  testWidgets('home: each session card carries its date as a calendar leaf', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => api(online: () => true)));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('session-s1')), matching: find.text('12')), findsOneWidget, reason: 'the day of the month, Western digits');
    expect(find.descendant(of: find.byKey(const Key('session-s1')), matching: find.text('الخميس')), findsWidgets);
  });

  testWidgets('loading placeholder: it pulses, and stands still when the device asks for reduced motion', (tester) async {
    await tester.pumpWidget(_host(const SkeletonList(label: 'جارٍ التحميل…')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.hasRunningAnimations, true, reason: 'a slow fade while loading');
    await tester.pumpWidget(_host(const SkeletonList(label: 'جارٍ التحميل…'), reduceMotion: true));
    await tester.pumpAndSettle(); // would time out if it kept animating
    expect(find.bySemanticsLabel('جارٍ التحميل…'), findsOneWidget);
  });

  testWidgets('list items rise in one after another, and appear at once under reduced motion', (tester) async {
    double opacityOf(WidgetTester t) => t.widget<FadeTransition>(find.descendant(of: find.byType(RiseIn), matching: find.byType(FadeTransition)).first).opacity.value;
    await tester.pumpWidget(_host(const RiseIn(index: 3, child: Text('x'))));
    expect(opacityOf(tester), lessThan(1), reason: 'starts hidden, arrives after the items before it');
    await tester.pumpAndSettle();
    expect(opacityOf(tester), 1);
    await tester.pumpWidget(_host(const RiseIn(index: 3, child: Text('y')), reduceMotion: true));
    expect(opacityOf(tester), 1, reason: 'no motion when it is not wanted');
  });
}
