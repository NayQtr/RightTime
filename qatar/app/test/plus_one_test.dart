// The owner's decisions of 14 Nov 2026 in the app: the waitlist steps under a full session, the one refund line, the
// "what does the organising fee cover?" screen with its questions, and "+1" (one companion, two seats, one total).
// Each is checked for behaviour against a fake API that follows the agreed contract, for an API from before the new
// fields, and at the four phone widths with the real fonts in Arabic and English, light and dark.
// To look at the screens: HZ_PLUS_ONE_SHOTS=/some/dir flutter test --update-goldens test/plus_one_test.dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show SemanticsProperties;
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/link_opener.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/models.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:herzone/ui/format.dart';
import 'package:herzone/ui/meetups/home_tab.dart' show homeNow;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'booking_test.dart' as b;
import 'meetups_test.dart' show tallScreen;
import 'screens_golden_test.dart' show loadFonts, settleImages;
import 'sign_in_flow_test.dart' show config, j;

const deadlineAr = 'الثلاثاء 10 نوفمبر · 7:30 م';
const refundAr = 'إلغاء مجاني حتى $deadlineAr. بعده لا يُرد رسم التنظيم.';

/// One open session (s9) and two full ones (s8 this week, s7 later). A booking with a guest holds two seats and costs
/// twice the fee; the list, the details and the cancel screen then carry the guest and the total.
class Fake {
  Fake({this.plusOne = true, this.refuseSeats = false, this.refuseName = false, this.oldApi = false});

  /// What the session says about seating two; null: a server that does not say.
  final bool? plusOne;
  final bool refuseSeats, refuseName, oldApi;
  bool booked = false, paid = false, cancelled = false;
  String? guest;
  String lang = 'ar';
  final sent = <String, Map<String, dynamic>>{};

  int get seats => guest == null ? 1 : 2;
  Map<String, dynamic> money(int minor) => {'amount_minor': minor, 'currency': 'QAR', 'display': lang.startsWith('en') ? 'QAR ${minor ~/ 100}' : '${minor ~/ 100} ر.ق'};
  Map<String, dynamic> get extra => oldApi ? {} : {'seats': seats, 'guest_name': guest, 'unit_fee_minor': 5900};
  String get status => cancelled ? 'cancelled_by_user' : paid ? 'paid_awaiting_group' : 'payment_pending';

  Map<String, dynamic> session(String id, String startsAt, {bool full = false}) => {
        'id': id, 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true, 'starts_at': startsAt,
        'district': lang.startsWith('en') ? 'West Bay' : 'الدفنة', 'seats_left': full ? 0 : 5, 'is_full': full, 'my_booking_id': null,
        if (plusOne != null && !oldApi) 'plus_one_available': plusOne! && !full,
      };

  Map<String, dynamic> booking() => {
        'booking_id': 'b1', 'id': 'b1', 'ref': 'RT-NEW1', 'status': status, 'hold_expires_at': '2026-11-05T20:10:00+03:00',
        'amount': money(5900 * seats), 'checkout_url': 'https://herzone.app/checkout/mock/b1?pi=pi_1', 'payment': {'status': paid ? 'succeeded' : 'created'},
        'cancellation': {'full_refund_until': '2026-11-10T19:30:00+03:00', 'full_refund_window_open': true, 'acknowledgement_required': null},
        ...extra,
        if (!oldApi) 'plus_one_available': false,
      };

