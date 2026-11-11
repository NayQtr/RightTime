import 'package:flutter/material.dart';

import '../../core/api_error.dart';
import '../../core/sounds.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';

/// A problem shown under a form: the server's own (localised) message, or offline / generic text. Appearing (or
/// changing to another problem) plays the error sound.
class ErrorBanner extends StatefulWidget {
  const ErrorBanner(this.error, {super.key});

  final ApiError error;

  @override
  State<ErrorBanner> createState() => _ErrorBannerState();
}

class _ErrorBannerState extends State<ErrorBanner> {
  @override
  void initState() {
    super.initState();
    Sounds.instance.play(UiSound.error);
  }

  @override
  void didUpdateWidget(ErrorBanner old) {
    super.didUpdateWidget(old);
    if (!identical(old.error, widget.error)) Sounds.instance.play(UiSound.error);
  }

  @override
  Widget build(BuildContext context) {
    final error = widget.error;
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
