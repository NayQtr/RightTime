// Rounds 1-3 of the reference-sites study in the app (owner's decision, 14 Nov 2026; plan:
// qatar/docs/plans/2026-11-14-rounds-1-3.md, batch 4): the welcome photo, the reply line and the one-track scale in
// the questionnaire, this week on home, the getting-ready card, the dated notifications, the named account groups, the
// gliding tab indicator, the large date and pinned summary on the details, the receipt-like review and the feedback
// that reads the choice back. Each is checked for behaviour, for reduced motion where it moves, and at the four phone
// widths with the real fonts in Arabic and English, light and dark.
// To look at the screens: HZ_ROUNDS_SHOTS=/some/dir flutter test --update-goldens test/rounds_test.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/device_unlock.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:herzone/ui/common/press.dart';
import 'package:herzone/ui/common/table_art.dart';
import 'package:herzone/ui/meetups/home_tab.dart' show homeNow;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'booking_test.dart' as b;
import 'engagement_test.dart' show HomeApi;
import 'meetups_test.dart' as m;
import 'onboarding_test.dart' as o;
import 'safety_test.dart' as s;
import 'screens_golden_test.dart' show loadFonts, settleImages;
import 'sign_in_flow_test.dart' show config, fakeApi, j;

const reply = 'جميل. سنبحث لكِ عن طاولة تشبهك.';

HerZoneApp app(dynamic Function() client, {bool signedIn = true, QuizStore? quiz, DeviceUnlock? unlock}) => HerZoneApp(
      key: UniqueKey(),
      config: config,
      tokens: MemoryTokenStore()..token = signedIn ? 'rt_1' : null,
      trips: MemoryTripStore(),
      quizStore: quiz ?? QuizStore.memory(),
      deviceUnlock: unlock,
      httpClientFactory: () => client() as http.Client,
    );

