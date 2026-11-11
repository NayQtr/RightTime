import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart' show errorText;
import '../common/loader.dart';
import '../format.dart';
import '../meetups/report_screen.dart' show categoryLabel;
import '../common/press.dart';

/// "Decisions about you": decisions taken after a report, in words, with the right to appeal within 14 days. A member
/// whose account is suspended can still open it (the server allows this route while suspended).
class CasesScreen extends StatelessWidget {
  const CasesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final lang = context.watch<LocaleController>().code;
    final repo = context.read<MeetupsRepository>();
    return Scaffold(
      appBar: AppBar(title: Text(t.casesTitle)),
      body: SafeArea(
        child: Loader<List<CaseDecision>>(
          key: ValueKey(lang),
          load: repo.cases,
          builder: (context, cases, reload) => cases.isEmpty
              ? Padding(padding: const EdgeInsets.all(HzSpace.gutter), child: Text(t.noCases, key: const Key('no-cases')))
              : ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [for (final c in cases) _CaseCard(c: c, lang: lang)]),
        ),
      ),
    );
  }
}

class _CaseCard extends StatefulWidget {
  const _CaseCard({required this.c, required this.lang});
  final CaseDecision c;
  final String lang;

  @override
  State<_CaseCard> createState() => _CaseCardState();
}

class _CaseCardState extends State<_CaseCard> {
  bool busy = false, sent = false;
  ApiError? error;

  Future<void> _appeal() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await context.read<MeetupsRepository>().appeal(widget.c.ref);
      sent = true;
    } on ApiError catch (e) {
      error = e;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.c;
    final tt = Theme.of(context).textTheme;
    return Card(
      key: Key('case-${c.ref}'),
      child: Padding(
        padding: const EdgeInsets.all(HzSpace.s4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(c.decision, style: tt.titleMedium),
          const SizedBox(height: HzSpace.s1),
          Text([if (c.eventDate != null) fmtWhen(c.eventDate!, widget.lang), categoryLabel(t, c.category)].join(' · '), style: tt.bodySmall),
          Text(c.ref, style: tt.bodySmall),
          if (c.canAppeal && !sent) ...[
            const SizedBox(height: HzSpace.s3),
            Text(t.appealUntil(fmtWhen(c.appealUntil, widget.lang)), style: tt.bodySmall),
            const SizedBox(height: HzSpace.s2),
            Press(child: OutlinedButton(key: Key('appeal-${c.ref}'), onPressed: busy ? null : _appeal, child: Text(t.appeal))),
          ],
          if (sent) ...[const SizedBox(height: HzSpace.s3), Text(t.appealSent, key: const Key('appeal-sent'))],
          if (error != null) ...[
            const SizedBox(height: HzSpace.s3),
            Text(errorText(t, error!), style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ]),
      ),
    );
  }
}
