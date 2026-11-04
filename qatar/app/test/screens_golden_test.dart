// Screenshots of the sign-in screens with the real HerZone fonts, for design review. Opt-in, because pixel output differs
// between machines: HZ_SCREENSHOTS=1 flutter test --update-goldens test/screens_golden_test.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';

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
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), httpClientFactory: () => fakeApi([])));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/phone_ar.png'));
    await tester.enterText(find.byKey(const Key('phone')), '5550 1234');
    await tester.tap(find.byKey(const Key('send')));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/code_ar.png'));
    await tester.pump(const Duration(seconds: 60));
  });
}