  MockClient client() => MockClient((r) async {
        lang = r.headers['accept-language'] ?? 'ar';
        final body = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
        if (r.method == 'POST') sent[r.url.path] = body;
        switch (r.url.path) {
          case '/api/v1/auth/token:refresh':
            return j({'access_token': 'at_1', 'refresh_token': 'rt_2'});
          case '/api/v1/users/me':
            return j({'user': {'id': 'u1', 'status': 'active', 'registration_status': 'complete'}});
          case '/api/v1/questionnaires/current':
            return j({'questionnaire_version_id': 'v4', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true});
          case '/api/v1/sessions':
            return j({'sessions': [
              session('s9', '2026-11-12T19:30:00+03:00'),
              session('s8', '2026-11-14T19:30:00+03:00', full: true),
              session('s7', '2026-11-26T19:30:00+03:00', full: true),
            ]});
          case '/api/v1/bookings' when r.method == 'POST':
            final g = body['guest'] as Map<String, dynamic>?;
            if (g != null && refuseSeats) return j({'code': 'NOT_ENOUGH_SEATS', 'message': 'لا يتوفر مقعدان.'}, 409);
            if (g != null && refuseName) return j({'code': 'GUEST_NAME_REQUIRED', 'message': 'اكتبي اسم مرافقتك.'}, 422);
            guest = g?['name'] as String?;
            booked = true;
            return j(booking(), 201);
          case '/api/v1/bookings':
            return j({'bookings': [
              if (booked) {'id': 'b1', 'ref': 'RT-NEW1', 'status': status, 'phase': cancelled ? 'cancelled' : 'forming', 'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00',
                'district': lang.startsWith('en') ? 'West Bay' : 'الدفنة', ...extra},
            ]});
          case '/api/v1/bookings/b1':
            return j(booking());
          case '/api/v1/bookings/b1/event-details':
            return j({
              'booking': {'ref': 'RT-NEW1', 'status': status, ...extra, 'cancellation': {'can_cancel': true, 'refund_if_cancelled_now': 'full', 'full_refund_until': '2026-11-10T19:30:00+03:00'}},
              'session': {'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': lang.startsWith('en') ? 'West Bay' : 'الدفنة', 'conversation_language': 'ar'},
              'reveal': {'phase': 'forming', 'reveal_at': '2026-11-11T19:30:00+03:00'},
              'payment': {'amount': money(5900 * seats), 'status': 'succeeded'},
              'table': null, 'venue': null,
              'actions': [{'type': 'cancel'}],
            });
          case '/api/v1/bookings/b1/cancel':
            cancelled = true;
            return j({'status': 'cancelled_by_user'});
          case '/api/v1/support/contact':
            return j({'coordinator': null});
        }
        return j({'code': 'NOT_FOUND'}, 404);
      });
}

HerZoneApp app(Fake f) => HerZoneApp(key: UniqueKey(), config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(),
    linkOpener: RecordingLinkOpener(), httpClientFactory: f.client);

/// "This week" starts on Friday 13 November 2026: s8 is one of the week's photo cards, s9 and s7 are in the list.
void fixWeek() {
  homeNow = () => DateTime.parse('2026-11-13T09:00:00+03:00');
  addTearDown(() => homeNow = DateTime.now);
}

Future<void> openBook(WidgetTester tester, Fake f) async {
  tallScreen(tester);
  fixWeek();
  await tester.pumpWidget(app(f));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('session-s9')));
  await tester.pumpAndSettle();
}

Future<void> withGuest(WidgetTester tester, String name) async {
  await tester.tap(find.byKey(const Key('plus-one')));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('guest-name')), name);
  await tester.tap(find.byKey(const Key('guest-confirm')));
  await tester.pumpAndSettle();
}

/// The "+1" control as a screen reader meets it.
SemanticsProperties toggle(WidgetTester tester) => tester
    .widgetList<Semantics>(find.ancestor(of: find.byKey(const Key('plus-one')), matching: find.byType(Semantics)))
    .firstWhere((s) => s.properties.button == true)
    .properties;

bool holdOn(WidgetTester tester) => tester.widget<FilledButton>(find.byKey(const Key('hold'))).onPressed != null;
String textOf(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(Key(key))).data!;

