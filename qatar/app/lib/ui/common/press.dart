import 'package:flutter/material.dart';

import '../../design/herzone_tokens.dart';

/// Press feedback for a button: on touch-down it shrinks to 0.97 at once (like a physical key), and on release it eases
/// back over 220 ms. Same as the website's `.btn:active`. Disabled buttons and reduced motion stay still. Only listens
/// to the pointer, so taps, long presses, focus and semantics belong to the button as before.
class Press extends StatefulWidget {
  const Press({super.key, required this.child});

  /// A Material button (Filled/Outlined/Text/Elevated, or IconButton).
  final Widget child;

  @override
  State<Press> createState() => _PressState();
}

class _PressState extends State<Press> {
  bool _down = false;

  bool get _enabled => switch (widget.child) {
        ButtonStyleButton b => b.enabled,
        IconButton b => b.onPressed != null,
        _ => true,
      };

  void _set(bool down) {
    if (_down != down && mounted) setState(() => _down = down);
  }

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final pressed = _down && _enabled && !still;
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: pressed ? 0.97 : 1,
        duration: pressed ? Duration.zero : const Duration(milliseconds: 220),
        curve: HzMotion.easing,
        child: widget.child,
      ),
    );
  }
}
