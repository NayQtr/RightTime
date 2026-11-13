// App micro-interactions (owner-approved design study item 4, 13 Nov 2026, after Framer): choosing a questionnaire
// option animates its mark and its row; with reduced motion both change at once.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';

import 'onboarding_test.dart' as o;
import 'sign_in_flow_test.dart' show config;

Future<void> openQuiz(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390 * 3, 900 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final store = QuizStore.memory();
  await store.write('v4', {'q1': {'o1'}}, 0);   // the first question: single choice, shown as rows (chips animate natively)
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: store,
      httpClientFactory: o.FakeApi().client));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('start')));
  await tester.pumpAndSettle();
}

Duration markDuration(WidgetTester tester) =>
    tester.widget<AnimatedSwitcher>(find.byWidgetPredicate((w) => w is AnimatedSwitcher && w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('mark-')).first).duration;

void main() {
  testWidgets('an option mark and row animate when chosen', (tester) async {
    await openQuiz(tester);
    expect(markDuration(tester), greaterThan(Duration.zero));
    expect(find.byType(AnimatedContainer), findsWidgets);
  });

  testWidgets('with reduced motion they change at once', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await openQuiz(tester);
    expect(markDuration(tester), Duration.zero);
  });
}
