import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/herzone_tokens.dart';

/// Where a card sat on screen when it was tapped, so the page it opens can grow out of it (owner-approved design study
/// item 2, 13 Nov 2026, after Apple's spatial continuity). Travels as the route's `extra`.
class CardOrigin {
  const CardOrigin(this.rect);

  final Rect rect;
}

/// Opens [location] from the card that [context] belongs to.
void pushFromCard(BuildContext context, String location) {
  final box = context.findRenderObject();
  context.push(location, extra: box is RenderBox && box.hasSize ? CardOrigin(box.localToGlobal(Offset.zero) & box.size) : null);
}

/// The route's page: grows out of the card when it was opened from one, the usual page otherwise.
Page<void> cardZoomPage(GoRouterState state, Widget child) {
  final origin = state.extra;
  if (origin is! CardOrigin) return MaterialPage<void>(key: state.pageKey, child: child);
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 300),
    reverseTransitionDuration: const Duration(milliseconds: 240), // exits about 20% shorter
    transitionsBuilder: (context, animation, _, child) => CardZoomTransition(origin: origin, animation: animation, child: child),
  );
}

/// Scales the page up from 0.94 at the card's centre while it fades in; still when the device asks for less motion.
class CardZoomTransition extends StatelessWidget {
  const CardZoomTransition({super.key, required this.origin, required this.animation, required this.child});

  final CardOrigin origin;
  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return child;
    final size = MediaQuery.sizeOf(context);
    final c = origin.rect.center;
    final at = Alignment(size.width > 0 ? c.dx / size.width * 2 - 1 : 0, size.height > 0 ? c.dy / size.height * 2 - 1 : 0);
    final curved = CurvedAnimation(parent: animation, curve: HzMotion.easing, reverseCurve: HzMotion.easingIn);
    return FadeTransition(
      opacity: curved,
      child: ScaleTransition(key: const ValueKey('card-zoom-scale'), scale: Tween<double>(begin: 0.94, end: 1).animate(curved), alignment: at, child: child),
    );
  }
}
