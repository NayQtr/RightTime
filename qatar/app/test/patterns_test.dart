// The owner's design patterns in the app (15 Nov 2026): the booking bar with her pick, the key under the table drawing,
// the three booking steps, buttons that name the action, confirmation on the control, the labelled sounds switch,
// notifications grouped by day, the one underline on the details, meetup-day help in the pinned summary, the status
// pill on this week's photo cards, the account row icon tiles and the week heading's count. Each is checked for
// behaviour, for reduced motion where it moves, and at the four phone widths with the real fonts in Arabic and English,
// light and dark.
// To look at the screens: HZ_PATTERNS_SHOTS=/some/dir flutter test --update-goldens test/patterns_test.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/core/device_unlock.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:herzone/ui/meetups/inbox_tab.dart' show inboxNow;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'booking_test.dart' as b;
import 'engagement_test.dart' show HomeApi;
import 'meetups_test.dart' as m;
import 'plus_one_test.dart' as p;
import 'rounds_test.dart' show app, fixWeek, inboxApi, reduceMotion;
import 'safety_test.dart' as s;
import 'screens_golden_test.dart' show loadFonts, settleImages;
import 'sign_in_flow_test.dart' show j;

/// Four meetups this week: full, already hers, two seats left, plenty of room.
MockClient statusApi() => MockClient((r) async => switch (r.url.path) {
      '/api/v1/auth/token:refresh' => j({'access_token': 'at_1', 'refresh_token': 'rt_2'}),
      '/api/v1/users/me' => j({'user': {'id': 'u1', 'status': 'active', 'registration_status': 'complete'}}),
      '/api/v1/questionnaires/current' => j({'questionnaire_version_id': 'v5', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true}),
      '/api/v1/sessions' => j({'profile_languages': ['ar'], 'sessions': [
          for (final (id, left, full, mine) in [('f', 0, true, null), ('k', 3, false, 'b7'), ('l', 2, false, null), ('r', 6, false, null)])
            {'id': id, 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true, 'starts_at': '2026-11-14T19:30:00+03:00',
             'district': 'لوسيل', 'seats_left': left, 'is_full': full, 'my_booking_id': mine},
        ]}),
      '/api/v1/bookings' => j({'bookings': []}),
      '/api/v1/notifications' => j({'notifications': []}),
      _ => http.Response('{}', 404),
    });

/// Notices on three days, for today / yesterday / weekday and date.
MockClient threeDaysApi() => MockClient((r) async => switch (r.url.path) {
      '/api/v1/notifications' => j({'notifications': [
          {'id': 'n3', 'text': 'كُشف مكان لقائك غدًا.', 'created_at': '2026-11-11T19:30:00+03:00'},
          {'id': 'n2', 'text': 'تم تأكيد طاولتك.', 'created_at': '2026-11-10T10:00:00+03:00'},
          {'id': 'n1', 'text': 'تم الدفع.', 'created_at': '2026-11-08T10:00:00+03:00'},
        ]}),
      _ => inboxApi().send(http.Request(r.method, r.url)).then(http.Response.fromStream),
    });

void fixInbox() {
  inboxNow = () => DateTime.parse('2026-11-11T21:00:00+03:00');
  addTearDown(() => inboxNow = DateTime.now);
}

double underline(WidgetTester tester) =>
    (tester.widget<CustomPaint>(find.byKey(const Key('when-highlight'))).foregroundPainter as dynamic).progress as double;

