import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/api_error.dart';
import 'package:herzone/core/sounds.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/l10n/app_localizations.dart';
import 'package:herzone/ui/auth/widgets.dart';
import 'package:herzone/ui/common/loader.dart';
import 'package:herzone/ui/common/press.dart';
import 'package:herzone/ui/common/sound_on_show.dart';
import 'package:herzone/ui/theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'meetups_test.dart' show api, tallScreen;
import 'screens_golden_test.dart' show loadFonts;
import 'sign_in_flow_test.dart' show config, fakeApi;

/// Interface sounds (design phase 7, item 26): which moment plays which sound, the Sounds switch, and the files.
class Recorder implements SoundOutput {
  final played = <UiSound>[];
  @override
  Future<void> play(UiSound sound) async => played.add(sound);
}

Widget host(Widget child) => MaterialApp(
      theme: herZoneTheme(Brightness.light, 'ar'),
      locale: const Locale('ar'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      home: Scaffold(body: child),
    );

void main() {
  late Recorder rec;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    rec = Recorder();
    Sounds.instance = Sounds(output: rec);
  });

  test('every sound has its file in assets/sounds, and each file is small', () {
    expect(UiSound.values, hasLength(11));
    for (final s in UiSound.values) {
      final f = File('assets/sounds/${s.file}');
      expect(f.existsSync(), isTrue, reason: s.file);
      expect(f.lengthSync(), lessThan(40 * 1024), reason: s.file);
    }
  });

  test('on by default; off is remembered on the device and silences everything; the switch itself is heard', () async {
    final s = Sounds(output: rec);
    expect(s.enabled, isTrue);
    s.setEnabled(false);
    s.play(UiSound.tap);
    expect(rec.played, [UiSound.toggleOff]);
    await Future<void>.delayed(Duration.zero);
    expect((await SharedPreferences.getInstance()).getBool('sounds'), isFalse);
    final again = Sounds(output: rec);
    await again.load();
    expect(again.enabled, isFalse);
    again.setEnabled(true);
    expect(rec.played.last, UiSound.toggleOn);
  });

  test('a sound that cannot play stays quiet', () async {
    final s = Sounds(output: _Broken());
    s.play(UiSound.tap); // no throw, no unhandled error
    await Future<void>.delayed(Duration.zero);
  });

  test('notification sound only for a notification newer than the newest she saw; sign-out forgets it', () async {
    final s = Sounds(output: rec);
    await s.noticesSeen('2026-11-10T10:00:00Z');
    expect(rec.played, isEmpty, reason: 'nothing to compare with the first time');
    await s.noticesSeen('2026-11-10T10:00:00Z');
    expect(rec.played, isEmpty);
    await s.noticesSeen('2026-11-10T11:00:00Z');
    expect(rec.played, [UiSound.notify]);
    await s.forgetDevice();
    await s.noticesSeen('2026-11-10T12:00:00Z');
    expect(rec.played, [UiSound.notify]);
  });

  testWidgets('tap on releasing a button, none for a disabled one; error banner; confirmation', (tester) async {
    await tester.pumpWidget(host(Column(children: [
      Press(child: FilledButton(key: const Key('on'), onPressed: () {}, child: const Text('on'))),
      const Press(child: FilledButton(key: Key('off'), onPressed: null, child: Text('off'))),
    ])));
    await tester.tap(find.byKey(const Key('on')));
    await tester.tap(find.byKey(const Key('off')), warnIfMissed: false);
    expect(rec.played, [UiSound.tap]);

    rec.played.clear();
    const e1 = ApiError(status: 0, code: 'X', message: 'one'), e2 = ApiError(status: 0, code: 'Y', message: 'two');
    await tester.pumpWidget(host(const ErrorBanner(e1)));
    await tester.pumpWidget(host(const ErrorBanner(e1)));
    await tester.pumpWidget(host(const ErrorBanner(e2)));
    expect(rec.played, [UiSound.error, UiSound.error]);

    rec.played.clear();
    await tester.pumpWidget(host(const SoundOnShow(child: Text('paid'))));
    await tester.pumpWidget(host(const SoundOnShow(child: Text('paid'))));
    expect(rec.played, [UiSound.success]);
  });

  testWidgets('pull to refresh: ready when pulled far enough, release, then done', (tester) async {
    var loads = 0;
    await tester.pumpWidget(host(Loader<int>(
      load: () async => ++loads,
      builder: (context, n, _) => ListView(children: [for (var i = 0; i < 30; i++) ListTile(title: Text('row $i $n'))]),
    )));
    await tester.pumpAndSettle();
    final g = await tester.startGesture(tester.getCenter(find.text('row 0 1')));
    await g.moveBy(const Offset(0, 40));
    await tester.pump();
    expect(rec.played, isEmpty, reason: 'not far enough yet');
    for (var i = 0; i < 10; i++) {
      await g.moveBy(const Offset(0, 40));
      await tester.pump();
    }
    expect(rec.played, [UiSound.refreshReady]);
    await g.up();
    await tester.pumpAndSettle();
    expect(loads, 2);
    expect(rec.played, [UiSound.refreshReady, UiSound.refreshRelease, UiSound.refreshDone]);
  });

  testWidgets('account tab: the Sounds switch, on by default, turns them off and is remembered', (tester) async {
    final app = Sounds(output: rec);
    await tester.pumpWidget(HerZoneApp(
        config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi(<String>[]), sounds: app));
    await tester.pumpAndSettle();
    expect(Sounds.instance, same(app));
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    expect(rec.played, contains(UiSound.tap), reason: 'the tab bar taps');
    await tester.scrollUntilVisible(find.byKey(const Key('sounds')), 100);
    expect(find.text('الأصوات'), findsOneWidget);
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('sounds'))).value, isTrue);
    rec.played.clear();
    await tester.tap(find.byKey(const Key('sounds')));
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('sounds'))).value, isFalse);
    expect(app.enabled, isFalse);
    expect(rec.played, [UiSound.toggleOff]);
    expect((await SharedPreferences.getInstance()).getBool('sounds'), isFalse);
  });

  testWidgets('the contact sheet: open and close sounds', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(
        config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => api(online: () => true), sounds: Sounds(output: rec)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    rec.played.clear();
    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    expect(rec.played, [UiSound.tap, UiSound.sheetOpen]);
    await tester.tap(find.byKey(const Key('contact-close')));
    await tester.pumpAndSettle();
    expect(rec.played.last, UiSound.sheetClose);
  });

  group('layout with the real fonts', () {
    setUpAll(loadFonts);
    for (final width in [360.0, 390.0, 402.0, 430.0]) {
      for (final lang in ['ar', 'en']) {
        for (final dark in [false, true]) {
          testWidgets('${width.toInt()} $lang ${dark ? 'dark' : 'light'}: the Sounds switch fits in the account tab', (tester) async {
            tester.view.physicalSize = Size(width * 3, 844 * 3);
            tester.view.devicePixelRatio = 3;
            tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
            addTearDown(tester.view.reset);
            addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
            await tester.pumpWidget(HerZoneApp(
                config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => fakeApi(<String>[]), sounds: Sounds(output: rec)));
            await tester.pumpAndSettle();
            if (lang == 'en') {
              Provider.of<LocaleController>(tester.element(find.byType(Scaffold).first), listen: false).toggle();
              await tester.pumpAndSettle();
            }
            await tester.tap(find.byIcon(Icons.account_circle_outlined));
            await tester.pumpAndSettle();
            await tester.scrollUntilVisible(find.byKey(const Key('sounds')), 100);
            final tile = tester.getRect(find.byKey(const Key('sounds')));
            final label = tester.getRect(find.text(lang == 'ar' ? 'الأصوات' : 'Sounds'));
            final toggle = tester.getRect(find.byType(Switch));
            expect(tile.left, greaterThanOrEqualTo(0));
            expect(tile.right, lessThanOrEqualTo(width));
            expect(label.overlaps(toggle), isFalse);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  });
}

class _Broken implements SoundOutput {
  @override
  Future<void> play(UiSound sound) => Future.error(StateError('no audio'));
}
