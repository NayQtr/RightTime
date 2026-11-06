import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../format.dart';
import '../common/busy_label.dart';
import '../common/press.dart';

/// The organiser cancelled (the table did not fill): another session with the same fee, or a full refund. With no
/// choice before the deadline, the refund happens automatically.
class ResolutionSection extends StatefulWidget {
  const ResolutionSection({super.key, required this.bookingId, required this.details, required this.onDone});
  final String bookingId;
  final EventDetails details;
  final VoidCallback onDone;

  @override
  State<ResolutionSection> createState() => _ResolutionSectionState();
}

class _ResolutionSectionState extends State<ResolutionSection> {
  String? choice; // a session id, or 'refund'
  bool busy = false;
  ApiError? error;

  Future<void> _confirm() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await context.read<MeetupsRepository>().resolve(widget.bookingId, rebookSessionId: choice == 'refund' ? null : choice);
      widget.onDone();
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final lang = context.watch<LocaleController>().code;
    final tt = Theme.of(context).textTheme;
    final r = widget.details.resolution!;
    return Card(
      key: const Key('resolution'),
      child: Padding(
        padding: const EdgeInsets.all(HzSpace.s4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t.orgTitle, style: tt.titleLarge),
          const SizedBox(height: HzSpace.s1),
          Text(t.orgBody),
          const SizedBox(height: HzSpace.s3),
          RadioGroup<String>(
            groupValue: choice,
            onChanged: (v) => setState(() => choice = v),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (r.sessions.isNotEmpty) ...[
                Text('${t.optRebook} · ${t.optRebookHelp}', style: tt.titleMedium),
                for (final s in r.sessions)
                  RadioListTile<String>(
                    key: Key('rebook-${s.id}'),
                    contentPadding: EdgeInsets.zero,
                    value: s.id,
                    title: Text(fmtWhen(s.startsAt, lang)),
                    subtitle: Text(s.alternate ? '${s.district} · ${t.alternateTag}' : s.district),
                  ),
              ],
              RadioListTile<String>(
                key: const Key('refund'),
                contentPadding: EdgeInsets.zero,
                value: 'refund',
                title: Text(t.optRefund),
                subtitle: Text(t.optRefundHelp(r.refund ?? '', 10)),
              ),
            ]),
          ),
          Text(t.defaultRefund(fmtWhen(r.deadline, lang)), style: tt.bodySmall),
          if (error != null) ...[const SizedBox(height: HzSpace.s2), ErrorBanner(error!)],
          const SizedBox(height: HzSpace.s3),
          Press(child: FilledButton(key: const Key('confirm-choice'), onPressed: choice == null || busy ? null : _confirm, child: BusyLabel(busy: busy, child: Text(t.confirmChoice)))),
        ]),
      ),
    );
  }
}
