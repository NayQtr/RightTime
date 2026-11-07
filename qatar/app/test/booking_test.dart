import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/link_opener.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/testing.dart';

import 'meetups_test.dart' show tallScreen;
import 'sign_in_flow_test.dart' show config, j;

/// One open session; the seat is held on booking and paid once the checkout page has been opened.
class Fake {
  Fake({this.late = false});
  final bool late;
  bool paid = false;
  final sent = <String, Map<String, dynamic>>{};

  Map<String, dynamic> booking() => {
        'booking_id': 'b1', 'id': 'b1', 'ref': 'RT-NEW1', 'status': paid ? 'paid_awaiting_group' : 'payment_pending',
        'hold_expires_at': '2026-11-05T20:10:00+03:00', 'amount': {'display': '59 ر.ق'},
        'checkout_url': late ? null : 'https://herzone.app/checkout/mock/b1?pi=pi_1',
        'payment': {'status': paid ? 'succeeded' : 'created'},
        'cancellation': {'full_refund_until': '2026-11-10T19:30:00+03:00', 'full_refund_window_open': !late, 'acknowledgement_required': late ? 'late_no_refund' : null},
      };

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
          case '/api/v1/sessions':
            return j({'sessions': [{'id': 's9', 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true, 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'الدفنة', 'seats_left': 5, 'is_full': false, 'my_booking_id': null}]});
          case '/api/v1/bookings':
            return j(booking(), 201);
          case '/api/v1/bookings/b1':
            return j(booking());
          case '/api/v1/bookings/b1/checkout':
            return j({'checkout_url': 'https://herzone.app/checkout/mock/b1?pi=pi_2'});
        }
        return j({'code': 'NOT_FOUND'}, 404);
      });
}

Future<RecordingLinkOpener> start(WidgetTester tester, Fake f) async {
  tallScreen(tester);
  final links = RecordingLinkOpener();
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), linkOpener: links, httpClientFactory: f.client));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('session-s9')));
  await tester.pumpAndSettle();
  return links;
}

void main() {
  testWidgets('celebration: she says the date is her birthday, and the booking carries the occasion', (tester) async {
    final f = Fake();
    await start(tester, f);
    expect(find.text('هل تحتفلين بمناسبة في هذا الموعد؟'), findsOneWidget);
    expect(find.text('عيد ميلادي'), findsOneWidget);
    expect(find.byIcon(Icons.cake_outlined), findsOneWidget);
    await tester.tap(find.byKey(const Key('occasion-birthday')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings'], {'session_id': 's9', 'occasion': 'birthday'});
  });

  testWidgets('book: hold the seat, review fee and refund terms, pay on the provider page, come back paid', (tester) async {
    final f = Fake();
    final links = await start(tester, f);
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings'], {'session_id': 's9'});
    expect(find.text('59 ر.ق'), findsOneWidget);
    expect(find.textContaining('استرداد كامل حتى'), findsOneWidget);
    expect(find.byKey(const Key('ack')), findsNothing);

    await tester.tap(find.byKey(const Key('pay')));
    await tester.pump();
    expect(links.opened.single.toString(), 'https://herzone.app/checkout/mock/b1?pi=pi_1');
    expect(find.byKey(const Key('waiting')), findsOneWidget);

    // she pays in the browser and comes back
    f.paid = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('paid')), findsOneWidget);
    expect(find.text('رقم الحجز RT-NEW1'), findsOneWidget);
  });

  testWidgets('close to the date: paying needs the no-refund acknowledgement, which is sent with the checkout', (tester) async {
    final f = Fake(late: true);
    final links = await start(tester, f);
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(find.textContaining('لن يُسترد رسم التنظيم'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('pay'))).onPressed, isNull);
    await tester.tap(find.byKey(const Key('ack')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pay')));
    await tester.pump();
    expect(f.sent['/api/v1/bookings/b1/checkout'], {'acknowledge_late_no_refund': true});
    expect(links.opened.single.queryParameters['pi'], 'pi_2');
    // stop the payment check timer before the test ends
    f.paid = true;
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
