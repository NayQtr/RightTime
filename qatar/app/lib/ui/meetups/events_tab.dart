import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../common/card_origin.dart';
import '../common/loader.dart';
import '../common/motion.dart';
import '../common/table_art.dart';
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
            if (all.isEmpty) ...[
              Text(t.noBookings),
              const SizedBox(height: HzSpace.s2),
              Text(t.bookOnWeb),
              const SizedBox(height: HzSpace.s4),
              const _ReadyCard(),
            ],
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
    // its lines arrive one after another, 60 ms apart (owner, 14 Nov: rounds 1-3)
    Widget line(int i, Widget child) => RiseIn(index: i, gap: const Duration(milliseconds: 60), child: child);
    // a double frame: a faint band of the brand colour around the card
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(HzRadius.xl + 6)),
      child: TestId('booking-${b.id}', child: Material(
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
            line(1, Text(experienceName(t, b.experience), style: tt.headlineSmall?.copyWith(color: c.onPrimary))),
            line(2, Text(fmtWhen(b.startsAt, lang), style: tt.titleMedium?.copyWith(color: c.onPrimary))),
            const SizedBox(height: HzSpace.s1),
            line(3, Text('${b.district} · ${t.bookingRef} ${b.ref}', style: tt.bodyMedium?.copyWith(color: soft))),
            const SizedBox(height: HzSpace.s4),
            Press(child: FilledButton(
              onPressed: open,
              style: FilledButton.styleFrom(backgroundColor: c.onPrimary, foregroundColor: c.primary),
              child: Text(t.viewDetails),
            )),
          ]),
        ),
      ),
    )));
  }
}

/// With no meetup yet, "my meetups" is not an empty page: a getting-ready card (owner, 14 Nov: rounds 1-3). The
/// questions are behind her (she cannot be here without them), so that step is struck through; the other two lead to
/// the dates and to the rules.
class _ReadyCard extends StatelessWidget {
  const _ReadyCard();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    Widget step(String id, String text, {VoidCallback? onTap}) {
      final done = onTap == null;
      return Semantics(
        button: !done,
        checked: done,
        child: InkWell(
          key: Key(id),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: HzSpace.touchTarget),
            padding: const EdgeInsetsDirectional.only(start: HzSpace.s3),
            decoration: BoxDecoration(border: BorderDirectional(start: BorderSide(color: done ? c.primary : c.primary.withValues(alpha: 0.28), width: 3))),
            child: Row(children: [
              Expanded(child: Text(text, style: done ? TextStyle(color: c.textMuted, decoration: TextDecoration.lineThrough) : null)),
              if (!done) Icon(Icons.chevron_right, color: c.textMuted), // the icon mirrors itself in Arabic
            ]),
          ),
        ),
      );
    }

    return Container(
      key: const Key('ready'),
      padding: const EdgeInsets.all(HzSpace.s5),
      decoration: BoxDecoration(color: c.primarySubtle, borderRadius: BorderRadius.circular(HzRadius.md)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(t.readyTitle, style: tt.titleLarge)),
          const TableArt(filled: 1, size: 48),
        ]),
        const SizedBox(height: HzSpace.s2),
        step('ready-answers', t.readyAnswers),
        const SizedBox(height: HzSpace.s1),
        step('ready-pick', t.readyPick, onTap: () => context.go('/home')),
        const SizedBox(height: HzSpace.s1),
        step('ready-rules', t.readyRules, onTap: () => context.push('/documents')),
      ]),
    );
  }
}
