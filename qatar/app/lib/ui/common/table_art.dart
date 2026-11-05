import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// The HerZone table drawing (same as the web's welcome): a round table with [seats] chairs, [filled] of them taken
/// (solid seat colour) and the rest open (dashed). It stands in for photos: members are never pictured.
class TableArt extends StatelessWidget {
  const TableArt({super.key, this.seats = 6, this.filled = 4, this.size = 200});
  final int seats;
  final int filled;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _TablePainter(seats: seats, filled: filled, table: c.surfaceSunken, rim: c.border, seat: c.seat, open: c.borderStrong)),
      ),
    );
  }
}

class _TablePainter extends CustomPainter {
  _TablePainter({required this.seats, required this.filled, required this.table, required this.rim, required this.seat, required this.open});
  final int seats, filled;
  final Color table, rim, seat, open;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final center = size.center(Offset.zero);
    final tableR = s * 0.27, seatR = s * 0.075, orbit = s * 0.40;
    canvas.drawCircle(center, tableR, Paint()..color = table);
    canvas.drawCircle(center, tableR, Paint()..color = rim..style = PaintingStyle.stroke..strokeWidth = s * 0.015);
    // seats go clockwise from the top; the open ones end up on the start side, as on the web drawing
    for (var i = 0; i < seats; i++) {
      final a = -math.pi / 2 + i * 2 * math.pi / seats;
      final p = center + Offset(math.cos(a), math.sin(a)) * orbit;
      if (i < filled || i == seats - 1 && filled == seats) {
        canvas.drawCircle(p, seatR, Paint()..color = seat);
      } else {
        _dashedCircle(canvas, p, seatR, Paint()..color = open..style = PaintingStyle.stroke..strokeWidth = s * 0.012);
      }
    }
  }

  void _dashedCircle(Canvas canvas, Offset c, double r, Paint paint) {
    const dashes = 10;
    for (var i = 0; i < dashes; i++) {
      final start = i * 2 * math.pi / dashes;
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), start, math.pi / dashes, false, paint);
    }
  }

  @override
  bool shouldRepaint(_TablePainter old) =>
      old.seats != seats || old.filled != filled || old.table != table || old.seat != seat || old.open != open || old.rim != rim;
}
