import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/link_opener.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/ui/auth/widgets.dart' show ErrorBanner;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'meetups_test.dart' show api, bookingId, tallScreen;
import 'sign_in_flow_test.dart' show config, j;

/// The tests' signed-in member API, with the call-request endpoint recorded (and optionally failing).
MockClient _api(List<Map<String, dynamic>> requests, {bool fail = false}) {
  final inner = api(online: () => true);
  return MockClient((r) async {
    if (r.url.path == '/api/v1/support/call-requests') {
      requests.add(jsonDecode(r.body) as Map<String, dynamic>);
      if (fail) return j({'code': 'INTERNAL', 'message': 'حدث خطأ. حاولي مرة أخرى.'}, 500);
      return j({'id': 'cr1', 'status': 'requested', 'created_at': '2026-11-05T12:00:00+03:00', 'already_requested': false}, 201);
    }
    final copy = http.Request(r.method, r.url)
      ..headers.addAll(r.headers)
      ..body = r.body;
    return http.Response.fromStream(await inner.send(copy));
  });
}

Future<void> _openDetails(WidgetTester tester, RecordingLinkOpener links, MockClient client) async {
  tallScreen(tester);
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), linkOpener: links, httpClientFactory: () => client));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('session-s1'))); // the booked session opens its details
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('request contact: one button; the screen blurs and call and WhatsApp stand one above the other', (tester) async {
    final links = RecordingLinkOpener();
    await _openDetails(tester, links, _api([]));
    expect(find.text('طلب تواصل'), findsOneWidget);
    expect(find.byKey(const Key('call-coord')), findsNothing, reason: 'one button until she asks');

    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    expect(find.byType(BackdropFilter), findsOneWidget, reason: 'the screen behind blurs');
    expect(find.text('طلب اتصال'), findsOneWidget);
    expect(find.text('التواصل عبر الواتساب'), findsOneWidget);
    expect(find.textContaining('6005'), findsNothing, reason: "her screen never shows the coordinator's number");
    final call = tester.getRect(find.byKey(const Key('call-coord')));
    final wa = tester.getRect(find.byKey(const Key('wa-coord')));
    expect(call.bottom, lessThanOrEqualTo(wa.top), reason: 'one above the other');

    // closing without choosing leaves nothing opened
    await tester.tap(find.byKey(const Key('contact-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wa-coord')), findsNothing);
    expect(links.opened, isEmpty);
  });

  testWidgets('"Request Call" sends the request with her meetup, tells her, and opens no phone', (tester) async {
    final links = RecordingLinkOpener();
    final requests = <Map<String, dynamic>>[];
    await _openDetails(tester, links, _api(requests));
    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('call-coord')));
    await tester.pumpAndSettle();
    expect(requests.single, {'booking_id': bookingId}, reason: 'the request names the meetup she was looking at');
    expect(find.byKey(const Key('call-requested')), findsOneWidget);
    expect(find.text('وصلنا طلبك. سيتصل بك المنسق.'), findsOneWidget);
    expect(links.opened, isEmpty, reason: 'nothing dials: the coordinator calls her');
    await tester.tap(find.byKey(const Key('contact-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('call-requested')), findsNothing);
  });

  testWidgets('WhatsApp opens the coordinator chat and closes the sheet', (tester) async {
    final links = RecordingLinkOpener();
    await _openDetails(tester, links, _api([]));
    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('wa-coord')));
    await tester.pumpAndSettle();
    expect(links.opened.single.toString(), 'https://wa.me/97460053006');
    expect(find.byKey(const Key('wa-coord')), findsNothing);
  });

  testWidgets('if the request fails she is told and can try again', (tester) async {
    final requests = <Map<String, dynamic>>[];
    await _openDetails(tester, RecordingLinkOpener(), _api(requests, fail: true));
    await tester.tap(find.byKey(const Key('contact-coord')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('call-coord')));
    await tester.pumpAndSettle(const Duration(seconds: 3)); // the API client's one automatic retry
    expect(find.byType(ErrorBanner), findsOneWidget);
    expect(find.byKey(const Key('call-requested')), findsNothing);
    expect(tester.widget<FilledButton>(find.byKey(const Key('call-coord'))).onPressed, isNotNull, reason: 'the button is usable again');
  });
}
