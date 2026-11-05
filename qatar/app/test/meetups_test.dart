import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/link_opener.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'sign_in_flow_test.dart' show config, j;

const bookingId = '22222222-2222-4222-8222-222222222222';

Map<String, dynamic> details({bool revealed = true, bool idPending = false}) => {
      if (idPending) 'identity_check': 'pending',
      'booking': {'ref': 'RT-ABC123', 'status': 'revealed'},
      'session': {'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل', 'conversation_language': 'ar', 'food_price_band': {'display': 'متوسط'}},
      'reveal': {'phase': revealed ? 'revealed' : 'forming', 'reveal_at': '2026-11-11T19:30:00+03:00'},
      'table': revealed ? {'confirmed_count': 5, 'capacity': 6, 'code': 'T-7K'} : null,
      'venue': revealed
          ? {'name': 'مطعم الريم', 'address': 'شارع لوسيل 12', 'district': 'لوسيل', 'map_url': 'https://maps.google.com/?q=25.4,51.5', 'arrival_instructions': 'اسألي عن طاولة HerZone', 'bill_policy': 'تدفع كل واحدة طعامها.'}
          : null,
      'actions': [],
    };

/// Signed-in member (refresh token on the device); `online` switches the network on and off.
MockClient api({required bool Function() online, bool revealed = true, bool idPending = false}) => MockClient((r) async {
      if (!online()) throw http.ClientException('offline');
      switch (r.url.path) {
        case '/api/v1/auth/token:refresh':
          return j({'access_token': 'at_1', 'refresh_token': 'rt_2'});
        case '/api/v1/users/me':
          return j({'user': {'id': 'u1', 'display_name': 'مريم', 'status': 'active', 'registration_status': 'complete', 'phone_e164': '+97455512345'}});
        case '/api/v1/sessions':
          return j({'sessions': [
            {'id': 's1', 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true, 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل', 'seats_left': 4, 'is_full': false, 'my_booking_id': bookingId},
            {'id': 's2', 'experience': 'coffee', 'conversation_language': 'en', 'language_match': false, 'starts_at': '2026-11-13T10:00:00+03:00', 'district': 'West Bay', 'seats_left': 6, 'is_full': false, 'my_booking_id': null},
          ]});
        case '/api/v1/bookings':
          return j({'bookings': [{'id': bookingId, 'ref': 'RT-ABC123', 'status': 'revealed', 'phase': 'revealed', 'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل'}]});
        case '/api/v1/bookings/$bookingId/event-details':
          return j(details(revealed: revealed, idPending: idPending));
        case '/api/v1/questionnaires/current':
          return j({'questionnaire_version_id': 'v1', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true});
        case '/api/v1/support/contact':
          return j({'coordinator': {'tel_url': 'tel:+97460053006', 'phone_display': '6005 3006', 'whatsapp_url': 'https://wa.me/97460053006'}});
        case '/api/v1/auth/logout':
          return http.Response('', 204);
      }
      return j({'code': 'NOT_FOUND'}, 404);
    });

/// A tall phone screen, so a whole details page is built (lists only build what is on screen).
void tallScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(390 * 2, 2000 * 2);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

void main() {
  testWidgets('home lists sessions in her languages; details show venue and table code and are saved for offline', (tester) async {
    tallScreen(tester);
    var online = true;
    final trips = MemoryTripStore();
    final links = RecordingLinkOpener();
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: trips, quizStore: QuizStore.memory(), linkOpener: links, httpClientFactory: () => api(online: () => online)));
    await tester.pumpAndSettle();
    expect(find.text('الدوحة، قطر'), findsOneWidget);
    expect(find.byKey(const Key('session-s1')), findsOneWidget);
    expect(find.byKey(const Key('session-s2')), findsNothing, reason: 'English-only session is not in her languages');
    expect(find.text('محجوز'), findsOneWidget);

    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('venue')), findsOneWidget);
    expect(find.text('مطعم الريم'), findsOneWidget);
    expect(find.text('T-7K'), findsOneWidget);
    expect(trips.trips.containsKey(bookingId), true, reason: 'saved on the device');
    await tester.tap(find.byKey(const Key('open-map')));
    expect(links.opened.single.toString(), 'https://maps.google.com/?q=25.4,51.5', reason: 'the map opens; nothing goes to the clipboard');

    // no connection: the same screen opens from the device copy, with a banner
    online = false;
    GoRouter.of(tester.element(find.byKey(const Key('venue')))).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('offline-copy')), findsOneWidget);
    expect(find.text('T-7K'), findsOneWidget);
    // let the API client's one automatic retry (1.2 s) for the coordinator's number finish
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 3)); // the booking lookup's one automatic retry, offline
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wa-coord')), findsOneWidget, reason: 'WhatsApp is still offered from the saved copy');
    await tester.tap(find.byKey(const Key('go-phone')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('call-coord')), findsOneWidget, reason: 'the coordinator can be called with no data');
  });

  testWidgets('before the reveal the venue is hidden, with the reveal time', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => api(online: () => true, revealed: false)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('لقاءاتي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('booking-$bookingId')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('venue-hidden')), findsOneWidget);
    expect(find.byKey(const Key('venue')), findsNothing);
  });

  testWidgets('signing out removes the saved meetups from the device', (tester) async {
    final trips = MemoryTripStore();
    await trips.save(bookingId, details());
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: trips, quizStore: QuizStore.memory(), httpClientFactory: () => api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    expect(trips.trips, isEmpty);
  });

  testWidgets('identity check pending: she is told the venue waits for the review of her payment details', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(),
        httpClientFactory: () => api(online: () => true, revealed: false, idPending: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('id-check')), findsOneWidget);
    expect(find.textContaining('نراجع بيانات الدفع'), findsOneWidget);
    expect(find.byKey(const Key('venue')), findsNothing);
  });
}
