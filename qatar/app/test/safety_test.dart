import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/link_opener.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/testing.dart';

import 'meetups_test.dart' show bookingId, tallScreen;
import 'sign_in_flow_test.dart' show config, j;

/// A signed-in member with one booking, in the phase given; records what the app sends.
class Fake {
  Fake(this.phase, {this.refund = 'full'});
  final String phase;
  final String? refund;
  final sent = <String, Map<String, dynamic>>{};
  String contactState = 'none';
  bool checkedIn = false;
  bool rebooked = false;

  MockClient client() => MockClient((r) async {
        final body = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
        if (r.method == 'POST') sent[r.url.path] = body;
        switch (r.url.path) {
          case '/api/v1/auth/token:refresh':
            return j({'access_token': 'at_1', 'refresh_token': 'rt_2'});
          case '/api/v1/users/me':
            return j({'user': {'id': 'u1', 'status': 'active', 'registration_status': 'complete'}});
          case '/api/v1/questionnaires/current':
            return j({'questionnaire_version_id': 'v4', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true});
          case '/api/v1/bookings':
            return j({'bookings': [{'id': bookingId, 'ref': 'RT-ABC123', 'status': 'paid_awaiting_group', 'phase': phase, 'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل'}]});
          case '/api/v1/bookings/$bookingId/event-details':
            return j({
              'booking': {'ref': 'RT-ABC123', 'status': checkedIn ? 'checked_in' : 'paid_awaiting_group', 'cancellation': {'can_cancel': phase == 'forming', 'refund_if_cancelled_now': refund, 'full_refund_until': '2026-11-10T19:30:00+03:00'}},
              'session': {'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل', 'conversation_language': 'ar'},
              'reveal': {'phase': phase, 'reveal_at': '2026-11-11T19:30:00+03:00'},
              'payment': {'amount': {'display': '59 ر.ق'}, 'status': 'succeeded'},
              'table': phase == 'completed' ? {'confirmed_count': 5, 'capacity': 6, 'members': [{'seat': 'seat_sara', 'display_name': 'سارة'}]} : null,
              'venue': null,
              if (phase == 'cancelled' && !rebooked)
                'resolution': {'choice_deadline': '2026-11-14T19:30:00+03:00', 'default_if_no_choice': 'refund', 'open': true, 'options': [
                  {'type': 'rebook', 'sessions': [{'session_id': 'alt1', 'starts_at': '2026-11-19T19:30:00+03:00', 'district': 'مشيرب', 'seats_left': 4, 'is_alternate': true}]},
                  {'type': 'refund', 'amount': {'display': '59 ر.ق'}},
                ]},
              if (rebooked) 'rebooked_into': {'booking_id': 'b-new', 'ref': 'RT-NEW9', 'status': 'paid_awaiting_group'},
              'actions': [
                if (phase == 'forming') {'type': 'cancel'},
                if (phase == 'day_of' && !checkedIn) {'type': 'check_in'},
                if (phase == 'completed') {'type': 'feedback'},
              ],
            });
          case '/api/v1/bookings/$bookingId/cancel':
            return j({'status': 'cancelled_by_user'});
          case '/api/v1/bookings/$bookingId/contacts':
            return j({'open': true, 'closes_at': '2026-11-19T19:30:00+03:00', 'members': [
              {'seat': 'seat_sara', 'display_name': 'سارة', 'state': contactState, 'request_id': contactState == 'incoming' ? 'req1' : null,
               'whatsapp_url': contactState == 'connected' ? 'https://wa.me/97455501234' : null, 'can_send': contactState == 'none'},
            ]});
          case '/api/v1/bookings/$bookingId/resolution':
            rebooked = body['choice'] == 'rebook';
            return j({'choice': body['choice']});
          case '/api/v1/bookings/$bookingId/check-in':
            checkedIn = true;
            return j({'status': 'checked_in'});
          case '/api/v1/bookings/$bookingId/feedback':
            return j({'saved': true}, 201);
          case '/api/v1/contact-requests':
            contactState = 'sent';
            return j({'state': 'sent'}, 201);
          case '/api/v1/reports':
            return j({'case_ref': 'HZ-0042', 'severity': body['immediate_danger'] == true ? 1 : 3}, 201);
          case '/api/v1/support/contact':
            return j({'coordinator': {'tel_url': 'tel:+97460053006', 'phone_display': '6005 3006', 'whatsapp_url': 'https://wa.me/97460053006'}});
        }
        return j({'code': 'NOT_FOUND'}, 404);
      });
}

final links = RecordingLinkOpener();

