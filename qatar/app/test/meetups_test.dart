import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'sign_in_flow_test.dart' show config, j;

const bookingId = '22222222-2222-4222-8222-222222222222';

Map<String, dynamic> details({bool revealed = true}) => {
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
MockClient api({required bool Function() online, bool revealed = true}) => MockClient((r) async {
      if (!online()) throw http.ClientException('offline');
      switch (r.url.path) {
        case '/api/v1/auth/token:refresh':
          return j({'access_token': 'at_1', 'refresh_token': 'rt_2'});
        case '/api/v1/users/me':
          return j({'user': {'id': 'u1', 'display_name': 'مريم', 'status': 'active', 'registration_status': 'complete'}});
        case '/api/v1/sessions':
          return j({'sessions': [
            {'id': 's1', 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true, 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل', 'seats_left': 4, 'is_full': false, 'my_booking_id': bookingId},
            {'id': 's2', 'experience': 'coffee', 'conversation_language': 'en', 'language_match': false, 'starts_at': '2026-11-13T10:00:00+03:00', 'district': 'West Bay', 'seats_left': 6, 'is_full': false, 'my_booking_id': null},
          ]});
        case '/api/v1/bookings':
          return j({'bookings': [{'id': bookingId, 'ref': 'RT-ABC123', 'status': 'revealed', 'phase': 'revealed', 'experience': 'dinner', 'starts_at': '2026-11-12T19:30:00+03:00', 'district': 'لوسيل'}]});
        case '/api/v1/bookings/$bookingId/event-details':
          return j(details(revealed: revealed));
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
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: trips, httpClientFactory: () => api(online: () => online)));
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

    // no connection: the same screen opens from the device copy, with a banner
    online = false;
    GoRouter.of(tester.element(find.byKey(const Key('venue')))).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('offline-copy')), findsOneWidget);
    expect(find.text('T-7K'), findsOneWidget);
  });

  testWidgets('before the reveal the venue is hidden, with the reveal time', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), httpClientFactory: () => api(online: () => true, revealed: false)));
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
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: trips, httpClientFactory: () => api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    expect(trips.trips, isEmpty);
  });
}
