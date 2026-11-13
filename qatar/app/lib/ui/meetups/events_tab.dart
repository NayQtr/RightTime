import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../common/card_origin.dart';
import '../common/loader.dart';
import '../format.dart';
import '../theme.dart';
import 'home_tab.dart' show experienceName;
import '../common/test_id.dart';
import '../common/press.dart';

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
          // the soonest upcoming meetup is the one filled card; the rest stay a plain list
          final next = upcoming.isEmpty ? null : upcoming.first;
          final rest = [...upcoming.skip(1), ...past];
          return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
            Text(t.tabEvents, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: HzSpace.s4),
            if (all.isEmpty) ...[Text(t.noBookings), const SizedBox(height: HzSpace.s2), Text(t.bookOnWeb)],
            if (next != null) ...[_NextMeetupCard(b: next, lang: lang), const SizedBox(height: HzSpace.s4)],
            for (final b in rest)
              TestId('booking-${b.id}', child: Builder(builder: (row) => ListTile(
                key: Key('booking-${b.id}'),
                contentPadding: EdgeInsets.zero,
                title: Text('${experienceName(t, b.experience)} · ${fmtWhen(b.startsAt, lang)}'),
                subtitle: Text('${b.district} · ${t.bookingRef} ${b.ref}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => pushFromCard(row, '/booking/${b.id}'),
              ))),
          ]);
        },
      ),
    );
  }
}

/// "Your next event": the one filled card on this screen, in the brand colour with the on-colour text (as on the website).
class _NextMeetupCard extends StatelessWidget {
  const _NextMeetupCard({required this.b, required this.lang});

  final BookingSummary b;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    final soft = c.onPrimary.withValues(alpha: 0.88);
    void open() => pushFromCard(context, '/booking/${b.id}');
    return TestId('booking-${b.id}', child: Material(
      key: Key('booking-${b.id}'),
      color: c.primary,
      borderRadius: BorderRadius.circular(HzRadius.xl),
      child: InkWell(
        borderRadius: BorderRadius.circular(HzRadius.xl),
        onTap: open,
        child: Padding(
          padding: const EdgeInsets.all(HzSpace.s5),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.nextEvent, style: tt.labelMedium?.copyWith(color: soft)),
            const SizedBox(height: HzSpace.s2),
            Text(experienceName(t, b.experience), style: tt.headlineSmall?.copyWith(color: c.onPrimary)),
            Text(fmtWhen(b.startsAt, lang), style: tt.titleMedium?.copyWith(color: c.onPrimary)),
            const SizedBox(height: HzSpace.s1),
            Text('${b.district} · ${t.bookingRef} ${b.ref}', style: tt.bodyMedium?.copyWith(color: soft)),
            const SizedBox(height: HzSpace.s4),
            Press(child: FilledButton(
              onPressed: open,
              style: FilledButton.styleFrom(backgroundColor: c.onPrimary, foregroundColor: c.primary),
              child: Text(t.viewDetails),
            )),
          ]),
        ),
      ),
    ));
  }
}
