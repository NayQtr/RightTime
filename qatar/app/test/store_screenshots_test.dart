// Store screenshots (NMX-58) at the sizes App Store Connect and Google Play ask for, in Arabic, with the real fonts.
// Opt-in: HZ_STORE_SHOTS=1 flutter test --update-goldens test/store_screenshots_test.dart
// Output: qatar/docs/store/screenshots/<device>/NN_name.png. The data is the tests' sample data (venue, names).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';

import 'meetups_test.dart' as m show api, bookingId;
import 'onboarding_test.dart' as o;
import 'safety_test.dart' as s show Fake;
import 'screens_golden_test.dart' show loadFonts;
import 'sign_in_flow_test.dart' show config, fakeApi;

const devices = {
  // App Store: 6.9" iPhone, 1320 x 2868 pixels
  'ios-6.9': (w: 440.0, h: 956.0, ratio: 3.0),
  // Google Play: phone, 1080 x 1920 pixels (16:9)
  'android-phone': (w: 360.0, h: 640.0, ratio: 3.0),
};

final skip = Platform.environment['HZ_STORE_SHOTS'] != '1';

void main() {
  setUpAll(loadFonts);

  for (final MapEntry(key: device, value: d) in devices.entries) {
    String out(String name) => '../../docs/store/screenshots/$device/$name.png';
    void size(WidgetTester tester) {
      tester.view.physicalSize = Size(d.w * d.ratio, d.h * d.ratio);
      tester.view.devicePixelRatio = d.ratio;
      addTearDown(tester.view.reset);
    }

    testWidgets('$device: welcome and questionnaire', skip: skip, (tester) async {
      size(tester);
      await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi([])));
      await tester.pumpAndSettle();
      await expectLater(find.byType(MaterialApp), matchesGoldenFile(out('01_welcome')));

      final store = QuizStore.memory();
      await store.write('v4', {'q1': {'o1'}, 'q2': {'o3'}}, 1);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: store, httpClientFactory: o.FakeApi().client));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('start')));
      await tester.pumpAndSettle();
      await expectLater(find.byType(MaterialApp), matchesGoldenFile(out('02_questionnaire')));
    });

    testWidgets('$device: sessions and meetup details', skip: skip, (tester) async {
      size(tester);
      await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => m.api(online: () => true)));
      await tester.pumpAndSettle();
      await expectLater(find.byType(MaterialApp), matchesGoldenFile(out('03_sessions')));
      await tester.tap(find.byKey(const Key('session-s1')));
      await tester.pumpAndSettle();
      await expectLater(find.byType(MaterialApp), matchesGoldenFile(out('04_meetup')));
    });

    testWidgets('$device: private report with the 999 call', skip: skip, (tester) async {
      size(tester);
      final f = s.Fake('completed');
      await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: f.client));
      await tester.pumpAndSettle();
      await tester.tap(find.text('لقاءاتي').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key('booking-${m.bookingId}')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const Key('report')), 200);
      await tester.tap(find.byKey(const Key('report')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('danger')));
      await tester.pumpAndSettle();
      await expectLater(find.byType(MaterialApp), matchesGoldenFile(out('05_safety')));
    });
  }
}
