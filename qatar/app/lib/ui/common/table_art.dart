import 'dart:math' as math;

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';

import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';

/// The HerZone table drawing (same as the web's welcome): a round table with [seats] chairs, [filled] of them taken
/// (solid seat colour) and the rest open (dashed). It stands in for photos: members are never pictured.
///
/// With [popIn], the taken seats pop in one after another the first time the drawing appears: each grows from nothing
/// with HzMotion.spring over HzMotion.fast, the next starting 60 ms (two staggers) later — the peak moment of a table
/// that is really filling. A table with no one confirmed (all dashed) never pops, and with reduced motion the drawing
/// is simply there, complete.
class TableArt extends StatefulWidget {
  const TableArt({super.key, this.seats = 6, this.filled = 4, this.size = 200, this.popIn = false, this.once});
  final int seats;
  final int filled;
  final double size;
  final bool popIn;

  /// With [once], the pop-in named so plays on its first appearance in this run of the app only.
  final String? once;

  /// Pop-ins that have played in this run of the app.
  static final Set<String> _played = {};

  /// Tests start each run afresh.
  @visibleForTesting
  static void resetPlayed() => _played.clear();

  @override
  State<TableArt> createState() => _TableArtState();
}

class _TableArtState extends State<TableArt> with SingleTickerProviderStateMixin {
  AnimationController? _pop;
  bool _decided = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_decided) return;
    _decided = true;
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final once = widget.once;
    final n = widget.filled.clamp(0, widget.seats);
    if (!widget.popIn || n == 0 || still || (once != null && TableArt._played.contains(once))) return;
    _pop = AnimationController(vsync: this, duration: HzMotion.fast + HzMotion.stagger * 2 * (n - 1))
      ..forward().whenComplete(() {
        if (once != null) TableArt._played.add(once);
      });
  }

  @override
  void dispose() {
    _pop?.dispose();
    super.dispose();
  }

  /// One scale per taken seat: seat i grows over HzMotion.fast from 60 ms after seat i-1 (the spring lets it pass 1 and
  /// settle). Null when nothing pops: the drawing is static.
  List<double>? _pops() {
    final c = _pop;
    if (c == null) return null;
    final n = widget.filled.clamp(0, widget.seats);
    final total = c.duration!.inMilliseconds;
    final gap = (HzMotion.stagger * 2).inMilliseconds, run = HzMotion.fast.inMilliseconds;
    return [for (var i = 0; i < n; i++) Interval(i * gap / total, (i * gap + run) / total, curve: HzMotion.spring).transform(c.value)];
  }

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    Widget art(List<double>? pops) => CustomPaint(
        painter: _TablePainter(seats: widget.seats, filled: widget.filled, table: c.surfaceSunken, rim: c.border, seat: c.seat, open: c.borderStrong, pops: pops));
    final pop = _pop;
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: widget.size,
        child: pop == null ? art(null) : AnimatedBuilder(animation: pop, builder: (context, _) => art(_pops())),
      ),
    );
  }
}

/// The key under a table drawing: a solid seat is taken, a dashed one is free, said in words beside each mark so it is
/// never told by colour alone. Decoration like the drawing itself, so a screen reader skips both.
class TableKey extends StatelessWidget {
  const TableKey({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final style = Theme.of(context).textTheme.labelSmall?.copyWith(color: c.textMuted);
    Widget entry(int filled, String text, String id) => Row(key: Key(id), mainAxisSize: MainAxisSize.min, children: [
          SizedBox.square(dimension: 12, child: CustomPaint(painter: _SeatPainter(filled: filled == 1, seat: c.seat, open: c.borderStrong))),
          const SizedBox(width: HzSpace.s1),
          Text(text, style: style),
        ]);
    return ExcludeSemantics(
      child: Wrap(key: const Key('table-key'), spacing: HzSpace.s2, runSpacing: 2, children: [
        entry(1, t.tableKeyTaken, 'table-key-taken'),
        entry(0, t.tableKeyFree, 'table-key-free'),
      ]),
    );
  }
}

class _SeatPainter extends CustomPainter {
  _SeatPainter({required this.filled, required this.seat, required this.open});
  final bool filled;
  final Color seat, open;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.shortestSide / 2 - 1;
    final center = size.center(Offset.zero);
    if (filled) {
      canvas.drawCircle(center, r, Paint()..color = seat);
    } else {
      _dashedCircle(canvas, center, r, Paint()..color = open..style = PaintingStyle.stroke..strokeWidth = 1.5);
    }
  }

  @override
  bool shouldRepaint(_SeatPainter old) => old.filled != filled || old.seat != seat || old.open != open;
}

void _dashedCircle(Canvas canvas, Offset c, double r, Paint paint) {
  const dashes = 10;
  for (var i = 0; i < dashes; i++) {
    final start = i * 2 * math.pi / dashes;
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), start, math.pi / dashes, false, paint);
  }
}

class _TablePainter extends CustomPainter {
  _TablePainter({required this.seats, required this.filled, required this.table, required this.rim, required this.seat, required this.open, this.pops});
  final int seats, filled;
  final Color table, rim, seat, open;

  /// Mid pop-in: the scale of each taken seat, in seat order; null once (or while) the drawing is static.
  final List<double>? pops;

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
        final scale = pops == null || i >= pops!.length ? 1.0 : pops![i];
        if (scale > 0) canvas.drawCircle(p, seatR * scale, Paint()..color = seat);
      } else {
        _dashedCircle(canvas, p, seatR, Paint()..color = open..style = PaintingStyle.stroke..strokeWidth = s * 0.012);
      }
    }
  }

  @override
  bool shouldRepaint(_TablePainter old) =>
      old.seats != seats || old.filled != filled || old.table != table || old.seat != seat || old.open != open || old.rim != rim || !listEquals(old.pops, pops);
}