void main() {
  testWidgets('+1: off by default; on, it explains itself and asks for her companion\'s name and the confirmation', (tester) async {
    await openBook(tester, Fake());
    expect(toggle(tester).selected, isFalse);
    expect(toggle(tester).enabled, isTrue);
    expect(find.byKey(const Key('guest-name')), findsNothing);
    expect(find.byKey(const Key('plus-one-unavailable')), findsNothing);
    expect(holdOn(tester), isTrue, reason: 'alone, she books as before');

    await tester.tap(find.byKey(const Key('plus-one')));
    await tester.pumpAndSettle();
    expect(toggle(tester).selected, isTrue);
    expect(find.text('هذا الخيار يتيح لكِ الحضور برفقة من تودّين حضورها.'), findsOneWidget);
    expect(find.text('اسم مرافقتك'), findsOneWidget, reason: 'the field carries its label');
    expect(tester.widget<TextField>(find.byKey(const Key('guest-name'))).maxLength, 60);
    expect(find.text('أؤكد أن مرافقتي امرأة وعمرها 18 سنة أو أكثر.'), findsOneWidget);

    // both are needed: the name alone, or the confirmation alone, does not open the button
    expect(holdOn(tester), isFalse);
    await tester.enterText(find.byKey(const Key('guest-name')), 'سارة');
    await tester.pump();
    expect(holdOn(tester), isFalse);
    await tester.tap(find.byKey(const Key('guest-confirm')));
    await tester.pump();
    expect(holdOn(tester), isTrue);
    await tester.enterText(find.byKey(const Key('guest-name')), '   ');
    await tester.pump();
    expect(holdOn(tester), isFalse, reason: 'spaces are not a name');

    // off again: she books alone, and nothing about a guest is sent
    await tester.tap(find.byKey(const Key('plus-one')));
    await tester.pumpAndSettle();
    expect(holdOn(tester), isTrue);
  });

  testWidgets('+1 booked: the request carries the guest, and the review shows two seats, the fee twice and the doubled total on the button', (tester) async {
    final f = Fake();
    await openBook(tester, f);
    await withGuest(tester, ' سارة ');
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings'], {'session_id': 's9', 'guest': {'name': 'سارة'}});
    expect(textOf(tester, 'fee-line'), 'رسم التنظيم × 2');
    expect(textOf(tester, 'amount'), '118 ر.ق');
    expect(textOf(tester, 'seats'), ltrPlusOne('مقعدان · +1 سارة'));
    expect(find.descendant(of: find.byKey(const Key('pay')), matching: find.text('ادفعي 118 ر.ق')), findsOneWidget);
    expect(find.text(refundAr), findsOneWidget);
  });

  testWidgets('booked alone: the request has no guest and the review reads as before', (tester) async {
    final f = Fake();
    await openBook(tester, f);
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings'], {'session_id': 's9'});
    expect(textOf(tester, 'fee-line'), 'رسم التنظيم');
    expect(textOf(tester, 'amount'), '59 ر.ق');
    expect(find.byKey(const Key('seats')), findsNothing);
    expect(find.descendant(of: find.byKey(const Key('pay')), matching: find.text('ادفعي 59 ر.ق')), findsOneWidget);
  });

  for (final (name, f) in [('says it cannot seat two', Fake(plusOne: false)), ('does not say', Fake(plusOne: null)), ('is from before +1', Fake(oldApi: true))]) {
    testWidgets('+1 is disabled, with the line that says so, when the session $name', (tester) async {
      await openBook(tester, f);
      expect(toggle(tester).enabled, isFalse);
      expect(find.text('لا يتوفر مقعدان في هذا الموعد.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('plus-one')), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(toggle(tester).selected, isFalse);
      expect(find.byKey(const Key('guest-name')), findsNothing);
      await tester.tap(find.byKey(const Key('hold')));
      await tester.pumpAndSettle();
      expect(f.sent['/api/v1/bookings'], {'session_id': 's9'});
      expect(textOf(tester, 'amount'), '59 ر.ق');
    });
  }

  testWidgets('the second seat went while she chose: +1 turns off with the line, announced, and she can book alone', (tester) async {
    final f = Fake(refuseSeats: true);
    await openBook(tester, f);
    await withGuest(tester, 'سارة');
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('amount')), findsNothing, reason: 'nothing was held');
    expect(find.text('لا يتوفر مقعدان في هذا الموعد.'), findsOneWidget);
    expect(find.text('لا يتوفر مقعدان.'), findsNothing, reason: 'the line explains it; no second message');
    final live = tester.widget<Semantics>(find.ancestor(of: find.byKey(const Key('plus-one-unavailable')), matching: find.byType(Semantics)).first);
    expect(live.properties.liveRegion, isTrue);
    expect(toggle(tester).enabled, isFalse);
    expect(toggle(tester).selected, isFalse);
    expect(find.byKey(const Key('guest-name')), findsNothing);
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings'], {'session_id': 's9'});
    expect(textOf(tester, 'amount'), '59 ر.ق');
  });

  testWidgets('the server refuses the name: its own words are shown and announced, and her entries stay', (tester) async {
    await openBook(tester, Fake(refuseName: true));
    await withGuest(tester, 'سارة');
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(find.text('اكتبي اسم مرافقتك.'), findsOneWidget);
    expect(tester.widget<Semantics>(find.ancestor(of: find.text('اكتبي اسم مرافقتك.'), matching: find.byType(Semantics)).first).properties.liveRegion, isTrue);
    expect(toggle(tester).selected, isTrue);
    expect(find.text('سارة'), findsOneWidget);
  });

  testWidgets('+1 with reduced motion: the control changes at once', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await openBook(tester, Fake());
    expect(tester.widget<AnimatedContainer>(find.descendant(of: find.byKey(const Key('plus-one')), matching: find.byType(AnimatedContainer))).duration, Duration.zero);
    await tester.tap(find.byKey(const Key('plus-one')));
    await tester.pump();
    expect(toggle(tester).selected, isTrue);
    expect(find.byKey(const Key('guest-name')), findsOneWidget);
  });

  testWidgets('after paying: my meetups, the details and the cancel screen show +1 with her name and the total; cancelling covers both seats', (tester) async {
    final f = Fake();
    await openBook(tester, f);
    await withGuest(tester, 'سارة');
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pump();
    // she pays in the browser and comes back
    f.paid = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'عرض التفاصيل'));
    await tester.pumpAndSettle();
    // the total on the card comes from the fee for one seat, as the list carries no amount
    expect(textOf(tester, 'plus-one-card'), ltrPlusOne('+1 سارة · 118 ر.ق'));

    await tester.tap(find.byKey(const Key('booking-b1')));
    await tester.pumpAndSettle();
    final fact = find.byKey(const Key('plus-one-details'));
    expect(find.descendant(of: fact, matching: find.text(ltrPlusOne('+1 سارة'))), findsOneWidget);
    expect(find.descendant(of: fact, matching: find.text('مقعدان · رسم التنظيم × 2: 118 ر.ق')), findsOneWidget);
    expect(textOf(tester, 'refund-line'), refundAr);

    await tester.tap(find.byKey(const Key('cancel')));
    await tester.pumpAndSettle();
    expect(textOf(tester, 'plus-one-cancel'), ltrPlusOne('+1 سارة · 118 ر.ق'));
    expect(find.text('الإلغاء يشمل مقعدك ومقعد مرافقتك.'), findsOneWidget);
    expect(find.textContaining('ستستردين 118 ر.ق كاملة'), findsOneWidget, reason: 'one refund of the whole amount');
    await tester.tap(find.byKey(const Key('confirm-cancel')));
    await tester.pumpAndSettle();
    expect(f.cancelled, isTrue);
  });

  testWidgets('a booking of one seat: no +1 line on the card, the details or the cancel screen', (tester) async {
    final f = Fake()
      ..booked = true
      ..paid = true;
    tallScreen(tester);
    await tester.pumpWidget(app(f));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('plus-one-card')), findsNothing);
    await tester.tap(find.byKey(const Key('booking-b1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('plus-one-details')), findsNothing);
    await tester.tap(find.byKey(const Key('cancel')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('plus-one-cancel')), findsNothing);
    expect(find.byKey(const Key('cancel-both')), findsNothing);
  });

  test('objects from an API before +1 read as one seat, no guest, the amount as the fee, and +1 not available', () {
    final start = BookingStart.fromJson(b.Fake().booking()..['amount'] = {'amount_minor': 5900, 'currency': 'QAR', 'display': '59 ر.ق'});
    expect((start.seats, start.guestName, start.unitFeeMinor, start.plusOneAvailable), (1, null, 5900, false));
    final bare = BookingStart.fromJson(b.Fake().booking());
    expect((bare.seats, bare.unitFeeMinor), (1, null), reason: 'an amount without minor units still reads');
    final row = BookingSummary.fromJson({'id': 'b1', 'ref': 'RT-1', 'status': 'paid_awaiting_group', 'phase': 'forming', 'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل'});
    expect((row.seats, row.guestName, row.unitFeeMinor, row.amount), (1, null, null, null));
    final details = EventDetails({'booking': {'ref': 'RT-1', 'status': 'revealed'}, 'payment': {'amount': {'amount_minor': 5900, 'display': '59 ر.ق'}}});
    expect((details.seatCount, details.guestName, details.unitFeeMinor), (1, null, 5900));
    final s = SessionSummary.fromJson({'id': 's1', 'experience': 'dinner', 'conversation_language': 'ar', 'starts_at': '2026-11-12T19:30:00+03:00', 'seats_left': 4, 'is_full': false});
    expect(s.plusOneAvailable, isFalse);
  });

  test('objects with the new fields read them; odd values fall back to one seat', () {
    final two = BookingStart.fromJson({...b.Fake().booking(), 'seats': 2, 'guest_name': 'سارة', 'unit_fee_minor': 5900, 'plus_one_available': true});
    expect((two.seats, two.guestName, two.unitFeeMinor, two.plusOneAvailable), (2, 'سارة', 5900, true));
    final odd = BookingSummary.fromJson({'id': 'b1', 'ref': 'RT-1', 'status': 'x', 'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'seats': 7, 'guest_name': ''});
    expect((odd.seats, odd.guestName), (1, null));
    expect(fmtMoney(11800, 'ar'), '118 ر.ق');
    expect(fmtMoney(11850, 'en'), 'QAR 118.50');
  });

  testWidgets('the fee line opens what the fee covers and the questions; each question opens its answer', (tester) async {
    await openBook(tester, Fake());
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('fee-info')));
    await tester.pumpAndSettle();
    expect(textOf(tester, 'fee-info-title'), 'ماذا يشمل رسم التنظيم؟');
    final covers = find.byKey(const Key('fee-covers'));
    final lines = tester.widgetList<Text>(find.descendant(of: covers, matching: find.byType(Text))).map((w) => w.data).toList();
    expect(lines, [
      'يشمل',
      'اختيار طاولة من 4 إلى 6 سيدات بلغتك وضمن ميزانيتك.',
      'حجز المكان وكشفه لكِ قبل اللقاء بيوم.',
      'منسّق مناوب يمكنك الاتصال به يوم اللقاء.',
      'لا يشمل',
      'الطعام والمشروبات، تدفعينها للمكان.',
    ]);
    const faq = [
      ('متى أعرف المكان؟', 'نكشفه لكِ قبل اللقاء بيوم.'),
      ('ماذا لو لم تكتمل الطاولة؟', 'نُلغيها ونرد المبلغ كاملًا أو ننقلك لموعد آخر باختيارك.'),
      ('هل أستطيع الإلغاء؟', 'نعم، مع استرداد كامل حتى المهلة التي تظهر لكِ قبل الدفع.'),
      ('هل يُشارَك رقمي مع أحد؟', 'لا نشارك رقم جوالك مع أحد.'),
      ('هل أستطيع الحضور مع صديقة؟', 'نعم. اختاري «+1» عند الحجز لتحضري برفقة من تودّين حضورها، ويُحسب رسم التنظيم لمقعدين.'),
    ];
    for (final (i, (q, a)) in faq.indexed) {
      expect(find.descendant(of: find.byKey(Key('faq-${i + 1}')), matching: find.text(q)), findsOneWidget);
      expect(find.byKey(Key('faq-${i + 1}-answer')), findsNothing, reason: 'closed until she asks');
      await tester.tap(find.text(q));
      await tester.pumpAndSettle();
      expect(textOf(tester, 'faq-${i + 1}-answer'), ltrPlusOne(a));
    }
    await tester.tap(find.text(faq.first.$1));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('faq-1-answer')), findsNothing, reason: 'a second tap closes it');
    await tester.tap(find.byType(BackButtonIcon).last);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pay')), findsOneWidget, reason: 'back on the review, the seat still held');
  });

  testWidgets('the fee questions with reduced motion: an answer is there at once', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await openBook(tester, Fake());
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('fee-info')));
    await tester.pumpAndSettle();
    expect(tester.widget<ExpansionTile>(find.byKey(const Key('faq-3'))).expansionAnimationStyle, AnimationStyle.noAnimation);
    await tester.tap(find.byKey(const Key('faq-3')));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('faq-3-answer')), findsOneWidget);
    expect(tester.getSize(find.byKey(const Key('faq-3-answer'))).height, greaterThan(0), reason: 'fully open, not growing');
  });

  testWidgets('a full session lists the three waitlist steps as information; a session with room does not', (tester) async {
    tallScreen(tester);
    fixWeek();
    await tester.pumpWidget(app(Fake()));
    await tester.pumpAndSettle();
    for (final id in ['s8', 's7']) {
      final steps = find.descendant(of: find.byKey(Key('session-$id')), matching: find.byKey(const Key('waitlist-steps')));
      expect(steps, findsOneWidget);
      expect(tester.widgetList<Text>(find.descendant(of: steps, matching: find.byType(Text))).map((w) => w.data).toList(), [
        '1', 'انضمّي لقائمة الانتظار.',
        '2', 'إذا توفّر مقعد نحجزه لكِ ونرسل لكِ إشعارًا.',
        '3', 'أكّدي وادفعي خلال المدة المذكورة في الإشعار، وإلا انتقل المقعد لمن بعدك.',
      ]);
      expect(find.descendant(of: find.byKey(Key('session-$id')), matching: find.text('ممتلئ')), findsOneWidget);
      expect(tester.widget<InkWell>(find.descendant(of: find.byKey(Key('session-$id')), matching: find.byType(InkWell))).onTap, isNull, reason: 'no join action is invented');
    }
    expect(find.descendant(of: find.byKey(const Key('session-s9')), matching: find.byKey(const Key('waitlist-steps'))), findsNothing);
  });

  testWidgets('the refund line carries the booking\'s own deadline; a late booking keeps its warning instead', (tester) async {
    await openBook(tester, Fake());
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(textOf(tester, 'terms'), refundAr);
    expect(tester.getTopLeft(find.byKey(const Key('terms'))).dy, greaterThan(tester.getBottomLeft(find.byKey(const Key('pay'))).dy), reason: 'after the pay button');
    expect(find.textContaining('إذا لم تكتمل الطاولة'), findsNothing, reason: 'the longer note has given way');

    await b.start(tester, b.Fake(late: true));
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(textOf(tester, 'terms'), 'موعد هذا اللقاء قريب: إذا ألغيتِ بعد الدفع فلن يُسترد رسم التنظيم.');
    expect(find.textContaining('إلغاء مجاني'), findsNothing);
  });

  group('layout with the real fonts', () {
    setUpAll(loadFonts);
    final shots = Platform.environment['HZ_PLUS_ONE_SHOTS'];
    for (final width in [360.0, 390.0, 402.0, 430.0]) {
      for (final lang in ['ar', 'en']) {
        for (final dark in [false, true]) {
          final tag = '${width.toInt()}_${lang}_${dark ? 'dark' : 'light'}';
          testWidgets('${width.toInt()} $lang ${dark ? 'dark' : 'light'}: the waitlist, fee, refund and +1 screens fit', (tester) async {
            tester.view.physicalSize = Size(width * 3, 844 * 3);
            tester.view.devicePixelRatio = 3;
            tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
            addTearDown(tester.view.reset);
            addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
            fixWeek();
            Future<void> seen(String name) async {
              expect(tester.takeException(), isNull, reason: '$name at $tag');
              if (shots == null) return;
              await settleImages(tester);
              await expectLater(find.byType(MaterialApp), matchesGoldenFile(Uri.file('$shots/${tag}_$name.png')));
            }

            Future<void> show(String key, {double step = -150}) async {
              // a list builds only what is near the screen: move towards the row until it exists, then bring it in
              for (var i = 0; i < 30 && find.byKey(Key(key)).evaluate().isEmpty; i++) {
                await tester.drag(find.byType(ListView).last, Offset(0, step));
                await tester.pump();
              }
              await tester.ensureVisible(find.byKey(Key(key)));
              await tester.pumpAndSettle();
            }

            final f = Fake();
            await tester.pumpWidget(app(f));
            await tester.pumpAndSettle();
            if (lang == 'en') {
              Provider.of<LocaleController>(tester.element(find.byType(Navigator).first), listen: false).toggle();
              await tester.pumpAndSettle();
            }
            await seen('01_home_full_week');
            await show('session-s7');
            await seen('02_home_full_list');

            await show('session-s9', step: 150);
            await tester.tap(find.byKey(const Key('session-s9')));
            await tester.pumpAndSettle();
            await seen('03_book_plus_one_off');
            await withGuest(tester, lang == 'ar' ? 'سارة بنت عبدالله الكواري' : 'Sarah Abdullah Al-Kuwari');
            await show('hold');
            await seen('04_book_plus_one_on');
            await tester.tap(find.byKey(const Key('hold')));
            await tester.pumpAndSettle();
            await seen('05_review_two_seats');

            await tester.tap(find.byKey(const Key('fee-info')));
            await tester.pumpAndSettle();
            await seen('06_fee');
            await show('faq-5');
            await tester.tap(find.byKey(const Key('faq-5')));
            await tester.pumpAndSettle();
            await show('faq-5-answer');
            await seen('07_fee_answer');
            await tester.tap(find.byType(BackButtonIcon).last);
            await tester.pumpAndSettle();

            f.paid = true;
            Navigator.of(tester.element(find.byKey(const Key('pay')))).pop();
            await tester.pumpAndSettle();
            await tester.tap(find.text(lang == 'ar' ? 'لقاءاتي' : 'My events').last);
            await tester.pumpAndSettle();
            await seen('08_events_card');
            await tester.tap(find.byKey(const Key('booking-b1')));
            await tester.pumpAndSettle();
            await seen('09_details');
            await show('cancel');
            await seen('10_details_refund_line');
            await tester.tap(find.byKey(const Key('cancel')));
            await tester.pumpAndSettle();
            await seen('11_cancel');
          });
        }
      }
    }
  });

  // a session that cannot seat two, and the review of one seat
  group('layout with the real fonts: +1 not available', () {
    setUpAll(loadFonts);
    final shots = Platform.environment['HZ_PLUS_ONE_SHOTS'];
    for (final width in [360.0, 390.0, 402.0, 430.0]) {
      for (final lang in ['ar', 'en']) {
        for (final dark in [false, true]) {
          final tag = '${width.toInt()}_${lang}_${dark ? 'dark' : 'light'}';
          testWidgets('${width.toInt()} $lang ${dark ? 'dark' : 'light'}: the disabled +1 and the one-seat review fit', (tester) async {
            tester.view.physicalSize = Size(width * 3, 844 * 3);
            tester.view.devicePixelRatio = 3;
            tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
            addTearDown(tester.view.reset);
            addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
            fixWeek();
            await tester.pumpWidget(app(Fake(plusOne: false)));
            await tester.pumpAndSettle();
            if (lang == 'en') {
              Provider.of<LocaleController>(tester.element(find.byType(Navigator).first), listen: false).toggle();
              await tester.pumpAndSettle();
            }
            for (var i = 0; i < 30 && find.byKey(const Key('session-s9')).evaluate().isEmpty; i++) {
              await tester.drag(find.byType(ListView).last, const Offset(0, -150));
              await tester.pump();
            }
            await tester.ensureVisible(find.byKey(const Key('session-s9')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('session-s9')));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: 'disabled +1 at $tag');
            if (shots != null) await expectLater(find.byType(MaterialApp), matchesGoldenFile(Uri.file('$shots/${tag}_12_book_plus_one_disabled.png')));
            await tester.tap(find.byKey(const Key('hold')));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: 'one-seat review at $tag');
            if (shots != null) await expectLater(find.byType(MaterialApp), matchesGoldenFile(Uri.file('$shots/${tag}_13_review_one_seat.png')));
          });
        }
      }
    }
  });
}
