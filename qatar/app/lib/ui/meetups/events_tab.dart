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
import 'home_tab.dart' show experienceName;
import '../common/test_id.dart';

/// My meetups: upcoming first, then past ones. Each opens its details.
class EventsTab extends StatelessWidget {
  const EventsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return SafeArea(
      child: Loader<List<BookingSummary>>(
        key: ValueKey(lang),
        load: repo.bookings,
        builder: (context, all, _) {
          final upcoming = all.where((b) => b.isActive).toList()..sort((a, b) => a.startsAt.compareTo(b.startsAt));
          final past = all.where((b) => !b.isActive).toList();
          return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
            Text(t.tabEvents, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: HzSpace.s4),
            if (all.isEmpty) ...[Text(t.noBookings), const SizedBox(height: HzSpace.s2), Text(t.bookOnWeb)],
            for (final b in [...upcoming, ...past])
              TestId('booking-${b.id}', child: ListTile(
                key: Key('booking-${b.id}'),
                contentPadding: EdgeInsets.zero,
                title: Text('${experienceName(t, b.experience)} · ${fmtWhen(b.startsAt, lang)}'),
                subtitle: Text('${b.district} · ${t.bookingRef} ${b.ref}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push('/booking/${b.id}'),
              )),
          ]);
        },
      ),
    );
  }
}
