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

/// The tests' signed-in member API, with the contact-request endpoint recorded (and optionally failing).
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

Future<void> _openSheet(WidgetTester tester, RecordingLinkOpener links, MockClient client) async {
  tallScreen(tester);
  await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), linkOpener: links, httpClientFactory: () => client));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('session-s1'))); // the booked session opens its details
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('contact-coord')));
  await tester.pumpAndSettle();
}

Future<void> _tap(WidgetTester tester, String key) async {
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('level 1: the screen blurs; phone call and WhatsApp chat stand one above the other', (tester) async {
    final links = RecordingLinkOpener();
    await _openSheet(tester, links, _api([]));
    expect(find.byType(BackdropFilter), findsOneWidget, reason: 'the screen behind blurs');
    expect(find.text('اتصال هاتفي'), findsOneWidget);
    expect(find.text('محادثة واتساب'), findsOneWidget);
    expect(find.textContaining('6005'), findsNothing, reason: "her screen never shows the coordinator's number");
    expect(tester.getRect(find.byKey(const Key('go-phone'))).bottom, lessThanOrEqualTo(tester.getRect(find.byKey(const Key('wa-coord'))).top));
    await _tap(tester, 'contact-close');
    expect(find.byKey(const Key('wa-coord')), findsNothing);
    expect(links.opened, isEmpty);
  });

  testWidgets('WhatsApp opens the chat with her name and booking number', (tester) async {
    final links = RecordingLinkOpener();
    await _openSheet(tester, links, _api([]));
    await _tap(tester, 'wa-coord');
    final u = links.opened.single;
    expect('${u.scheme}://${u.host}${u.path}', 'https://wa.me/97460053006');
    expect(u.queryParameters['text'], 'مرحباً ، انا مريم #RT-ABC123 ، لدي مشكلة/طلب');
    expect(find.byKey(const Key('wa-coord')), findsNothing, reason: 'the sheet closes');
  });

  testWidgets('level 2: request contact (with its hint) and call us now; call us now dials the coordinator', (tester) async {
    final links = RecordingLinkOpener();
    await _openSheet(tester, links, _api([]));
    await _tap(tester, 'go-phone');
    expect(find.byKey(const Key('go-phone')), findsNothing, reason: 'the first two options are gone');
    expect(find.byKey(const Key('go-form')), findsOneWidget);
    expect(find.text('شرح بسيط للمشكلة/الطلب قبل التواصل'), findsOneWidget);
    expect(find.text('اتصل بنا الان'), findsOneWidget);
    expect(find.text('سوف تتصل بنا هاتفيا فوراً'), findsOneWidget);
    await _tap(tester, 'call-coord');
    expect(links.opened.single.toString(), 'tel:+97460053006');
  });

  testWidgets('level 3: a note, her number to confirm and a time; the request is sent with her meetup', (tester) async {
    final links = RecordingLinkOpener();
    final requests = <Map<String, dynamic>>[];
    await _openSheet(tester, links, _api(requests));
    await _tap(tester, 'go-phone');
    await _tap(tester, 'go-form');
    expect(tester.widget<TextField>(find.byKey(const Key('cs-phone'))).controller!.text, '+97455512345', reason: 'her number, to confirm');
    for (final t in ['الان', 'بعد 10 دقايق', 'بعد ساعة', 'غدا']) {
      expect(find.text(t), findsOneWidget);
    }
    // no note: nothing is sent
    await _tap(tester, 'cs-send');
    expect(find.text('اكتبي المشكلة أو الطلب أولاً.'), findsOneWidget);
    expect(requests, isEmpty);
    await tester.enterText(find.byKey(const Key('cs-msg')), 'الطاولة تغيّرت');
    await _tap(tester, 'when-1h');
    await _tap(tester, 'cs-send');
    expect(requests.single, {'message': 'الطاولة تغيّرت', 'callback_when': '1h', 'booking_id': bookingId}, reason: 'her own number is not sent again');
    expect(find.text('وصلنا طلبك. سيتم الاتصال بكِ من قبلنا.'), findsOneWidget);
    expect(links.opened, isEmpty, reason: 'nothing dials: the coordinator calls her');
    await _tap(tester, 'contact-close');
    expect(find.byKey(const Key('call-requested')), findsNothing);
  });

  testWidgets('a different contact number is sent with the request', (tester) async {
    final requests = <Map<String, dynamic>>[];
    await _openSheet(tester, RecordingLinkOpener(), _api(requests));
    await _tap(tester, 'go-phone');
    await _tap(tester, 'go-form');
    await tester.enterText(find.byKey(const Key('cs-msg')), 'سؤال');
    await tester.enterText(find.byKey(const Key('cs-phone')), '55500011');
    await _tap(tester, 'cs-send');
    expect(requests.single['contact_phone'], '55500011');
    expect(requests.single['callback_when'], 'now');
  });

  testWidgets('if the request fails she is told and can try again', (tester) async {
    final requests = <Map<String, dynamic>>[];
    await _openSheet(tester, RecordingLinkOpener(), _api(requests, fail: true));
    await _tap(tester, 'go-phone');
    await _tap(tester, 'go-form');
    await tester.enterText(find.byKey(const Key('cs-msg')), 'سؤال');
    await tester.tap(find.byKey(const Key('cs-send')));
    await tester.pumpAndSettle(const Duration(seconds: 3)); // the API client's one automatic retry
    expect(find.byType(ErrorBanner), findsOneWidget);
    expect(find.byKey(const Key('call-requested')), findsNothing);
    expect(tester.widget<FilledButton>(find.byKey(const Key('cs-send'))).onPressed, isNotNull, reason: 'the button is usable again');
  });
}
