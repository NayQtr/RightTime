import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../theme.dart';

/// The label of a filled button while its request is in flight: an 18 dp spinner in the same box, so the button keeps its width.
/// Use it on the button that disables itself while busy; its semantics say "loading" while the spinner is shown.
class BusyLabel extends StatelessWidget {
  const BusyLabel({super.key, required this.busy, required this.child});

  final bool busy;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!busy) return child;
    final c = hzColors(context);
    return Semantics(
      label: AppLocalizations.of(context).loading,
      child: SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(strokeWidth: 2.5, color: c.onPrimary),
      ),
    );
  }
}
