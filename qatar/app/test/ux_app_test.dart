import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show SemanticsData;
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/device_unlock.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/ui/auth/widgets.dart' show ErrorBanner;
import 'package:herzone/ui/common/motion.dart' show RiseIn;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'booking_test.dart' as b;
import 'meetups_test.dart' as m;
import 'plus_one_test.dart' as p;
import 'rounds_test.dart' show inboxApi;
import 'sign_in_flow_test.dart' show config, fakeApi, fakeHandler, j;

HerZoneApp _app(http.Client Function() client, {DeviceUnlock? unlock}) => HerZoneApp(
      key: UniqueKey(),
      config: config,
      tokens: MemoryTokenStore()..token = 'rt_1',
      trips: MemoryTripStore(),
      quizStore: QuizStore.memory(),
      deviceUnlock: unlock,
      httpClientFactory: client,
    );

/// The semantics node a widget belongs to (merged into its button or list row).
SemanticsData _node(WidgetTester tester, Finder f) => tester.getSemantics(f).getSemanticsData();

Finder _inboxTab() => find.text('الإشعارات').last;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('notifications: unread count and new marks (the website\'s rule, NMX-18)', () {
    testWidgets('the tab counts what is new since her last visit, with the number in its label; opening it clears the count', (tester) async {
      m.tallScreen(tester);
      // she last saw the notifications up to the morning of 11 Nov: two are newer
      SharedPreferences.setMockInitialValues({'hz.inboxSeen': '2026-11-11T09:00:00+03:00'});
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(_app(inboxApi, unlock: AlwaysUnlock()));
      await tester.pumpAndSettle();
      final badge = tester.widget<Badge>(find.byKey(const Key('inbox-badge')));
      expect(badge.isLabelVisible, isTrue);
      expect((badge.label! as Text).data, '2');
      expect(find.bySemanticsLabel('الإشعارات، 2 غير مقروءة'), findsOneWidget, reason: 'the count is read with the tab name');

      // locked behind Face ID: she has not read them yet, so the count stays
      await tester.tap(_inboxTab());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('inbox-locked')), findsOneWidget);
      expect(tester.widget<Badge>(find.byKey(const Key('inbox-badge'))).isLabelVisible, isTrue);

      await tester.tap(find.byKey(const Key('unlock')));
      await tester.pumpAndSettle();
      expect(tester.widget<Badge>(find.byKey(const Key('inbox-badge'))).isLabelVisible, isFalse, reason: 'shown, so seen');
      expect(find.bySemanticsLabel('الإشعارات، 2 غير مقروءة'), findsNothing);
      expect((await SharedPreferences.getInstance()).getString('hz.inboxSeen'), '2026-11-11T19:30:00+03:00', reason: 'kept on the device');
      handle.dispose();
    });

    testWidgets('new ones are marked by a word, bold text and a filled dot, never colour alone; the next visit marks none', (tester) async {
      m.tallScreen(tester);
      SharedPreferences.setMockInitialValues({'hz.inboxSeen': '2026-11-11T09:00:00+03:00'});
      final handle = tester.ensureSemantics();
      final unlock = AlwaysUnlock();
      await tester.pumpWidget(_app(inboxApi, unlock: unlock));
      await tester.pumpAndSettle();
      await tester.tap(_inboxTab());
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('unlock')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('new-n3')), findsOneWidget);
      expect(find.byKey(const Key('new-n2')), findsOneWidget);
      expect(find.byKey(const Key('new-n1')), findsNothing, reason: 'seen before');
      expect(find.text('جديد'), findsNWidgets(2));
      expect(_node(tester, find.byKey(const Key('new-n3'))).label, contains('جديد'), reason: 'a screen reader hears "New" with the notice');
      expect(_node(tester, find.byKey(const Key('new-n3'))).label, contains('كُشف مكان لقائك غدًا.'));
      expect(tester.widget<Text>(find.text('كُشف مكان لقائك غدًا.')).style?.fontWeight, FontWeight.w600);

      // away and back: the list is fetched again and nothing is new any more
      await tester.tap(find.text('الرئيسية').last);
      await tester.pumpAndSettle();
      await tester.tap(_inboxTab());
      await tester.pumpAndSettle();
      expect(find.text('كُشف مكان لقائك غدًا.'), findsOneWidget);
      expect(find.text('جديد'), findsNothing);
      handle.dispose();
    });

    testWidgets('never opened on this device: every notification counts', (tester) async {
      m.tallScreen(tester);
      await tester.pumpWidget(_app(inboxApi));
      await tester.pumpAndSettle();
      expect((tester.widget<Badge>(find.byKey(const Key('inbox-badge'))).label! as Text).data, '3');
    });
  });

  testWidgets('account: sign out is a secondary (outlined) button, as on the website', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(_app(() => fakeApi([])));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    expect(find.byWidgetPredicate((w) => w is OutlinedButton && w.key == const Key('signOut')), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is FilledButton && w.key == const Key('signOut')), findsNothing);
  });

  testWidgets('account: a refused deletion is said under the button, not in a passing message; the button waits meanwhile', (tester) async {
    m.tallScreen(tester);
    final log = <String>[];
    final base = fakeHandler(log);
    final answer = Completer<http.Response>();
    await tester.pumpWidget(_app(() => MockClient((r) async {
          if (r.method == 'DELETE' && r.url.path == '/api/v1/users/me') {
            log.add('DELETE');
            return answer.future;
          }
          if (r.url.path == '/api/v1/auth/token:refresh') return j({'access_token': 'at_1', 'refresh_token': 'rt_1'});
          return base(r);
        })));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('deleteAccount')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('deleteYes')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300)); // the dialog closes; the request is still out
    expect(tester.widget<TextButton>(find.byKey(const Key('deleteAccount'))).onPressed, isNull, reason: 'one request at a time');
    expect(find.descendant(of: find.byKey(const Key('deleteAccount')), matching: find.byType(CircularProgressIndicator)), findsOneWidget);
    answer.complete(j({'code': 'CONFLICT', 'message': 'لا يمكن حذف الحساب الآن.'}, 409));
    await tester.pumpAndSettle();
    expect(log.where((e) => e == 'DELETE'), hasLength(1));
    expect(find.byType(SnackBar), findsNothing);
    expect(find.byKey(const Key('delete-error')), findsOneWidget);
    expect(find.text('لا يمكن حذف الحساب الآن.'), findsOneWidget);
    expect(tester.getTopLeft(find.byKey(const Key('delete-error'))).dy, greaterThan(tester.getTopLeft(find.byKey(const Key('deleteAccount'))).dy));
    expect(tester.widget<TextButton>(find.byKey(const Key('deleteAccount'))).onPressed, isNotNull);
  });

  group('booking review', () {
    /// The late booking (acknowledgement required) whose checkout the server refuses.
    MockClient refusing(b.Fake f) {
      final inner = f.client();
      return MockClient((r) async {
        if (r.url.path == '/api/v1/bookings/b1/checkout') return j({'code': 'CONFLICT', 'message': 'انتهت مدة حجز مقعدك.'}, 409);
        final copy = http.Request(r.method, r.url)
          ..headers.addAll(r.headers)
          ..bodyBytes = r.bodyBytes;
        return http.Response.fromStream(await inner.send(copy));
      });
    }

    testWidgets('one heading, "Review your booking", at the top of the page; the app bar has no second one', (tester) async {
      final handle = tester.ensureSemantics();
      await b.start(tester, b.Fake());
      // before the hold, the app bar names the step and the page has no heading of its own
      expect(find.text('راجعي حجزك'), findsOneWidget);
      await tester.tap(find.byKey(const Key('hold')));
      await tester.pumpAndSettle();
      expect(find.text('راجعي حجزك'), findsOneWidget, reason: 'not twice');
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('راجعي حجزك')), findsNothing);
      expect(find.byKey(const Key('review-title')), findsOneWidget);
      expect(_node(tester, find.byKey(const Key('review-title'))).flagsCollection.isHeader, isTrue);
      expect(tester.getTopLeft(find.byKey(const Key('review-title'))).dy, lessThan(tester.getTopLeft(find.byKey(const Key('amount'))).dy));
      handle.dispose();
    });

    testWidgets('a disabled pay button says what is missing; a refused payment is said above the button and announced', (tester) async {
      final handle = tester.ensureSemantics();
      final f = b.Fake(late: true);
      m.tallScreen(tester);
      await tester.pumpWidget(_app(() => refusing(f)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('session-s9')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hold')));
      await tester.pumpAndSettle();

      expect(tester.widget<FilledButton>(find.byKey(const Key('pay'))).onPressed, isNull);
      expect(find.byKey(const Key('pay-reason')), findsOneWidget);
      expect(find.text('ضعي علامة على الإقرار أعلاه أولًا.'), findsOneWidget);
      expect(tester.getTopLeft(find.byKey(const Key('pay-reason'))).dy, greaterThan(tester.getTopLeft(find.byKey(const Key('pay'))).dy), reason: 'under the button');
      expect(_node(tester, find.byKey(const Key('pay'))).hint, 'ضعي علامة على الإقرار أعلاه أولًا.', reason: 'and on the button for a screen reader');

      await tester.tap(find.byKey(const Key('ack')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pay-reason')), findsNothing);
      expect(_node(tester, find.byKey(const Key('pay'))).hint, isEmpty);

      await tester.tap(find.byKey(const Key('pay')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('book-error')), findsOneWidget);
      expect(find.text('انتهت مدة حجز مقعدك.'), findsOneWidget);
      expect(tester.getTopLeft(find.byKey(const Key('book-error'))).dy, lessThan(tester.getTopLeft(find.byKey(const Key('pay'))).dy), reason: 'above the button');
      expect(tester.getTopLeft(find.byKey(const Key('book-error'))).dy, greaterThan(tester.getTopLeft(find.byKey(const Key('ack'))).dy), reason: 'next to what failed');
      expect(tester.widget<Semantics>(find.descendant(of: find.byType(ErrorBanner), matching: find.byType(Semantics)).first).properties.liveRegion, isTrue);
      handle.dispose();
    });

    testWidgets('with +1 on, the disabled hold button names what is missing: the name, then the confirmation', (tester) async {
      final handle = tester.ensureSemantics();
      await p.openBook(tester, p.Fake());
      expect(find.byKey(const Key('hold-reason')), findsNothing, reason: 'alone, nothing is missing');
      await tester.tap(find.byKey(const Key('plus-one')));
      await tester.pumpAndSettle();
      expect(find.text('اكتبي اسم مرافقتك.'), findsOneWidget);
      expect(_node(tester, find.byKey(const Key('hold'))).hint, 'اكتبي اسم مرافقتك.');
      await tester.enterText(find.byKey(const Key('guest-name')), 'سارة');
      await tester.pump();
      expect(find.text('ضعي علامة على تأكيد مرافقتك.'), findsOneWidget);
      expect(_node(tester, find.byKey(const Key('hold'))).hint, 'ضعي علامة على تأكيد مرافقتك.');
      await tester.tap(find.byKey(const Key('guest-confirm')));
      await tester.pump();
      expect(find.byKey(const Key('hold-reason')), findsNothing);
      expect(p.holdOn(tester), isTrue);
      handle.dispose();
    });
  });

  testWidgets('appeal: the button waits with a spinner while it is sent, so it is sent once; a refusal is said under it', (tester) async {
    final log = <String>[];
    final base = fakeHandler(<String>[]);
    final answer = Completer<http.Response>();
    await tester.pumpWidget(_app(() => MockClient((r) async {
          if (r.url.path == '/api/v1/cases/mine') {
            return j({'cases': [
              {'case_ref': 'TS-1', 'event_date': '2026-11-12T19:30:00+03:00', 'category': 'harassment', 'decision': 'warning', 'decision_label': 'تنبيه',
               'status': 'actioned', 'appeal_until': '2026-11-26T19:30:00+03:00', 'can_appeal': true},
            ]});
          }
          if (r.url.path == '/api/v1/cases/TS-1/appeal') {
            log.add('appeal');
            return answer.future;
          }
          if (r.url.path == '/api/v1/auth/token:refresh') return j({'access_token': 'at_1', 'refresh_token': 'rt_1'});
          return base(r);
        })));
    await tester.pumpAndSettle();
    await tester.tap(find.text('حسابي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('cases')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('appeal-TS-1')));
    await tester.pump();
    expect(tester.widget<OutlinedButton>(find.byKey(const Key('appeal-TS-1'))).onPressed, isNull);
    expect(find.descendant(of: find.byKey(const Key('appeal-TS-1')), matching: find.byType(CircularProgressIndicator)), findsOneWidget);
    await tester.tap(find.byKey(const Key('appeal-TS-1')), warnIfMissed: false);
    answer.complete(j({'code': 'CONFLICT', 'message': 'انتهت مدة الاعتراض.'}, 409));
    await tester.pumpAndSettle();
    expect(log, ['appeal']);
    expect(find.byKey(const Key('appeal-error-TS-1')), findsOneWidget);
    expect(find.text('انتهت مدة الاعتراض.'), findsOneWidget);
  });

  testWidgets('the details page rises in on her first visit in this run only; the next visit shows it in place', (tester) async {
    RiseIn.resetPlayed();
    addTearDown(RiseIn.resetPlayed);
    m.tallScreen(tester);
    await tester.pumpWidget(_app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    double fade() => tester.widget<FadeTransition>(find.ancestor(of: find.byKey(const Key('big-date')), matching: find.byType(FadeTransition)).first).opacity.value;

    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    // the page is settled; open it again and look at its first frames
    Navigator.of(tester.element(find.byKey(const Key('big-date')))).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byKey(const Key('big-date')), findsOneWidget);
    expect(fade(), 1, reason: 'already seen in this run: no second entrance');
    await tester.pumpAndSettle();
  });

  testWidgets('the details page entrance plays on a first visit', (tester) async {
    RiseIn.resetPlayed();
    addTearDown(RiseIn.resetPlayed);
    m.tallScreen(tester);
    await tester.pumpWidget(_app(() => m.api(online: () => true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    // wait for the details to load, then catch the entrance under way
    for (var i = 0; i < 20 && find.byKey(const Key('big-date')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    final opacity = tester.widget<FadeTransition>(find.ancestor(of: find.byKey(const Key('big-date')), matching: find.byType(FadeTransition)).first).opacity.value;
    expect(opacity, lessThan(1));
    await tester.pumpAndSettle();
  });

  testWidgets('tab labels grow with the phone\'s text size', (tester) async {
    m.tallScreen(tester);
    await tester.pumpWidget(_app(() => fakeApi([])));
    await tester.pumpAndSettle();
    final normal = tester.getSize(find.text('الإشعارات').last).height;
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpAndSettle();
    expect(tester.getSize(find.text('الإشعارات').last).height, greaterThan(normal * 1.4));
  });
}
