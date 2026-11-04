import 'package:flutter/material.dart';

import '../../core/api_error.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';

/// A problem shown under a form: the server's own (localised) message, or offline / generic text.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.error, {super.key});

  final ApiError error;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final text = error.isOffline ? t.offline : (error.message.isNotEmpty ? error.message : t.errGeneric);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: c.danger.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
        child: Text(text, style: TextStyle(color: c.danger)),
      ),
    );
  }
}

/// Phone numbers and codes read left to right inside Arabic text.
class Ltr extends StatelessWidget {
  const Ltr(this.child, {super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => Directionality(textDirection: TextDirection.ltr, child: child);
}
