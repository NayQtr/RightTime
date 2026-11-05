// Screenshots of the sign-in screens with the real HerZone fonts, for design review. Opt-in, because pixel output differs
// between machines: HZ_SCREENSHOTS=1 flutter test --update-goldens test/screens_golden_test.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';

import 'meetups_test.dart' as m;
import 'onboarding_test.dart' as o;
import 'sign_in_flow_test.dart' show config, fakeApi;

Future<void> loadFonts() async {
  for (final (family, files) in [
    ('Alexandria', ['Alexandria-600', 'Alexandria-700', 'Alexandria-800']),
    ('IBM Plex Sans Arabic', ['IBMPlexSansArabic-400', 'IBMPlexSansArabic-500', 'IBMPlexSansArabic-600']),
  ]) {
    final loader = FontLoader(family);
    for (final f in files) {
      loader.addFont(Future.value(ByteData.sublistView(File('assets/fonts/$f.ttf').readAsBytesSync())));
    }
    await loader.load();
  }
  final icons = FontLoader('MaterialIcons')
    ..addFont(Future.value(ByteData.sublistView(File('${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytesSync())));
  await icons.load();
}

void main() {
  setUpAll(loadFonts);

  testWidgets('phone and code screens (Arabic, 390x844)', skip: Platform.environment['HZ_SCREENSHOTS'] != '1', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi([])));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/welcome_ar.png'));
    await tester.tap(find.byKey(const Key('have-account')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/phone_ar.png'));
    await tester.enterText(find.byKey(const Key('phone')), '5550 1234');
    await tester.tap(find.byKey(const Key('send')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/code_ar.png'));
    await tester.pump(const Duration(seconds: 60));
  });

  testWidgets('home and meetup details (Arabic, 390x844)', skip: Platform.environment['HZ_SCREENSHOTS'] != '1', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/home_ar.png'));
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/details_ar.png'));
  });

  testWidgets('questionnaire (Arabic, 390x844)', skip: Platform.environment['HZ_SCREENSHOTS'] != '1', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final store = QuizStore.memory();
    await store.write('v4', {'q1': {'o1'}, 'q2': {'o3'}}, 1);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: store, httpClientFactory: o.FakeApi().client));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/quiz_chips_ar.png'));
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/quiz_list_ar.png'));
  });
}
