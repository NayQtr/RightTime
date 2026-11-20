// The 60-30-10 colour rule in the app, as on the website: 60% the neutral page (bg), 30% one container family (surface
// with its border), 10% the accent (mauve primary / cta and the owner's yellow). At most three accent elements on a
// screen: its one primary call to action, the current tab, and the seats of a table drawing where one shows (on welcome
// the yellow headline highlight takes the drawing's place).
//
// Each main screen is pumped in light and dark; the widget tree on screen is walked and every widget that paints an
// accent colour (fill, border, text, icon, a button's resolved colours, a custom painter's paints) is collected. One
// control (a button, a tappable row or card, a chip, a list row) counts once however many accent parts it has; so does
// the tab bar (its indicator, icon and label) and a table drawing. The «سُفرة» background layer is not counted.
// HZ_ACCENT_REPORT=1 prints what was found on each screen.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/core/device_unlock.dart';
import 'package:herzone/design/herzone_tokens.dart';
import 'package:herzone/ui/common/table_art.dart';
import 'package:herzone/ui/meetups/home_tab.dart' show homeNow;
import 'package:shared_preferences/shared_preferences.dart';

import 'booking_test.dart' as b;
import 'engagement_test.dart' show HomeApi;
import 'meetups_test.dart' as m;
import 'rounds_test.dart' show app, inboxApi;
import 'sign_in_flow_test.dart' show fakeApi;

/// The accent roles, compared without their alpha (a faint band of mauve is still mauve); fully transparent paint is
/// not an accent.
Set<int> accentRgb(HzColors c) => {
      for (final x in [c.primary, c.primaryHover, c.primarySubtle, c.cta, c.ctaEnd, c.accent, c.seat]) x.toARGB32() & 0xFFFFFF,
    };

/// A canvas that only notes the colour of every paint a painter uses.
class _PaintLog implements Canvas {
  final colors = <Color>[];

  @override
  dynamic noSuchMethod(Invocation i) {
    for (final a in [...i.positionalArguments, ...i.namedArguments.values]) {
      if (a is Paint) colors.add(a.color);
    }
    return null;
  }
}

/// One accent element found on screen: the group it counts in, and what painted it.
typedef AccentHit = ({Object group, String what});

/// Walks what is on screen (offstage routes, tabs and fully faded widgets are skipped) and returns every accent hit.
List<AccentHit> accentHits(WidgetTester tester, HzColors c) {
  final accents = accentRgb(c);
  bool accent(Color? x) => x != null && x.a > 0.02 && accents.contains(x.toARGB32() & 0xFFFFFF);
  bool accentSpan(InlineSpan s) {
    var found = false;
    s.visitChildren((span) {
      final st = span.style;
      if (st != null && (accent(st.color) || accent(st.backgroundColor) || accent(st.decorationColor) || accent(st.foreground?.color) || accent(st.background?.color))) {
        found = true;
        return false;
      }
      return true;
    });
    return found;
  }

  bool accentBorder(BoxBorder? border) => switch (border) {
        Border b => [b.top, b.right, b.bottom, b.left].any((s) => s.style != BorderStyle.none && s.width > 0 && accent(s.color)),
        BorderDirectional b => [b.top, b.start, b.bottom, b.end].any((s) => s.style != BorderStyle.none && s.width > 0 && accent(s.color)),
        _ => false,
      };
  bool accentShape(ShapeBorder? shape) => shape is OutlinedBorder && shape.side.style != BorderStyle.none && shape.side.width > 0 && accent(shape.side.color);
  bool accentDecoration(Decoration? d) => switch (d) {
        BoxDecoration x => accent(x.color) || accentBorder(x.border) || (x.gradient?.colors.any(accent) ?? false) || (x.boxShadow?.any((s) => accent(s.color)) ?? false),
        ShapeDecoration x => accent(x.color) || accentShape(x.shape) || (x.gradient?.colors.any(accent) ?? false),
        _ => false,
      };
  bool accentPainter(CustomPainter? p, Size size) {
    if (p == null) return false;
    final log = _PaintLog();
    try {
      p.paint(log, size);
    } catch (_) {/* a painter that needs a real canvas: what it noted so far counts */}
    return log.colors.any(accent);
  }

  // the tab bar is one element: the Material that holds the gliding indicator
  final tabIndicator = find.byKey(const Key('tab-indicator'));
  final tabBar = tabIndicator.evaluate().isEmpty ? null : find.ancestor(of: tabIndicator, matching: find.byType(Material)).evaluate().first;

  final hits = <AccentHit>[];
  void walk(Element e, Object? group) {
    final w = e.widget;
    if (w is Opacity && w.opacity == 0) return;
    if (w is FadeTransition && w.opacity.value == 0) return;
    if (w is TableKey) return; // the key under a drawing belongs to the drawing
    if (w is TableArt) {
      hits.add((group: group ?? e, what: 'table drawing'));
      return;
    }
    Object? g = group;
    if (g == null && identical(e, tabBar)) g = 'tab bar';
    if (g == null &&
        (w is ButtonStyleButton || w is IconButton || w is InkResponse || w is RawChip || w is ChoiceChip || w is FilterChip || w is ListTile ||
            w is CheckboxListTile || w is RadioListTile || w is SwitchListTile)) {
      g = e;
    }
    String? what;
    if (w is Material && (accent(w.color) || accent(w.textStyle?.color) || accentShape(w.shape))) what = 'Material ${w.color}';
    if (w is DecoratedBox && accentDecoration(w.decoration)) what = 'DecoratedBox';
    if (w is Ink && accentDecoration(w.decoration)) what = 'Ink';
    if (w is ColoredBox && accent(w.color)) what = 'ColoredBox';
    if (w is RichText && accentSpan(w.text)) what = 'text "${w.text.toPlainText().trim()}"';
    if (w is EditableText && accent(w.style.color)) what = 'text "${w.controller.text}"';
    if (w is Badge && w.isLabelVisible && (accent(w.backgroundColor) || accent(w.textColor))) hits.add((group: 'badge', what: 'unread badge'));
    if (w is CustomPaint && w.key != const Key('sufra-bg')) {
      final ro = e.renderObject;
      final size = ro is RenderBox && ro.hasSize ? ro.size : Size.zero;
      if (accentPainter(w.painter, size) || accentPainter(w.foregroundPainter, size)) what = 'painter ${(w.painter ?? w.foregroundPainter).runtimeType}';
    }
    if (what != null) {
      hits.add((group: g ?? e, what: what));
      g ??= e; // what it holds counts with it
    }
    e.debugVisitOnstageChildren((child) => walk(child, g));
  }

  walk(tester.binding.rootElement!, null);
  return hits;
}

