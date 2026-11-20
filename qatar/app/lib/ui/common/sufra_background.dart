import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// The «سُفرة» seats pattern (owner decision, 15 Nov 2026, option B), the same as the website's .sufra-bg: a quiet layer
/// of single dashed seats behind the welcome screen, the end of the questions and the empty states. Seats only (radius
/// 4, stroke 1.25, dashes 3 / 2.5), never filled (a filled seat means "taken" in the table drawing) and no table ring
/// (it would read as the logo). A staggered 64 px grid: layer 1 on every seat in borderStrong at 0.30, layer 2 on one
/// seat of each 192 px row group in seat at 0.10 in light and 0.22 in dark (0.22 in light would bring muted text over a
/// dash under 4.5:1). Static, decorative (a screen reader skips it), and gone when the phone asks for more contrast.
class SufraBackground extends StatelessWidget {
  const SufraBackground({super.key, required this.child});
  final Widget child;

  static const double opacity1 = 0.30;
  static double opacity2(Brightness b) => b == Brightness.dark ? 0.22 : 0.10;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.highContrastOf(context)) return child;
    final c = hzColors(context);
    final b = Theme.of(context).brightness;
    return CustomPaint(
      key: const Key('sufra-bg'),
      painter: SufraPainter(
        every: c.borderStrong.withValues(alpha: opacity1),
        third: c.seat.withValues(alpha: opacity2(b)),
      ),
      child: child,
    );
  }
}

class SufraPainter extends CustomPainter {
  SufraPainter({required this.every, required this.third});
  final Color every, third;

  static const double cell = 64, r = 4, stroke = 1.25, dash = 3, gap = 2.5;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    final p1 = Paint()..color = every..style = PaintingStyle.stroke..strokeWidth = stroke;
    final p2 = Paint()..color = third..style = PaintingStyle.stroke..strokeWidth = stroke;
    for (var y = 0.0; y < size.height + cell; y += cell) {
      for (var x = 0.0, col = 0; x < size.width + cell; x += cell, col++) {
        seat(canvas, Offset(x + 16, y + 16), p1);
        seat(canvas, Offset(x + 48, y + 48), p1);
        if (col % 3 == 0) seat(canvas, Offset(x + 16, y + 16), p2);
      }
    }
    canvas.restore();
  }

  /// One dashed seat, dashes laid along the circle from its rightmost point clockwise, as an SVG circle draws them.
  static void seat(Canvas canvas, Offset c, Paint paint) {
    final rect = Rect.fromCircle(center: c, radius: r);
    const on = dash / r, off = gap / r;
    for (var a = 0.0; a < 2 * math.pi; a += on + off) {
      canvas.drawArc(rect, a, math.min(on, 2 * math.pi - a), false, paint);
    }
  }

  @override
  bool shouldRepaint(SufraPainter old) => old.every != every || old.third != third;
}
