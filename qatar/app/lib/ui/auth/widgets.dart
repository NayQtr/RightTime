import 'package:flutter/material.dart';

import '../../core/api_error.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';

/// The words for a problem: offline, the server's own (localised) message, or the generic text. The generic text (ours,
/// or the server's INTERNAL message, which is the same words) gets a next step (provisional, 13d-2), as on the website.
String errorText(AppLocalizations t, ApiError error) {
  final text = error.isOffline ? t.offline : (error.message.isNotEmpty ? error.message : t.errGeneric);
  return text == t.errGeneric ? '$text ${t.errGenericNext}' : text;
}

/// A problem shown under a form.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.error, {super.key});

  final ApiError error;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final text = errorText(t, error);
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