/// The number of accent elements on screen: one per group.
int accentCount(List<AccentHit> hits) => hits.map((h) => h.group).toSet().length;

/// How each screen is reached, from a fresh app on a tall phone (the whole page is built and on screen).
final scenes = <String, Future<void> Function(WidgetTester)>{
  'welcome': (tester) async {
    await tester.pumpWidget(app(() => fakeApi([]), signedIn: false));
    await tester.pumpAndSettle();
  },
  'home': (tester) async {
    await tester.pumpWidget(app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
  },
  'home, empty, unread badge': (tester) async {
    SharedPreferences.setMockInitialValues({'hz.inboxSeen': '2026-11-11T09:00:00+03:00'});
    await tester.pumpWidget(app(inboxApi, unlock: AlwaysUnlock()));
    await tester.pumpAndSettle();
  },
  'sessions (long list, filters)': (tester) async {
    await tester.pumpWidget(app(HomeApi(count: 10).client));
    await tester.pumpAndSettle();
  },
  'my meetups': (tester) async {
    await tester.pumpWidget(app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
  },
  'my meetups, empty': (tester) async {
    await tester.pumpWidget(app(HomeApi().client));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
  },
  'details': (tester) async {
    await tester.pumpWidget(app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
  },
  'book': (tester) async {
    await tester.pumpWidget(app(b.Fake().client));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s9')));
    await tester.pumpAndSettle();
  },
  'review': (tester) async {
    await tester.pumpWidget(app((b.Fake()..launchFree = true).client));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s9')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
  },
  'account': (tester) async {
    await tester.pumpWidget(app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
  },
  'inbox': (tester) async {
    SharedPreferences.setMockInitialValues({'hz.inboxSeen': '2026-11-11T09:00:00+03:00'});
    await tester.pumpWidget(app(inboxApi, unlock: AlwaysUnlock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('الإشعارات').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('unlock')));
    await tester.pumpAndSettle();
  },
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  final report = Platform.environment['HZ_ACCENT_REPORT'] == '1';

  for (final dark in [false, true]) {
    final c = dark ? HzColors.dark : HzColors.light;
    for (final MapEntry(key: name, value: open) in scenes.entries) {
      testWidgets('$name, ${dark ? 'dark' : 'light'}: at most three accent elements', (tester) async {
        m.tallScreen(tester);
        tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
        addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
        homeNow = () => DateTime.parse('2026-11-12T09:00:00+03:00'); // this week starts on the sample meetup's day
        addTearDown(() => homeNow = DateTime.now);
        await open(tester);
        final hits = accentHits(tester, c);
        final n = accentCount(hits);
        final lines = [for (final g in hits.map((h) => h.group).toSet()) '  - ${hits.where((h) => h.group == g).map((h) => h.what).join('; ')}'];
        if (report) stdout.writeln('ACCENTS ${dark ? 'dark ' : 'light'} $n  $name\n${lines.join('\n')}');
        expect(n, lessThanOrEqualTo(3), reason: '$name: ${lines.join('\n')}');
        expect(n, greaterThanOrEqualTo(1), reason: '$name: the count sees the primary action or the current tab');
      });
    }
  }
}
