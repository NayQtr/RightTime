import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/design/herzone_tokens.dart';
import 'package:herzone/ui/common/press.dart';

double scaleOf(WidgetTester tester) => tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale;

Widget host(Widget button, {bool still = false}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: still),
        child: Scaffold(body: Center(child: Press(child: button))),
      ),
    );

void main() {
  testWidgets('a button shrinks to 0.97 while pressed and comes back on release', (tester) async {
    var taps = 0;
    await tester.pumpWidget(host(FilledButton(onPressed: () => taps++, child: const Text('Go'))));
    expect(scaleOf(tester), 1);
    final g = await tester.startGesture(tester.getCenter(find.text('Go')));
    await tester.pump();
    expect(scaleOf(tester), 0.97);
    await g.up();
    await tester.pumpAndSettle();
    expect(scaleOf(tester), 1);
    expect(taps, 1, reason: 'the tap still reaches the button');
  });

  testWidgets('the release springs back: past 1 and settled over HzMotion.fast, while the press itself is instant', (tester) async {
    await tester.pumpWidget(host(FilledButton(onPressed: () {}, child: const Text('Go'))));
    AnimatedScale scale() => tester.widget<AnimatedScale>(find.byType(AnimatedScale));
    final g = await tester.startGesture(tester.getCenter(find.text('Go')));
    await tester.pump();
    expect(scale().duration, Duration.zero, reason: 'down like a physical key, at once');
    expect(scale().curve, HzMotion.easing);
    await g.up();
    await tester.pump();
    expect(scale().scale, 1);
    expect(scale().duration, HzMotion.fast);
    expect(scale().curve, HzMotion.spring, reason: 'letting go overshoots slightly and settles');
    await tester.pumpAndSettle();
    expect(scaleOf(tester), 1, reason: 'settled back at rest');
  });

  testWidgets('a disabled button and reduced motion stay still', (tester) async {
    await tester.pumpWidget(host(const FilledButton(onPressed: null, child: Text('Go'))));
    var g = await tester.startGesture(tester.getCenter(find.text('Go')));
    await tester.pump();
    expect(scaleOf(tester), 1);
    await g.up();
    await tester.pumpWidget(host(OutlinedButton(onPressed: () {}, child: const Text('Go')), still: true));
    g = await tester.startGesture(tester.getCenter(find.text('Go')));
    await tester.pump();
    expect(scaleOf(tester), 1);
    await g.up();
  });
}
