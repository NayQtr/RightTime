import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../common/loader.dart';
import '../format.dart';

/// Notifications in full (the lock screen only ever shows a generic line, NMX-21).
class InboxTab extends StatelessWidget {
  const InboxTab({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return SafeArea(
      child: Loader<List<Notice>>(
        key: ValueKey(lang),
        load: repo.notifications,
        builder: (context, list, _) => ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
          Text(t.tabInbox, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: HzSpace.s4),
          if (list.isEmpty) ...[Text(t.noNotifications, style: Theme.of(context).textTheme.titleLarge), Text(t.inboxEmptyBody)],
          for (final n in list)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(n.text),
              subtitle: Text(fmtWhen(n.createdAt, lang)),
              onTap: n.bookingId == null ? null : () => context.push('/booking/${n.bookingId}'),
            ),
        ]),
      ),
    );
  }
}
