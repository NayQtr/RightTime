import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter/material.dart';

import '../../core/sounds.dart';
import '../../design/herzone_tokens.dart';

/// Press feedback for a button: on touch-down it shrinks to 0.97 at once (like a physical key), and on release it eases
/// back over 220 ms. Same as the website's `.btn:active`. Disabled buttons and reduced motion stay still. Only listens
/// to the pointer, so taps, long presses, focus and semantics belong to the button as before. Releasing an enabled
/// button also plays the tap sound (when her Sounds switch is on). A finger that moves further than the touch slop
/// (a scroll or a drag that started on the button) is no longer a press: the button eases back and stays silent.
class Press extends StatefulWidget {
  const Press({super.key, required this.child});

  /// A Material button (Filled/Outlined/Text/Elevated, or IconButton).
  final Widget child;

  @override
  State<Press> createState() => _PressState();
}

class _PressState extends State<Press> {
  bool _down = false;
  Offset? _origin;

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
      onPointerDown: (e) {
        _origin = e.position;
        _set(true);
      },
      onPointerMove: (e) {
        final o = _origin;
        if (_down && o != null && (e.position - o).distance > kTouchSlop) _set(false);
      },
      onPointerUp: (_) {
        if (_down && _enabled) Sounds.instance.play(UiSound.tap);
        _origin = null;
        _set(false);
      },
      onPointerCancel: (_) {
        _origin = null;
        _set(false);
      },
      child: AnimatedScale(
        scale: pressed ? 0.97 : 1,
        duration: pressed ? Duration.zero : const Duration(milliseconds: 220),
        curve: HzMotion.easing,
        child: widget.child,
      ),
    );
  }
}
