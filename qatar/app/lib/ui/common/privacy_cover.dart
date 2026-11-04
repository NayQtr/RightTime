import 'package:flutter/material.dart';

import '../theme.dart';

/// Covers the app with a plain brand screen whenever it is not in front, so the app switcher's snapshot never shows a
/// venue, a table code or a notification (NMX-52).
class PrivacyCover extends StatefulWidget {
  const PrivacyCover({super.key, required this.child});
  final Widget child;

  @override
  State<PrivacyCover> createState() => _PrivacyCoverState();
}

class _PrivacyCoverState extends State<PrivacyCover> with WidgetsBindingObserver {
  bool covered = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => setState(() => covered = state != AppLifecycleState.resumed);

  @override
  Widget build(BuildContext context) => Stack(children: [
        widget.child,
        if (covered)
          Positioned.fill(
            key: const Key('privacy-cover'),
            child: ColoredBox(
              color: hzColors(context).bg,
              child: Center(child: Text('HerZone', style: Theme.of(context).textTheme.displaySmall?.copyWith(color: hzColors(context).primary))),
            ),
          ),
      ]);
}