void phone(WidgetTester tester, [double width = 390, double height = 844]) {
  tester.view.physicalSize = Size(width * 2, height * 2);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

void reduceMotion(WidgetTester tester) {
  tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
}

/// "This week" starts on Friday 13 November 2026 in these tests.
void fixWeek() {
  homeNow = () => DateTime.parse('2026-11-13T09:00:00+03:00');
  addTearDown(() => homeNow = DateTime.now);
}

/// A questionnaire whose first question is a 1-5 scale, then one more.
MockClient scaleApi() => MockClient((r) async => switch (r.url.path) {
      '/api/v1/questionnaires/preview' => j({'questionnaire_version_id': 'v9', 'questions': [
          {...o.q('q1', 'Q18', 'single', 'ما أهمية العائلة لك؟', [for (var i = 1; i <= 5; i++) ['s$i', '$i', '$i']], required: true, layout: 'scale'), 'scale_low': 'أقل أهمية', 'scale_high': 'أهم شيء'},
          o.q('q2', 'Q24', 'single', 'ما حالتك الاجتماعية؟', [['o6', 'single', 'عزباء']]),
        ]}),
      _ => j({'code': 'NOT_FOUND'}, 404),
    });

/// A signed-in member with three notices on two days.
MockClient inboxApi() => MockClient((r) async => switch (r.url.path) {
      '/api/v1/auth/token:refresh' => j({'access_token': 'at_1', 'refresh_token': 'rt_2'}),
      '/api/v1/users/me' => j({'user': {'id': 'u1', 'status': 'active', 'registration_status': 'complete'}}),
      '/api/v1/questionnaires/current' => j({'questionnaire_version_id': 'v4', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true}),
      '/api/v1/sessions' => j({'sessions': []}),
      '/api/v1/notifications' => j({'notifications': [
          {'id': 'n3', 'text': 'كُشف مكان لقائك غدًا.', 'created_at': '2026-11-11T19:30:00+03:00'},
          {'id': 'n2', 'text': 'لقاؤك غدًا الساعة 7:30 م.', 'created_at': '2026-11-11T10:00:00+03:00'},
          {'id': 'n1', 'text': 'تم تأكيد طاولتك في لوسيل الخميس 7:30 م.', 'created_at': '2026-11-10T10:00:00+03:00'},
        ]}),
      _ => http.Response('{}', 404),
    });

double fadeOf(WidgetTester tester, Finder inside) =>
    tester.widget<FadeTransition>(find.ancestor(of: inside, matching: find.byType(FadeTransition)).first).opacity.value;

void main() {
  testWidgets('welcome: a photo stands where the drawing stood; nothing follows the two buttons and no number leads', (tester) async {
    phone(tester);
    await tester.pumpWidget(app(() => fakeApi([]), signedIn: false));
    await tester.pump();
    await tester.pump();
    expect(fadeOf(tester, find.byKey(const Key('welcome-photo'))), lessThan(1), reason: 'the photo fades in and settles');
    await tester.pumpAndSettle();
    final photo = tester.widget<Image>(find.byKey(const Key('welcome-photo')));
    expect((photo.image as AssetImage).assetName, 'assets/photos/toast-720.webp');
    expect(find.byType(TableArt), findsNothing);
    expect(fadeOf(tester, find.byKey(const Key('welcome-photo'))), 1);
    // nothing under "I already have an account", and no figure above the headline
    final lowest = tester.getBottomLeft(find.byKey(const Key('have-account'))).dy;
    final texts = tester.widgetList<Text>(find.byType(Text)).toList();
    for (final e in find.byType(Text).evaluate()) {
      expect(tester.getTopLeft(find.byWidget(e.widget)).dy, lessThan(lowest), reason: 'no line after the two buttons');
    }
    expect(texts.where((w) => RegExp(r'^\s*\d').hasMatch(w.data ?? w.textSpan?.toPlainText() ?? '')), isEmpty);
    expect(tester.getTopLeft(find.byKey(const Key('start'))).dy, greaterThan(tester.getBottomLeft(find.byKey(const Key('welcome-photo'))).dy));
  });

  testWidgets('welcome with reduced motion: the photo and the blocks are in place at once', (tester) async {
    phone(tester);
    reduceMotion(tester);
    await tester.pumpWidget(app(() => fakeApi([]), signedIn: false));
    await tester.pump();
    await tester.pump();
    expect(fadeOf(tester, find.byKey(const Key('welcome-photo'))), 1);
    expect(fadeOf(tester, find.byKey(const Key('start'))), 1);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('questionnaire: her first answer on a question that stays brings the reply line and a filled seat, once', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(app(o.FakeApi().client, signedIn: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('opt-ar'))); // a single choice moves on by itself: no reply
    await tester.pumpAndSettle();
    expect(find.text(reply), findsNothing);
    expect(find.byKey(const Key('question')), findsOneWidget);

    await tester.tap(find.byKey(const Key('opt-travel')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    expect(find.text(reply), findsOneWidget);
    expect(fadeOf(tester, find.byWidgetPredicate((w) => w is TableArt && w.filled == 1)), lessThan(1), reason: 'the seat fills as the line arrives');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('question')), findsNothing, reason: 'the heading has given way');
    expect(fadeOf(tester, find.byWidgetPredicate((w) => w is TableArt && w.filled == 1)), 1);
    await tester.tap(find.byKey(const Key('opt-food')));
    await tester.pumpAndSettle();
    expect(find.text(reply), findsOneWidget, reason: 'it stays while she is on this question');

    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    expect(find.text(reply), findsNothing);
    expect(find.byKey(const Key('question')), findsOneWidget, reason: 'the next question has its heading');
  });

  testWidgets('questionnaire with reduced motion: the reply and its seat are there at once', (tester) async {
    m.tallScreen(tester);
    reduceMotion(tester);
    final store = QuizStore.memory();
    await store.write('v4', {'q1': {'o1'}}, 1);
    await tester.pumpWidget(app(o.FakeApi().client, signedIn: false, quiz: store));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('opt-art')));
    await tester.pump();
    await tester.pump();
    expect(find.text(reply), findsOneWidget);
    expect(find.byKey(const Key('question')), findsNothing);
    expect(fadeOf(tester, find.byWidgetPredicate((w) => w is TableArt && w.filled == 1)), 1);
  });

  testWidgets('an answer row dims while touched and comes back; it stays put with reduced motion', (tester) async {
    Widget host({bool still = false}) => MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: still),
            child: Scaffold(body: Center(child: Press(dim: true, child: InkWell(onTap: () {}, child: const Text('answer'))))),
          ),
        );
    double dim() => tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity;
    await tester.pumpWidget(host());
    var g = await tester.startGesture(tester.getCenter(find.text('answer')));
    await tester.pump();
    expect(dim(), 0.6);
    expect(find.byType(AnimatedScale), findsNothing, reason: 'a row dims; only buttons shrink');
    await g.up();
    await tester.pumpAndSettle();
    expect(dim(), 1);
    await tester.pumpWidget(host(still: true));
    g = await tester.startGesture(tester.getCenter(find.text('answer')));
    await tester.pump();
    expect(dim(), 1);
    await g.up();
  });

  testWidgets('a scale question is one track: each number keeps its key and the thumb sits on the chosen one', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(app(scaleApi, signedIn: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('scale-track')), findsOneWidget);
    expect(find.byType(FilterChip), findsNothing);
    expect(find.byKey(const Key('scale-thumb')), findsNothing, reason: 'nothing chosen yet');
    expect(find.text('أقل أهمية'), findsOneWidget);
    await tester.tap(find.byKey(const Key('opt-4')));
    await tester.pumpAndSettle();
    expect(find.text('ما حالتك الاجتماعية؟'), findsOneWidget, reason: 'a single choice still moves on');
    await tester.tap(find.byTooltip('رجوع'));
    await tester.pumpAndSettle();
    final thumb = tester.getCenter(find.byKey(const Key('scale-thumb')));
    expect((thumb.dx - tester.getCenter(find.byKey(const Key('opt-4'))).dx).abs(), lessThan(1), reason: 'the thumb is under 4');
  });

  testWidgets('home: the week strip filters by day with a live count; this week is a row of photo cards, later ones the list', (tester) async {
    tester.view.physicalSize = const Size(390 * 2, 4000 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    fixWeek();
    await tester.pumpWidget(app(HomeApi(count: 9).client));
    await tester.pumpAndSettle();
    int inRow() => find.descendant(of: find.byKey(const Key('peek')), matching: find.byType(Image)).evaluate().length;
    int all() => find.byWidgetPredicate((w) => w is Container && w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('session-')).evaluate().length;
    expect(find.text('هذا الأسبوع'), findsOneWidget);
    // nine dinners on 12, 12, 13, 13, 14, 14, 15, 15 and 16 November; the week is 13 to 19
    expect(find.text('7 لقاءات هذا الأسبوع'), findsOneWidget);
    expect(inRow(), 7);
    expect(all(), 9, reason: 'each session once: seven in the row, two in the list');
    expect(tester.widget<Image>(find.descendant(of: find.byKey(const Key('session-s2')), matching: find.byType(Image))).image, const AssetImage('assets/photos/seat-720.webp'));

    await tester.tap(find.byKey(const Key('wk-2026-11-14')));
    await tester.pumpAndSettle();
    expect(find.text('2 لقاءات في هذا اليوم'), findsOneWidget);
    expect(inRow(), 2);
    expect(all(), 2);
    await tester.tap(find.byKey(const Key('wk-2026-11-16')));
    await tester.pumpAndSettle();
    expect(find.text('1 لقاء في هذا اليوم'), findsOneWidget);
    await tester.tap(find.byKey(const Key('wk-2026-11-17'))); // no meetup that day: it cannot be chosen
    await tester.pumpAndSettle();
    expect(find.text('1 لقاء في هذا اليوم'), findsOneWidget);
    await tester.tap(find.byKey(const Key('wk-2026-11-16'))); // the chosen day again: the whole week
    await tester.pumpAndSettle();
    expect(find.text('7 لقاءات هذا الأسبوع'), findsOneWidget);

    await tester.tap(find.byKey(const Key('kind-coffee'))); // every session here is a dinner: the coffee tile is off
    await tester.pumpAndSettle();
    expect(all(), 9);
    await tester.tap(find.byKey(const Key('kind-dinner')));
    await tester.pumpAndSettle();
    expect(all(), 9);
    expect(find.byKey(const Key('no-filter-match')), findsNothing);
  });

  testWidgets('my meetups with no booking: the getting-ready card, its done step struck through, its links working', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(app(HomeApi().client));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    expect(find.text('لم تحجزي أي لقاء بعد.'), findsOneWidget, reason: 'the existing words stay');
    expect(find.descendant(of: find.byKey(const Key('ready')), matching: find.text('قبل لقائك الأول')), findsOneWidget);
    // done: a tick, the words not struck through (owner, 15 Nov)
    expect(tester.widget<Text>(find.text('أجيبي عن أسئلة التعارف')).style?.decoration, isNot(TextDecoration.lineThrough));
    expect(find.descendant(of: find.byKey(const Key('ready-answers')), matching: find.byIcon(Icons.check_rounded)), findsOneWidget);
    expect(tester.widget<InkWell>(find.byKey(const Key('ready-answers'))).onTap, isNull);
    expect(find.text('اختاري موعدًا يناسبك'), findsOneWidget);
    await tester.tap(find.byKey(const Key('ready-rules')));
    await tester.pumpAndSettle();
    expect(find.text('الشروط والخصوصية'), findsWidgets, reason: 'the rules open');
  });

  testWidgets('notifications: a dated rail, each day named once and the time under each notice', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(app(inboxApi, unlock: AlwaysUnlock()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('الإشعارات').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('unlock')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('day-2026-11-11')), findsOneWidget);
    expect(find.byKey(const Key('day-2026-11-10')), findsOneWidget);
    expect(find.text('الأربعاء 11 نوفمبر'), findsOneWidget);
    expect(find.text('7:30 م'), findsOneWidget);
    expect(tester.getTopLeft(find.byKey(const Key('day-2026-11-11'))).dy, lessThan(tester.getTopLeft(find.text('كُشف مكان لقائك غدًا.')).dy));
    expect(tester.getTopLeft(find.text('لقاؤك غدًا الساعة 7:30 م.')).dy, lessThan(tester.getTopLeft(find.byKey(const Key('day-2026-11-10'))).dy));
  });

  testWidgets('account: three named groups; a changed setting answers with a tick in its own row, then the arrow returns', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(app(() => fakeApi([])));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    for (final title in ['الملف', 'التفضيلات', 'الخصوصية']) {
      expect(find.text(title), findsOneWidget);
    }
    expect(tester.getTopLeft(find.text('التفضيلات')).dy, lessThan(tester.getTopLeft(find.byKey(const Key('lang'))).dy));
    expect(tester.getTopLeft(find.text('الخصوصية')).dy, lessThan(tester.getTopLeft(find.byKey(const Key('documents'))).dy));
    // the row arrows point where the row leads: chevron_right mirrors itself in Arabic, so it is never swapped by hand
    expect(find.descendant(of: find.byKey(const Key('documents')), matching: find.byIcon(Icons.chevron_right)), findsOneWidget);
    expect(find.byIcon(Icons.chevron_left), findsNothing);
    Finder tick(String row) => find.descendant(of: find.byKey(Key(row)), matching: find.byIcon(Icons.check_rounded));
    // appearance is a switch now (owner, 15 Nov); the language row answers with a tick in its own row
    expect(tick('lang'), findsNothing);
    await tester.tap(find.byKey(const Key('lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tick('lang'), findsOneWidget);
    expect(tick('documents'), findsNothing, reason: 'only the row she changed');
    expect(find.byType(SnackBar), findsNothing);
    await tester.pumpAndSettle();
    expect(tick('lang'), findsNothing);
    await tester.tap(find.byKey(const Key('documents'))); // a row that leads somewhere keeps its arrow
    await tester.pump();
    expect(tick('documents'), findsNothing);
    await tester.pumpAndSettle();
  });

  testWidgets('tab bar: one indicator glides to the chosen tab; with reduced motion it jumps', (tester) async {
    phone(tester);
    await tester.pumpWidget(app(() => fakeApi([])));
    await tester.pumpAndSettle();
    AnimatedAlign bar() => tester.widget<AnimatedAlign>(find.byKey(const Key('tab-indicator')));
    expect(bar().alignment, const AlignmentDirectional(-1, 0));
    expect(bar().duration, const Duration(milliseconds: 400));
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    expect(bar().alignment, const AlignmentDirectional(1, 0));
    expect(find.text('حسابي'), findsWidgets);
    reduceMotion(tester);
    await tester.pumpWidget(app(() => fakeApi([])));
    await tester.pumpAndSettle();
    expect(bar().duration, Duration.zero);
  });

  testWidgets('details: the date as one large numeral, and a summary pinned once the heading has scrolled away', (tester) async {
    phone(tester);
    await tester.pumpWidget(app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('booking-${m.bookingId}')));
    await tester.pumpAndSettle();
    final date = find.byKey(const Key('big-date'));
    expect(find.descendant(of: date, matching: find.text('12')), findsOneWidget);
    expect(tester.widget<Text>(find.descendant(of: date, matching: find.text('12'))).style?.fontSize, 112);
    expect(find.descendant(of: date, matching: find.text('الخميس\nنوفمبر')), findsOneWidget);
    expect(find.bySemanticsLabel('الخميس 12 نوفمبر · 7:30 م'), findsOneWidget, reason: 'read out in full');
    double pinned() => tester.widget<AnimatedOpacity>(find.ancestor(of: find.byKey(const Key('pinned')), matching: find.byType(AnimatedOpacity))).opacity;
    expect(pinned(), 0);
    await tester.drag(find.byType(ListView).last, const Offset(0, -400));
    await tester.pumpAndSettle();
    expect(pinned(), 1);
    expect(find.descendant(of: find.byKey(const Key('pinned')), matching: find.text('الخميس 12 نوفمبر · لوسيل')), findsOneWidget);
    await tester.drag(find.byType(ListView).last, const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(pinned(), 0);
  });

  testWidgets('booking review reads as a receipt: the amount large, the same amount on the button, the refund note right after it', (tester) async {
    final f = b.Fake();
    await b.start(tester, f);
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(tester.widget<Text>(find.byKey(const Key('amount'))).style?.fontSize, greaterThanOrEqualTo(24));
    expect(find.descendant(of: find.byKey(const Key('pay')), matching: find.text('ادفعي 59 ر.ق')), findsOneWidget);
    expect(tester.getTopLeft(find.byKey(const Key('terms'))).dy, greaterThan(tester.getBottomLeft(find.byKey(const Key('pay'))).dy));
    expect(find.text('إلغاء مجاني حتى الثلاثاء 10 نوفمبر · 7:30\u00A0م. بعده لا يُرد رسم التنظيم.'), findsOneWidget, reason: 'the one refund line (owner, 14 Nov)');
  });

  testWidgets('booking review close to the date: the warning and its acknowledgement stay before the button', (tester) async {
    await b.start(tester, b.Fake(late: true));
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(tester.getBottomLeft(find.byKey(const Key('terms'))).dy, lessThan(tester.getTopLeft(find.byKey(const Key('pay'))).dy));
    expect(tester.getBottomLeft(find.byKey(const Key('ack'))).dy, lessThan(tester.getTopLeft(find.byKey(const Key('pay'))).dy));
  });

  testWidgets('booking review during the launch offer: the button keeps its plain words', (tester) async {
    await b.start(tester, b.Fake()..launchFree = true);
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('pay')), matching: find.text('ادفعي الآن')), findsOneWidget);
  });

  testWidgets('feedback: each row reads her choice back, and what she sent is summed up after sending', (tester) async {
    final f = s.Fake('completed');
    await s.openDetails(tester, f);
    await tester.tap(find.byKey(const Key('rate')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('overall-echo')), findsNothing);
    await tester.tap(find.byKey(const Key('overall-5')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('overall-echo'))).data, ': 5 من 5');
    await tester.tap(find.byKey(const Key('comfort-4')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('comfort-echo'))).data, ' 4 من 5', reason: 'no colon after a question mark');
    expect(find.byKey(const Key('venue-echo')), findsNothing);
    await tester.ensureVisible(find.byKey(const Key('send-feedback')));
    await tester.tap(find.byKey(const Key('send-feedback')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('fb-thanks')), findsOneWidget);
    final sum = find.byKey(const Key('fb-summary'));
    expect(find.descendant(of: sum, matching: find.text('التقييم العام: 5 من 5')), findsOneWidget);
    expect(find.descendant(of: sum, matching: find.text('هل شعرتِ بالراحة في الحوار؟ 4 من 5')), findsOneWidget);
    expect(find.descendant(of: sum, matching: find.byType(Text)), findsNWidgets(2), reason: 'the venue was not rated');
  });

  group('layout with the real fonts', () {
    setUpAll(loadFonts);
    final shots = Platform.environment['HZ_ROUNDS_SHOTS'];
    for (final width in [360.0, 390.0, 402.0, 430.0]) {
      for (final lang in ['ar', 'en']) {
        for (final dark in [false, true]) {
          final tag = '${width.toInt()}_${lang}_${dark ? 'dark' : 'light'}';
          testWidgets('${width.toInt()} $lang ${dark ? 'dark' : 'light'}: the rounds 1-3 screens fit', (tester) async {
            void size() {
              tester.view.physicalSize = Size(width * 3, 844 * 3);
              tester.view.devicePixelRatio = 3;
            }

            size();
            tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
            addTearDown(tester.view.reset);
            addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
            fixWeek();
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
              if (shots == null) return;
              await settleImages(tester);
              await expectLater(find.byType(MaterialApp), matchesGoldenFile(Uri.file('$shots/${tag}_$name.png')));
            }

            final tab = lang == 'ar' ? (events: 'لقاءاتي', inbox: 'الإشعارات', account: 'حسابي') : (events: 'My events', inbox: 'Notifications', account: 'Account');

            await open(app(() => fakeApi([]), signedIn: false));
            await seen('01_welcome');

            final store = QuizStore.memory();
            await store.write('v4', {'q1': {'o1'}}, 1);
            await open(app(o.FakeApi().client, signedIn: false, quiz: store));
            await tester.tap(find.byKey(const Key('start')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('opt-travel')));
            await tester.pumpAndSettle();
            await seen('02_quiz_reply');

            await open(app(scaleApi, signedIn: false));
            await tester.tap(find.byKey(const Key('start')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('opt-4')));
            await tester.pumpAndSettle();
            await tester.tap(find.byType(BackButtonIcon));
            await tester.pumpAndSettle();
            await seen('03_quiz_scale');

            await open(app(HomeApi(count: 9).client));
            await seen('04_home_week');
            await tester.tap(find.byKey(const Key('wk-2026-11-14')));
            await tester.pumpAndSettle();
            await seen('05_home_day');
            await tester.tap(find.text(tab.events).last);
            await tester.pumpAndSettle();
            await seen('06_ready');

            await open(app(inboxApi, unlock: AlwaysUnlock()));
            await tester.tap(find.text(tab.inbox).last);
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('unlock')));
            await tester.pumpAndSettle();
            await seen('07_inbox');

            await open(app(() => m.api(online: () => true)));
            await tester.tap(find.text(tab.account).last);
            await tester.pumpAndSettle();
            await seen('08_account');
            await tester.tap(find.text(tab.events).last);
            await tester.pumpAndSettle();
            await seen('09_next_meetup');
            await tester.tap(find.byKey(const Key('booking-${m.bookingId}')));
            await tester.pumpAndSettle();
            await seen('10_details');
            await tester.drag(find.byType(ListView).last, const Offset(0, -420));
            await tester.pumpAndSettle();
            await seen('11_details_pinned');

            await open(app(b.Fake().client));
            await tester.tap(find.byKey(const Key('session-s9')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('hold')));
            await tester.pumpAndSettle();
            await seen('12_review');

            await s.openDetails(tester, s.Fake('completed'));
            size();
            await tester.pumpAndSettle();
            if (lang == 'en') {
              Provider.of<LocaleController>(tester.element(find.byType(Navigator).first), listen: false).toggle();
              await tester.pumpAndSettle();
            }
            await tester.ensureVisible(find.byKey(const Key('rate')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('rate')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('overall-5')));
            await tester.tap(find.byKey(const Key('comfort-4')));
            await tester.pumpAndSettle();
            await seen('13_feedback');
            await tester.ensureVisible(find.byKey(const Key('send-feedback')));
            await tester.tap(find.byKey(const Key('send-feedback')));
            await tester.pumpAndSettle();
            await seen('14_feedback_sent');
          });
        }
      }
    }
  });
}
