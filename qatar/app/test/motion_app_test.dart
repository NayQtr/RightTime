// The motion pass in the app (19-principle brief): the seats that pop in one after another on the details' table
// drawing (the peak of the wait), and the doubled amount that pulses once on the «+1» review (the secondary action).
// Each is checked for the exact count, for playing once, and for standing still under reduced motion.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/design/herzone_tokens.dart';
import 'package:herzone/ui/common/motion.dart' show Pulse;
import 'package:herzone/ui/common/table_art.dart';

import 'meetups_test.dart' as m;
import 'plus_one_test.dart' as p;
import 'rounds_test.dart' show reduceMotion;
import 'sign_in_flow_test.dart' show config;

Widget host(Widget child, {bool still = false}) => MaterialApp(
      home: MediaQuery(data: MediaQueryData(disableAnimations: still), child: Scaffold(body: Center(child: child))),
    );

/// The per-seat pop scales the drawing's painter holds mid-animation; null when the drawing is static.
List<double>? pops(WidgetTester tester) =>
    ((tester.widget<CustomPaint>(find.descendant(of: find.byType(TableArt), matching: find.byType(CustomPaint))).painter) as dynamic).pops as List<double>?;

void main() {
  setUp(TableArt.resetPlayed);

  testWidgets('the confirmed seats pop in one after another: exactly that many, 60 ms apart, each over HzMotion.fast', (tester) async {
    await tester.pumpWidget(host(const TableArt(filled: 3, popIn: true)));
    expect(pops(tester), [0, 0, 0], reason: 'exactly 3 of the 6 seats animate, from nothing');
    await tester.pump(const Duration(milliseconds: 120));
    expect(pops(tester)![0], 1, reason: 'the first seat has landed after HzMotion.fast');
    expect(pops(tester)![1], greaterThan(0), reason: 'the second is mid-pop (it started 60 ms later)');
    expect(pops(tester)![2], 0, reason: 'the third has not started (120 ms in)');
    await tester.pumpAndSettle();
    expect(pops(tester), [1, 1, 1], reason: 'all settled at their size');
  });

  testWidgets('a forming, all-dashed table never pops, and without popIn the drawing is simply drawn', (tester) async {
    await tester.pumpWidget(host(const TableArt(filled: 0, popIn: true)));
    expect(pops(tester), isNull);
    await tester.pumpAndSettle();
    await tester.pumpWidget(host(const TableArt(filled: 4)));
    expect(pops(tester), isNull);
  });

  testWidgets('reduced motion: the drawing is simply there, complete', (tester) async {
    await tester.pumpWidget(host(const TableArt(filled: 3, popIn: true), still: true));
    expect(pops(tester), isNull, reason: 'static: every seat at full size from the first frame');
    await tester.pumpAndSettle();
  });

  testWidgets('with once, the pop plays on the first appearance only in this run', (tester) async {
    await tester.pumpWidget(host(const TableArt(filled: 2, popIn: true, once: 'x')));
    expect(pops(tester), isNotNull);
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(host(const TableArt(key: Key('again'), filled: 2, popIn: true, once: 'x')));
    expect(pops(tester), isNull, reason: 'seen already: shown in place at once');
    // left halfway, it may play again: only a run to the end marks it seen
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(host(const TableArt(key: Key('other'), filled: 2, popIn: true, once: 'y')));
    await tester.pump(const Duration(milliseconds: 30));
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(host(const TableArt(key: Key('other2'), filled: 2, popIn: true, once: 'y')));
    expect(pops(tester), isNotNull);
    await tester.pumpAndSettle();
  });

  testWidgets('details: her table\'s drawing shows the confirmed seats and pops them in once', (tester) async {
    m.tallScreen(tester);
    // the meetups fake: a revealed booking with confirmed_count 5
    await tester.pumpWidget(_detailsApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    final art = tester.widget<TableArt>(find.byKey(const Key('details-table')));
    expect(art.filled, 5, reason: 'exactly the confirmed count');
    expect(art.popIn, isTrue);
    expect(pops(tester), [1, 1, 1, 1, 1], reason: 'played to the end while the screen settled');
  });

  testWidgets('details under reduced motion: the drawing stands still and complete', (tester) async {
    m.tallScreen(tester);
    reduceMotion(tester);
    await tester.pumpWidget(_detailsApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('session-s1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('details-table')), findsOneWidget);
    expect(pops(tester), isNull);
  });

  testWidgets('«+1» review: the doubled amount pulses once (1 to 1.03 and back, spring, HzMotion.base) and no more', (tester) async {
    final f = p.Fake();
    await p.openBook(tester, f);
    await p.withGuest(tester, 'سارة');
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    final pulse = find.byKey(const Key('amount-pulse'));
    expect(pulse, findsOneWidget);
    expect(find.descendant(of: pulse, matching: find.byKey(const Key('amount'))), findsOneWidget);
    final w = tester.widget<Pulse>(pulse);
    expect(w.duration, HzMotion.base);
    expect(w.curve, HzMotion.spring);
    double scale() => tester.widget<ScaleTransition>(find.descendant(of: pulse, matching: find.byType(ScaleTransition))).scale.value;
    expect(scale(), 1, reason: 'the pulse has played once and come to rest');
    await tester.pump(const Duration(milliseconds: 300));
    expect(scale(), 1, reason: 'once: it does not repeat');
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('«+1» review mid-pulse: the amount rises above 1, then returns', (tester) async {
    final f = p.Fake();
    await p.openBook(tester, f);
    await p.withGuest(tester, 'سارة');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hold')));
    // let the hold's answer arrive and the review build, then sample the pulse at its crest
    for (var i = 0; i < 10 && find.byKey(const Key('amount-pulse')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    final pulse = find.byKey(const Key('amount-pulse'));
    expect(pulse, findsOneWidget);
    double scale() => tester.widget<ScaleTransition>(find.descendant(of: pulse, matching: find.byType(ScaleTransition))).scale.value;
    await tester.pump(const Duration(milliseconds: 100));
    expect(scale(), greaterThan(1), reason: 'the crest of the pulse');
    await tester.pumpAndSettle();
    expect(scale(), 1);
  });

  testWidgets('booked alone: the amount does not pulse', (tester) async {
    final f = p.Fake();
    await p.openBook(tester, f);
    await tester.tap(find.byKey(const Key('hold')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('amount')), findsOneWidget);
    expect(find.byKey(const Key('amount-pulse')), findsNothing);
  });
}

Widget _detailsApp() => HerZoneApp(
    config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: () => m.api(online: () => true));
