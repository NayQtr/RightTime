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

/// Fades and lifts a list item into place, each [index] a little after the one before (like the website's lists).
/// One controller, no timers: the item at [index] simply starts later in the same 600 ms. Shown at once when the device
/// asks for reduced motion.
class RiseIn extends StatefulWidget {
  const RiseIn({super.key, required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  State<RiseIn> createState() => _RiseInState();
}

class _RiseInState extends State<RiseIn> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
  Animation<double>? _a;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_a != null) return;
    final start = widget.index.clamp(0, 5) * 0.08;
    _a = CurvedAnimation(parent: _c, curve: Interval(start, 1, curve: Curves.easeOutCubic));
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
