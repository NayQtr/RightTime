import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/config.dart';
import 'package:herzone/core/link_opener.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/testing.dart';

import 'sign_in_flow_test.dart' show config, j;

void main() {
  test('the version sent to the server is the one in pubspec.yaml', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(RegExp(r'^version: (\S+)$', multiLine: true).firstMatch(pubspec)!.group(1), AppConfig.appVersion);
  });

  testWidgets('every call carries the app version; a 426 replaces the app with the update screen, which opens the store (NMX-61)', (tester) async {
    final versions = <String?>[];
    final links = RecordingLinkOpener();
    await tester.pumpWidget(HerZoneApp(
      config: config,
      tokens: MemoryTokenStore()..token = 'rt_1',
      trips: MemoryTripStore(),
      quizStore: QuizStore.memory(),
      linkOpener: links,
      httpClientFactory: () => MockClient((r) async {
        versions.add(r.headers['X-HerZone-App']);
        return j({
          'code': 'APP_UPDATE_REQUIRED',
          'message': 'يتوفر إصدار أحدث من HerZone. حدّثي التطبيق للمتابعة.',
          'details': [{'field': 'app_version', 'code': 'BELOW_MINIMUM', 'min_version': '1.2.0', 'store_url': 'https://play.google.com/store/apps/details?id=app.herzone'}],
        }, 426);
      }),
    ));
    await tester.pumpAndSettle();
    expect(versions, isNotEmpty);
    expect(versions.every((v) => v != null && v.startsWith('${AppConfig.appVersion} ')), isTrue, reason: '$versions');
    expect(find.text('حدّثي HerZone'), findsOneWidget);
    expect(find.text('يتوفر إصدار أحدث من HerZone. حدّثي التطبيق للمتابعة.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('update')));
    expect(links.opened.single.toString(), 'https://play.google.com/store/apps/details?id=app.herzone');
  });
}
