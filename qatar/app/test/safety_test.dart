import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
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
              'booking': {'ref': 'RT-ABC123', 'status': 'paid_awaiting_group', 'cancellation': {'can_cancel': phase == 'forming', 'refund_if_cancelled_now': refund, 'full_refund_until': '2026-11-10T19:30:00+03:00'}},
              'session': {'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل', 'conversation_language': 'ar'},
              'reveal': {'phase': phase, 'reveal_at': '2026-11-11T19:30:00+03:00'},
              'payment': {'amount': {'display': '59 ر.ق'}, 'status': 'succeeded'},
              'table': phase == 'completed' ? {'confirmed_count': 5, 'capacity': 6, 'members': [{'seat': 'seat_sara', 'display_name': 'سارة'}]} : null,
              'venue': null,
              'actions': phase == 'forming' ? [{'type': 'cancel'}] : [],
            });
          case '/api/v1/bookings/$bookingId/cancel':
            return j({'status': 'cancelled_by_user'});
          case '/api/v1/bookings/$bookingId/contacts':
            return j({'open': true, 'closes_at': '2026-11-19T19:30:00+03:00', 'members': [
              {'seat': 'seat_sara', 'display_name': 'سارة', 'state': contactState, 'request_id': contactState == 'incoming' ? 'req1' : null,
               'whatsapp_url': contactState == 'connected' ? 'https://wa.me/97455501234' : null, 'can_send': contactState == 'none'},
            ]});
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

Future<void> openDetails(WidgetTester tester, Fake f) async {
  tallScreen(tester);
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: f.client));
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
    expect(find.byKey(const Key('call-coord')), findsOneWidget);
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
    expect(find.byKey(const Key('call-999')), findsOneWidget);
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
}