Future<void> openInbox(WidgetTester tester, dynamic Function() client) async {
  await tester.pumpWidget(app(client, unlock: AlwaysUnlock()));
  await tester.pumpAndSettle();
  await tester.tap(find.text('الإشعارات').last);
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('unlock')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('1, 3: booking keeps her pick and the button in a bar at the bottom, and shows step 1 of 3', (tester) async {
    final semantics = tester.ensureSemantics();
    await b.start(tester, b.Fake());
    final bar = find.byKey(const Key('pick-bar'));
    expect(find.descendant(of: bar, matching: find.byKey(const Key('hold'))), findsOneWidget);
    expect(find.descendant(of: bar, matching: find.text('اختيارك')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('pick-summary'))).data, 'عشاء · الخميس 12 نوفمبر · 7:30\u00A0م');
    expect(tester.getBottomLeft(bar).dy, 2000, reason: 'the bar sits at the bottom of the screen');
    expect(find.bySemanticsLabel('الموعد، الخطوة 1 من 3'), findsOneWidget);
    expect(tester.getSemantics(find.byKey(const Key('book-step-0'))), matchesSemantics(label: 'الموعد، الخطوة 1 من 3', hasSelectedState: true, isSelected: true));
    expect(find.bySemanticsLabel('المراجعة'), findsOneWidget);

    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(bar, findsNothing, reason: 'the review has its own pay button');
    expect(find.bySemanticsLabel('المراجعة، الخطوة 2 من 3'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('book-step-0')), matching: find.byIcon(Icons.check_rounded)), findsOneWidget, reason: 'done, not by colour alone');
    expect(find.descendant(of: find.byKey(const Key('pay')), matching: find.text('ادفعي 59 ر.ق')), findsOneWidget, reason: '4: the amount on the button');
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('الدفع، الخطوة 3 من 3'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('1, 4, 5: with +1 the bar says so, the button names two seats and waits with its reason; +1 confirms on itself', (tester) async {
    await p.openBook(tester, p.Fake());
    expect(find.descendant(of: find.byKey(const Key('plus-one')), matching: find.byIcon(Icons.add_circle_outline)), findsOneWidget);
    await tester.tap(find.byKey(const Key('plus-one')));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('plus-one')), matching: find.byIcon(Icons.check_circle)), findsOneWidget, reason: 'confirmed on the control');
    expect(find.byType(SnackBar), findsNothing);
    expect(tester.widget<Text>(find.byKey(const Key('pick-summary'))).data, endsWith('\u2066+1\u2069'));
    expect(find.descendant(of: find.byKey(const Key('hold')), matching: find.text('احجزي مقعدين')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('hold'))).onPressed, isNull);
    expect(find.descendant(of: find.byKey(const Key('pick-bar')), matching: find.byKey(const Key('hold-reason'))), findsOneWidget);
    await tester.enterText(find.byKey(const Key('guest-name')), 'نورة');
    await tester.tap(find.byKey(const Key('guest-confirm')));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const Key('hold'))).onPressed, isNotNull);
    expect(find.byKey(const Key('hold-reason')), findsNothing);
  });

  testWidgets('4: the feedback button says what it sends', (tester) async {
    await s.openDetails(tester, s.Fake('completed'));
    await tester.tap(find.byKey(const Key('rate')));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('send-feedback')), matching: find.text('أرسلي التقييم')), findsOneWidget);
  });

  testWidgets('2: the table drawing on the getting-ready card has a key in words', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(app(HomeApi().client));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    final key = find.descendant(of: find.byKey(const Key('ready')), matching: find.byKey(const Key('table-key')));
    expect(key, findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('table-key-taken')), matching: find.text('محجوز')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('table-key-free')), matching: find.text('متاح')), findsOneWidget);
  });

  testWidgets('6, 12: account rows lead with a 40 px icon tile; the sounds switch is labelled, says on or off, and carries a tick', (tester) async {
    final semantics = tester.ensureSemantics();
    m.tallScreen(tester);
    await tester.pumpWidget(app(() => fakeApiNoop()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    for (final (row, icon) in [('my-answers', Icons.quiz_outlined), ('lang', Icons.translate), ('documents', Icons.description_outlined), ('cases', Icons.gavel_outlined), ('sounds', Icons.volume_up_outlined)]) {
      final i = find.descendant(of: find.byKey(Key(row)), matching: find.byIcon(icon));
      expect(i, findsOneWidget, reason: row);
      final tile = find.ancestor(of: i, matching: find.byType(Container)).first;
      expect(tester.getSize(tile), const Size(40, 40), reason: row);
      expect(tester.getTopLeft(tile).dx, greaterThan(tester.getTopLeft(find.byKey(Key(row))).dx + tester.getSize(find.byKey(Key(row))).width / 2),
          reason: 'at the start of the row (right in Arabic)');
    }
    final sw = find.byKey(const Key('sounds'));
    expect(tester.getSize(sw).height, greaterThanOrEqualTo(48));
    expect(tester.getSemantics(sw), matchesSemantics(label: 'الأصوات', hasSelectedState: true, hasToggledState: true, isToggled: true, hasEnabledState: true, isEnabled: true, isFocusable: true, hasTapAction: true, hasFocusAction: true));
    final thumb = tester.widget<SwitchListTile>(sw).thumbIcon!;
    expect(thumb.resolve({WidgetState.selected})!.icon, Icons.check_rounded);
    expect(thumb.resolve({})!.icon, Icons.close_rounded);
    await tester.tap(sw);
    await tester.pumpAndSettle();
    expect(tester.getSemantics(sw), matchesSemantics(label: 'الأصوات', hasSelectedState: true, hasToggledState: true, isToggled: false, hasEnabledState: true, isEnabled: true, isFocusable: true, hasTapAction: true, hasFocusAction: true));
    expect(find.byType(SnackBar), findsNothing, reason: '5: the switch is its own confirmation');
    semantics.dispose();
  });

  testWidgets('7: notifications are grouped under Today, Yesterday and the weekday and date, as headers, keeping the new marker', (tester) async {
    m.tallScreen(tester);
    fixInbox();
    await openInbox(tester, threeDaysApi);
    expect(tester.widget<Text>(find.byKey(const Key('day-2026-11-11'))).data, 'اليوم');
    expect(tester.widget<Text>(find.byKey(const Key('day-2026-11-10'))).data, 'أمس');
    expect(tester.widget<Text>(find.byKey(const Key('day-2026-11-08'))).data, 'الأحد 8 نوفمبر');
    expect(find.ancestor(of: find.byKey(const Key('day-2026-11-10')), matching: find.byWidgetPredicate((w) => w is Semantics && w.properties.header == true)), findsOneWidget);
    expect(find.byKey(const Key('new-n3')), findsOneWidget, reason: 'new since her last visit, still marked');
    expect(tester.getTopLeft(find.byKey(const Key('day-2026-11-10'))).dy, greaterThan(tester.getTopLeft(find.text('كُشف مكان لقائك غدًا.')).dy));
  });

  testWidgets('8: the time on the details gets one underline that draws itself once', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('booking-${m.bookingId}')));
    for (var i = 0; i < 60 && find.byKey(const Key('when-highlight')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(underline(tester), inExclusiveRange(0, 1), reason: 'drawing');
    await tester.pumpAndSettle();
    expect(underline(tester), 1);
    await tester.drag(find.byType(ListView).last, const Offset(0, -300));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).last, const Offset(0, 300));
    await tester.pump();
    expect(underline(tester), 1, reason: 'once: it does not draw again');
  });

  testWidgets('8 with reduced motion: the underline is there at once', (tester) async {
    m.tallScreen(tester);
    reduceMotion(tester);
    await tester.pumpWidget(app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('booking-${m.bookingId}')));
    await tester.pumpAndSettle();
    expect(underline(tester), 1);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('9: on meetup day the pinned summary ends with a 48 px help button that opens the contact sheet', (tester) async {
    final semantics = tester.ensureSemantics();
    await s.openDetails(tester, s.Fake('day_of'));
    tester.view.physicalSize = const Size(390 * 2, 600 * 2); // short enough for the summary to pin
    await tester.pumpAndSettle();
    final help = find.byKey(const Key('pin-help'));
    expect(help, findsOneWidget);
    expect(tester.getSize(help).width, greaterThanOrEqualTo(48));
    expect(tester.getSize(help).height, greaterThanOrEqualTo(48));
    bool hidden() => tester.widget<ExcludeSemantics>(find.ancestor(of: find.byKey(const Key('pinned')), matching: find.byType(ExcludeSemantics)).first).excluding;
    expect(hidden(), isTrue, reason: 'hidden from a screen reader with the summary');
    await tester.drag(find.byType(ListView).last, const Offset(0, -420));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('pinned')), matching: find.byIcon(Icons.call_outlined)), findsOneWidget);
    expect(hidden(), isFalse);
    expect(tester.getSemantics(help).tooltip, 'طلب تواصل', reason: 'reachable by a screen reader once pinned, named');
    await tester.tap(help);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('go-phone')), findsOneWidget, reason: 'the existing contact sheet');
    semantics.dispose();
  });

  testWidgets('9: before meetup day the pinned summary has no help button', (tester) async {
    await s.openDetails(tester, s.Fake('forming'));
    expect(find.byKey(const Key('pin-help')), findsNothing);
  });

  testWidgets('10: each photo card carries its status as a pill on the photo and a chevron when it opens', (tester) async {
    tester.view.physicalSize = const Size(1600 * 2, 1200 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    fixWeek();
    await tester.pumpWidget(app(statusApi));
    await tester.pumpAndSettle();
    Text pill(String id) => tester.widget<Text>(find.descendant(of: find.byKey(Key('pill-$id')), matching: find.byType(Text)));
    expect(pill('f').data, 'ممتلئ');
    expect(pill('k').data, 'محجوز');
    expect(pill('l').data, '2 مقاعد متبقية');
    expect(find.byKey(const Key('pill-r')), findsNothing, reason: 'plenty of room says nothing (the three-seat rule)');
    expect(find.byKey(const Key('chevron-f')), findsNothing, reason: 'a full card does not open');
    for (final id in ['k', 'l', 'r']) {
      expect(find.byKey(Key('chevron-$id')), findsOneWidget);
    }
    final photo = tester.getRect(find.descendant(of: find.byKey(const Key('session-l')), matching: find.byType(Image)));
    expect(photo.contains(tester.getCenter(find.byKey(const Key('pill-l')))), isTrue, reason: 'on the photo');
    expect(photo.contains(tester.getCenter(find.byKey(const Key('chevron-l')))), isTrue);
    expect(find.descendant(of: find.byKey(const Key('session-l')), matching: find.text('2 مقاعد متبقية')), findsOneWidget, reason: 'said once, not again under the photo');
  });

  testWidgets('13: the week heading carries its count, read as one heading', (tester) async {
    final semantics = tester.ensureSemantics();
    tester.view.physicalSize = const Size(390 * 2, 4000 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    fixWeek();
    await tester.pumpWidget(app(HomeApi(count: 9).client));
    await tester.pumpAndSettle();
    expect(find.text('هذا الأسبوع'), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('week-heading-count'))).data, ' · 7');
    expect(find.bySemanticsLabel('7 لقاءات هذا الأسبوع'), findsWidgets);
    expect(find.byWidgetPredicate((w) => w is Semantics && w.properties.header == true && w.properties.label == '7 لقاءات هذا الأسبوع'), findsOneWidget);
    await tester.tap(find.byKey(const Key('wk-2026-11-14')));
    await tester.pumpAndSettle();
    expect(tester.widget<Text>(find.byKey(const Key('week-heading-count'))).data, ' · 7', reason: 'the strip picks a day; the week keeps its count');
    semantics.dispose();
  });

  group('layout with the real fonts', () {
    setUpAll(loadFonts);
    final shots = Platform.environment['HZ_PATTERNS_SHOTS'];
    for (final width in [360.0, 390.0, 402.0, 430.0]) {
      for (final lang in ['ar', 'en']) {
        for (final dark in [false, true]) {
          final tag = '${width.toInt()}_${lang}_${dark ? 'dark' : 'light'}';
          testWidgets('$tag: the pattern screens fit', (tester) async {
            void size() {
              tester.view.physicalSize = Size(width * 3, 844 * 3);
              tester.view.devicePixelRatio = 3;
            }

            size();
            tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
            addTearDown(tester.view.reset);
            addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
            fixWeek();
            fixInbox();
            Future<void> english() async {
              if (lang != 'en') return;
              Provider.of<LocaleController>(tester.element(find.byType(Navigator).first), listen: false).toggle();
              await tester.pumpAndSettle();
            }

            Future<void> open(Widget w) async {
              await tester.pumpWidget(w);
              await tester.pumpAndSettle();
              await english();
            }

            Future<void> seen(String name) async {
              expect(tester.takeException(), isNull, reason: '$name at $tag');
              if (shots == null) return;
              await settleImages(tester);
              await expectLater(find.byType(MaterialApp), matchesGoldenFile(Uri.file('$shots/${tag}_$name.png')));
            }

            final tab = lang == 'ar' ? (events: 'لقاءاتي', inbox: 'الإشعارات', account: 'حسابي') : (events: 'My events', inbox: 'Notifications', account: 'Account');

            await open(app(statusApi));
            await seen('01_home_status');
            await open(app(HomeApi(count: 9).client));
            await seen('02_home_week');
            await tester.tap(find.text(tab.events).last);
            await tester.pumpAndSettle();
            await seen('03_ready_key');

            await open(app(p.Fake().client));
            await tester.tap(find.byKey(const Key('session-s9')));
            await tester.pumpAndSettle();
            await seen('04_book_bar');
            await tester.tap(find.byKey(const Key('plus-one')));
            await tester.pumpAndSettle();
            await seen('05_book_plus_one');

            await open(app(b.Fake().client));
            await tester.tap(find.byKey(const Key('session-s9')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('hold')));
            await tester.pumpAndSettle();
            await seen('06_review_steps');

            await open(app(threeDaysApi, unlock: AlwaysUnlock()));
            await tester.tap(find.text(tab.inbox).last);
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('unlock')));
            await tester.pumpAndSettle();
            await seen('07_inbox_days');

            await open(app(() => m.api(online: () => true)));
            await tester.tap(find.text(tab.account).last);
            await tester.pumpAndSettle();
            await seen('08_account');

            await s.openDetails(tester, s.Fake('day_of'));
            tester.view.physicalSize = Size(width * 3, 600 * 3); // short enough for the summary to pin
            tester.view.devicePixelRatio = 3;
            await tester.pumpAndSettle();
            await english();
            await seen('09_details_underline');
            await tester.drag(find.byType(ListView).last, const Offset(0, -420));
            await tester.pumpAndSettle();
            expect(tester.widget<AnimatedOpacity>(find.ancestor(of: find.byKey(const Key('pinned')), matching: find.byType(AnimatedOpacity))).opacity, 1);
            expect(find.byKey(const Key('pin-help')), findsOneWidget);
            await seen('10_details_pinned_help');
          });
        }
      }
    }
  });
}

/// A signed-in member with nothing booked (the account screen needs no more).
http.Client fakeApiNoop() => HomeApi().client();
