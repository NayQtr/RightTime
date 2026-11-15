// The «سُفرة» seats pattern in the app (owner decision 15 Nov 2026, option B; the website's .sufra-bg): dashed seats
// behind the welcome screen, the end of the questions and the empty states; never on the account screen or a list of
// meetups; colours from HzColors (borderStrong 0.30, seat 0.15 light / 0.22 dark); gone with high contrast.
// To look at the screens with the real fonts: HZ_SUFRA_SHOTS=/some/dir flutter test --update-goldens test/sufra_test.dart
import 'dart:io';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/design/herzone_tokens.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:herzone/ui/common/sufra_background.dart';
import 'package:provider/provider.dart';

import 'engagement_test.dart' show HomeApi;
import 'meetups_test.dart' show tallScreen;
import 'onboarding_test.dart' as o;
import 'rounds_test.dart' show app;
import 'screens_golden_test.dart' show loadFonts, settleImages;

final bg = find.byKey(const Key('sufra-bg'));
SufraPainter painter(WidgetTester tester) => tester.widget<CustomPaint>(bg).painter! as SufraPainter;

/// Draws the painter on a 192 x 64 tile and lists the calls: the seats it strokes, never a fill or a ring.
class _Recorder implements Canvas {
  final arcs = <(Rect, double, double, Color, PaintingStyle, double)>[];
  @override
  void drawArc(Rect rect, double start, double sweep, bool useCenter, Paint p) => arcs.add((rect, start, sweep, p.color, p.style, p.strokeWidth));
  @override
  void save() {}
  @override
  void restore() {}
  @override
  void clipRect(Rect rect, {ClipOp clipOp = ClipOp.intersect, bool doAntiAlias = true}) {}
  @override
  dynamic noSuchMethod(Invocation i) => throw StateError('the pattern only strokes dashed arcs, not ${i.memberName}');
}

void main() {
  setUpAll(loadFonts);

  // the real fonts at the four phone widths, Arabic and English, light and dark: nothing overflows over the pattern
  final shots = Platform.environment['HZ_SUFRA_SHOTS'];
  for (final width in [360.0, 390.0, 402.0, 430.0]) {
    for (final lang in ['ar', 'en']) {
      for (final dark in [false, true]) {
        final tag = '${width.toInt()}_${lang}_${dark ? 'dark' : 'light'}';
        testWidgets('$tag: the pattern screens fit', (tester) async {
          tester.view.physicalSize = Size(width * 3, 844 * 3);
          tester.view.devicePixelRatio = 3;
          tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
          addTearDown(tester.view.reset);
          addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
          Future<void> open(Widget w) async {
            await tester.pumpWidget(w);
            await tester.pumpAndSettle();
            if (lang == 'en') {
              Provider.of<LocaleController>(tester.element(find.byType(Navigator).first), listen: false).toggle();
              await tester.pumpAndSettle();
            }
          }

          Future<void> seen(String name) async {
            expect(tester.takeException(), isNull, reason: '$name at $tag');
            expect(bg, findsOneWidget, reason: '$name at $tag');
            if (shots == null) return;
            await settleImages(tester);
            await expectLater(find.byType(MaterialApp), matchesGoldenFile(Uri.file('$shots/app_${tag}_$name.png')));
          }

          await open(app(o.FakeApi().client, signedIn: false));
          await seen('welcome');
          await open(app(HomeApi().client));
          await seen('home_empty');
          await tester.tap(find.text(lang == 'ar' ? 'لقاءاتي' : 'My events').last);
          await tester.pumpAndSettle();
          await seen('events_empty');
        });
      }
    }
  }

  test('the tile: dashed seats only (r 4, stroke 1.25, dashes 3 / 2.5), a staggered 64 px grid, one seat in the seat colour per 192 px', () {
    final rec = _Recorder();
    final p = SufraPainter(every: HzColors.light.borderStrong.withValues(alpha: 0.30), third: HzColors.light.seat.withValues(alpha: 0.15));
    p.paint(rec, const Size(192, 64));
    for (final a in rec.arcs) {
      expect(a.$5, PaintingStyle.stroke, reason: 'never filled');
      expect(a.$6, 1.25);
      expect(a.$1.width, 8, reason: 'radius 4: no table ring');
      expect(a.$3, lessThanOrEqualTo(3 / 4 + 1e-9), reason: 'a 3 px dash');
    }
    Set<Offset> seats(Color c) => {for (final a in rec.arcs) if (a.$4.toARGB32() == c.toARGB32() && a.$1.right <= 192 && a.$1.bottom <= 64) a.$1.center};
    expect(seats(p.every), {const Offset(16, 16), const Offset(48, 48), const Offset(80, 16), const Offset(112, 48), const Offset(144, 16), const Offset(176, 48)});
    expect(seats(p.third), {const Offset(16, 16)});
    expect(SufraBackground.opacity1, 0.30);
    expect(SufraBackground.opacity2(Brightness.light), 0.15);
    expect(SufraBackground.opacity2(Brightness.dark), 0.22);
  });

  testWidgets('welcome: the pattern behind it in the token colours, light and dark; the second button stays solid', (tester) async {
    tallScreen(tester);
    for (final (b, c) in [(Brightness.light, HzColors.light), (Brightness.dark, HzColors.dark)]) {
      tester.platformDispatcher.platformBrightnessTestValue = b;
      await tester.pumpWidget(app(o.FakeApi().client, signedIn: false));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('start')), findsOneWidget);
      expect(bg, findsOneWidget);
      expect(painter(tester).every, c.borderStrong.withValues(alpha: 0.30));
      expect(painter(tester).third, c.seat.withValues(alpha: b == Brightness.dark ? 0.22 : 0.15));
      final style = tester.widget<OutlinedButton>(find.byKey(const Key('have-account'))).style!;
      expect(style.backgroundColor!.resolve({}), c.bg);
    }
    tester.platformDispatcher.clearPlatformBrightnessTestValue();
  });

  testWidgets('high contrast: no pattern', (tester) async {
    tallScreen(tester);
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(highContrast: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pumpWidget(app(o.FakeApi().client, signedIn: false));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('start')), findsOneWidget);
    expect(bg, findsNothing);
  });

  testWidgets('the end of the questions has it; a question does not', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(app(o.FakeApi().client, signedIn: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();
    expect(bg, findsNothing, reason: 'a question');
    await tester.tap(find.byKey(const Key('opt-ar')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('opt-travel')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('skip')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('save-answers')), findsOneWidget);
    expect(bg, findsOneWidget);
  });

  testWidgets('empty home and empty my meetups have it; home with meetups and the account screen do not', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(app(HomeApi().client));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('notify-me')), findsOneWidget);
    expect(bg, findsOneWidget, reason: 'home with no meetups');
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    expect(bg, findsOneWidget, reason: 'my meetups with no booking');
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    expect(bg, findsNothing, reason: 'account');

    await tester.pumpWidget(app(HomeApi(count: 3).client));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('notify-me')), findsNothing);
    expect(bg, findsNothing, reason: 'home with meetups');
  });
}