Future<void> openDetails(WidgetTester tester, Fake f) async {
  tallScreen(tester);
  links.opened.clear();
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), linkOpener: links, httpClientFactory: f.client));
  await tester.pumpAndSettle();
  await tester.tap(find.text('لقاءاتي').last);
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('booking-$bookingId')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('cancel: the refund outcome is stated first, then the cancellation is sent with the reason', (tester) async {
    final f = Fake('forming');
    await openDetails(tester, f);
    expect(find.byKey(const Key('contact-coord')), findsOneWidget);
    await tester.tap(find.byKey(const Key('cancel')));
    await tester.pumpAndSettle();
    expect(find.text('ستستردين 59 ر.ق كاملة إلى بطاقتك خلال 10 أيام عمل.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('reason-illness')));
    await tester.tap(find.byKey(const Key('confirm-cancel')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings/$bookingId/cancel'], {'reason_code': 'illness'});
    expect(find.text('تم إلغاء حجزك.'), findsOneWidget);
  });

  testWidgets('after the refund deadline the screen says no refund', (tester) async {
    await openDetails(tester, Fake('forming', refund: 'none'));
    await tester.tap(find.byKey(const Key('cancel')));
    await tester.pumpAndSettle();
    expect(find.textContaining('لن يُرد رسم التنظيم'), findsOneWidget);
  });

  testWidgets('after the meetup: ask a tablemate to stay in touch; it shows "sent", never a refusal', (tester) async {
    final f = Fake('completed');
    await openDetails(tester, f);
    expect(find.byKey(const Key('contacts')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ask-seat_sara')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/contact-requests'], {'booking_id': bookingId, 'seat': 'seat_sara'});
    expect(find.text('أُرسل الطلب'), findsWidgets);
    expect(find.byKey(const Key('cancel')), findsNothing, reason: 'no cancel after the meetup');
  });

  testWidgets('a connected tablemate has a WhatsApp button', (tester) async {
    await openDetails(tester, Fake('completed')..contactState = 'connected');
    expect(find.byKey(const Key('wa-seat_sara')), findsOneWidget);
  });

  testWidgets('private report: "I am in danger" shows the 999 screen at once; the report names the tablemate', (tester) async {
    final f = Fake('completed');
    await openDetails(tester, f);
    await tester.tap(find.byKey(const Key('report')));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const Key('send-report'))).onPressed, isNull, reason: 'category required');
    await tester.tap(find.byKey(const Key('danger')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('emergency')), findsOneWidget);
    await tester.tap(find.byKey(const Key('call-999')));
    expect(links.opened.last.toString(), 'tel:999');
    await tester.tap(find.text('إغلاق'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cat-threat_violence')));
    await tester.tap(find.byKey(const Key('who-seat_sara')));
    await tester.enterText(find.byKey(const Key('desc')), 'هددتني على الطاولة');
    await tester.tap(find.byKey(const Key('send-report')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/reports'], {
      'booking_id': bookingId, 'category': 'threat_violence', 'timing': 'during', 'immediate_danger': true, 'reported_seat': 'seat_sara', 'description': 'هددتني على الطاولة',
    });
    expect(find.byKey(const Key('report-sent')), findsOneWidget);
    expect(find.textContaining('HZ-0042'), findsOneWidget);
  });

  testWidgets('on the day: "I am here" checks her in', (tester) async {
    final f = Fake('day_of');
    await openDetails(tester, f);
    await tester.tap(find.byKey(const Key('check-in')));
    await tester.pumpAndSettle();
    expect(f.sent.containsKey('/api/v1/bookings/$bookingId/check-in'), true);
    expect(find.byKey(const Key('checked-in')), findsOneWidget);
    expect(find.byKey(const Key('check-in')), findsNothing);
  });

  testWidgets('after the meetup: private rating, two required stars, then thanks', (tester) async {
    final f = Fake('completed');
    await openDetails(tester, f);
    await tester.tap(find.byKey(const Key('rate')));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const Key('send-feedback'))).onPressed, isNull);
    await tester.tap(find.byKey(const Key('overall-5')));
    await tester.tap(find.byKey(const Key('comfort-4')));
    await tester.tap(find.byKey(const Key('again')));
    await tester.enterText(find.byKey(const Key('comment')), 'أمسية جميلة');
    await tester.pump();
    await tester.tap(find.byKey(const Key('send-feedback')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings/$bookingId/feedback'], {'overall_rating': 5, 'comfort_rating': 4, 'would_book_again': true, 'comment': 'أمسية جميلة'});
    expect(find.byKey(const Key('fb-thanks')), findsOneWidget);
  });

  testWidgets('the organiser cancelled: she moves to her alternate session (same fee) and sees the new booking', (tester) async {
    final f = Fake('cancelled', refund: null);
    await openDetails(tester, f);
    expect(find.byKey(const Key('resolution')), findsOneWidget);
    expect(find.textContaining('من بدائلك'), findsOneWidget);
    expect(find.textContaining('59 ر.ق إلى وسيلة الدفع الأصلية'), findsOneWidget);
    await tester.tap(find.byKey(const Key('rebook-alt1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('confirm-choice')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings/$bookingId/resolution'], {'choice': 'rebook', 'session_id': 'alt1'});
    expect(find.text('نقلناك إلى الحجز RT-NEW9.'), findsOneWidget);
    expect(find.byKey(const Key('resolution')), findsNothing);
  });
}
