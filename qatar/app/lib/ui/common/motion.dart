import 'package:flutter/material.dart';

import '../../design/herzone_tokens.dart';
import '../theme.dart';

/// Loading placeholder in the page's own rhythm (a title and three cards) instead of a spinner. It fades slowly in and
/// out; when the device asks for reduced motion it stays still. Same shapes as the website's `.skel`.
class SkeletonList extends StatefulWidget {
  const SkeletonList({super.key, this.label});

  /// Read out by screen readers while the page loads.
  final String? label;

  @override
  State<SkeletonList> createState() => _SkeletonListState();
}

class _SkeletonListState extends State<SkeletonList> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
  late final Animation<double> _fade = Tween<double>(begin: 1, end: 0.5).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut));
  bool _running = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final still = MediaQuery.of(context).disableAnimations;
    if (still && _running) {
      _c.stop();
      _c.value = 0;
      _running = false;
    } else if (!still && !_running) {
      _c.repeat(reverse: true);
      _running = true;
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    Widget box(double height, {double? widthFactor}) => FractionallySizedBox(
          alignment: AlignmentDirectional.centerStart,
          widthFactor: widthFactor ?? 1,
          child: Container(height: height, decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: BorderRadius.circular(HzRadius.md))),
        );
    return Semantics(
      label: widget.label,
      container: true,
      child: ExcludeSemantics(
        child: FadeTransition(
          opacity: _fade,
          child: ListView(
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.all(HzSpace.gutter),
            children: [
              box(34, widthFactor: 0.55),
              const SizedBox(height: HzSpace.s4),
              box(92),
              const SizedBox(height: HzSpace.s3),
              box(92),
              const SizedBox(height: HzSpace.s3),
              box(64, widthFactor: 0.8),
            ],
          ),
        ),
      ),
    );
  }
}

/// Fades and lifts a list item into place, each [index] 30 ms after the one before (like the website's lists).
/// One controller, no timers: the item at [index] simply starts later in the same 600 ms. Shown at once when the device
/// asks for reduced motion. A page's own blocks arrive further apart ([gap], 120 ms on the website's welcome); the run
/// then lasts as long as the last block needs.
class RiseIn extends StatefulWidget {
  const RiseIn({super.key, required this.index, required this.child, this.gap = HzMotion.stagger});

  final int index;
  final Widget child;
  final Duration gap;

  @override
  State<RiseIn> createState() => _RiseInState();
}

class _RiseInState extends State<RiseIn> with SingleTickerProviderStateMixin {
  // 30 ms between rows (HzMotion.stagger) inside the 600 ms run; a wider gap lengthens the run instead of squeezing
  // the last block
  late final int _delay = widget.index.clamp(0, 5) * widget.gap.inMilliseconds;
  late final int _run = _delay + 480 > 600 ? _delay + 480 : 600;
  late final AnimationController _c = AnimationController(vsync: this, duration: Duration(milliseconds: _run));
  Animation<double>? _a;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_a != null) return;
    _a = CurvedAnimation(parent: _c, curve: Interval(_delay / _run, 1, curve: Curves.easeOutCubic));
    if (MediaQuery.of(context).disableAnimations) {
      _c.value = 1;
    } else {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _a!,
        child: SlideTransition(position: Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero).animate(_a!), child: widget.child),
      );
}

/// A small pulse (to 1.03 and back, ease-in-out) once an action has gone through, so the confirmation is felt as well as
/// read. Still when the device asks for reduced motion. Same as the website's `.pulse`.
class Pulse extends StatefulWidget {
  const Pulse({super.key, required this.child});

  final Widget child;

  @override
  State<Pulse> createState() => _PulseState();
}

class _PulseState extends State<Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 480));
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(tween: ConstantTween(1), weight: 120),
    TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.03).chain(CurveTween(curve: HzMotion.easingInOut)), weight: 180),
    TweenSequenceItem(tween: Tween(begin: 1.03, end: 1.0).chain(CurveTween(curve: HzMotion.easingInOut)), weight: 180),
  ]).animate(_c);
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (!MediaQuery.of(context).disableAnimations) _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ScaleTransition(scale: _scale, child: widget.child);
}

/// A photo arrives once: it fades in while settling from 1.04 to its own size over 1.1 s (the website's welcome photo).
/// At its final state at once when the device asks for reduced motion.
class SettleIn extends StatefulWidget {
  const SettleIn({super.key, required this.child});

  final Widget child;

  @override
  State<SettleIn> createState() => _SettleInState();
}

class _SettleInState extends State<SettleIn> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));
  late final Animation<double> _a = CurvedAnimation(parent: _c, curve: HzMotion.easing);
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.of(context).disableAnimations) {
      _c.value = 1;
    } else {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _a,
        child: ScaleTransition(scale: Tween<double>(begin: 1.04, end: 1).animate(_a), child: widget.child),
      );
}
