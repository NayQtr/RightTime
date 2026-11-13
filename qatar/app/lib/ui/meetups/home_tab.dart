import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../common/busy_label.dart';
import '../common/card_origin.dart';
import '../common/loader.dart';
import '../common/motion.dart';
import '../format.dart';
import '../theme.dart';
import '../common/press.dart';
import '../common/test_id.dart';

String experienceName(AppLocalizations t, String e) => e == 'coffee' ? t.coffee : t.dinner;

/// Day and area chips appear only when more sessions than this are listed (item 43, provisional; the website uses the
/// same figure, FILTERS_ABOVE in web/app.js).
const filtersAbove = 8;

/// Home: Doha, upcoming sessions in the member's languages; tap one to book it, or to open a booked one.
class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return SafeArea(
      child: Loader<SessionsList>(
        key: ValueKey(lang),
        load: repo.sessionsList,
        builder: (context, data, _) => _SessionList(data),
      ),
    );
  }
}

/// The list itself: with no session in her languages, "notify me" (v0.3 E-LANG-1); on a long list, day and area chips.
class _SessionList extends StatefulWidget {
  const _SessionList(this.data);
  final SessionsList data;

  @override
  State<_SessionList> createState() => _SessionListState();
}

class _SessionListState extends State<_SessionList> {
  String? day, area;
  late bool notifyOn = widget.data.notifyMeActive;
  bool busy = false;
  ApiError? error;

  Future<void> _notifyMe() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await context.read<MeetupsRepository>().notifyMe();
      if (mounted) setState(() => notifyOn = true);
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final lang = context.watch<LocaleController>().code;
    final all = widget.data.sessions;
    final filters = all.length > filtersAbove;
    final days = <String, String>{for (final s in all) qatarDayKey(s.startsAt): fmtDayChip(s.startsAt, lang)};
    final areas = <String>{for (final s in all) s.district}.toList();
    final shown = [for (final s in all) if ((day == null || qatarDayKey(s.startsAt) == day) && (area == null || s.district == area)) s];
    return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
      Text(t.cityFull, style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: HzSpace.s4),
      if (all.isEmpty) ...[
        Text(t.noSessions),
        const SizedBox(height: HzSpace.s3),
        if (notifyOn)
          TestId('notify-on', child: Text(t.notifyMeOn, key: const Key('notify-on'), style: TextStyle(color: c.textMuted)))
        else
          TestId('notify-me', child: Press(child: OutlinedButton.icon(
            key: const Key('notify-me'),
            onPressed: busy ? null : _notifyMe,
            icon: const Icon(Icons.notifications_outlined),
            label: BusyLabel(busy: busy, child: Text(t.notifyMe)),
          ))),
        if (error != null) ...[const SizedBox(height: HzSpace.s3), ErrorBanner(error!)],
      ],
      if (filters) ...[
        _ChipRow(label: t.filterDay, id: 'day', all: t.filterAll, options: days, selected: day, onSelected: (v) => setState(() => day = v)),
        const SizedBox(height: HzSpace.s3),
        _ChipRow(label: t.district, id: 'area', all: t.filterAll, options: {for (final a in areas) a: a}, selected: area, onSelected: (v) => setState(() => area = v)),
        const SizedBox(height: HzSpace.s4),
        if (shown.isEmpty) Text(t.noFilterMatch, key: const Key('no-filter-match')),
      ],
      for (final (i, s) in shown.indexed) RiseIn(index: i, child: _SessionCard(s)),
    ]);
  }
}

/// One filter group: its name, then "All" and one chip per value in a row that scrolls sideways (as on the website).
class _ChipRow extends StatelessWidget {
  const _ChipRow({required this.label, required this.id, required this.all, required this.options, required this.selected, required this.onSelected});
  final String label, id, all;
  final Map<String, String> options; // value -> label
  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    Widget chip(String? value, String text) {
      final on = selected == value;
      return Padding(
        padding: const EdgeInsetsDirectional.only(end: HzSpace.s2),
        child: TestId('$id-${value ?? 'all'}', child: ChoiceChip(
          key: Key('$id-${value ?? 'all'}'),
          label: Text(text),
          selected: on,
          showCheckmark: false,
          selectedColor: c.primary,
          backgroundColor: c.surfaceSunken,
          labelStyle: TextStyle(color: on ? c.onPrimary : c.text),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.pill), side: BorderSide(color: on ? c.primary : c.borderStrong)),
          onSelected: (_) => onSelected(value),
        )),
      );
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: HzSpace.s2),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [chip(null, all), for (final e in options.entries) chip(e.key, e.value)]),
      ),
    ]);
  }
}

/// Seats left are shown only when this few remain (owner's decision, 13 Nov 2026): plenty of room says nothing.
const seatsLow = 3;

class _SessionCard extends StatelessWidget {
  const _SessionCard(this.s);

  final SessionSummary s;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final lang = context.watch<LocaleController>().code;
    final status = s.myBookingId != null ? t.alreadyBooked : s.isFull ? t.full : s.seatsLeft <= seatsLow ? t.seatsLeft(s.seatsLeft) : '';
    return TestId('session-${s.id}', child: Card(
      key: Key('session-${s.id}'),
      margin: const EdgeInsets.only(bottom: HzSpace.s3),
      child: InkWell(
        borderRadius: BorderRadius.circular(HzRadius.md),
        onTap: s.myBookingId != null
            ? () => pushFromCard(context, '/booking/${s.myBookingId}')
            : s.isFull
                ? null
                : () => context.push('/book', extra: s),
        child: Padding(
          padding: const EdgeInsets.all(HzSpace.s4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // the date as a calendar leaf, as on the website (decoration: the date line beside it says the same)
            ExcludeSemantics(
              child: Container(
                width: 60,
                padding: const EdgeInsets.symmetric(vertical: HzSpace.s2),
                decoration: BoxDecoration(color: c.primarySubtle, borderRadius: BorderRadius.circular(HzRadius.md)),
                child: Column(children: [
                  Text(fmtDay(s.startsAt), style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: c.primary, fontWeight: FontWeight.w800, height: 1.05)),
                  Text(fmtWeekday(s.startsAt, lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: c.primary)),
                ]),
              ),
            ),
            const SizedBox(width: HzSpace.s4),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // the experience, then the date on its own line: a "·" never dangles at the end of a wrapped line
                Text(experienceName(t, s.experience), style: Theme.of(context).textTheme.titleLarge),
                Text(fmtWhen(s.startsAt, lang), style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: HzSpace.s1),
                Text('${s.district} · ${s.language == 'ar' ? t.langAr : t.langEn}'),
                if (status.isNotEmpty) ...[
                  const SizedBox(height: HzSpace.s2),
                  Text(status, style: TextStyle(color: s.isFull && s.myBookingId == null ? c.danger : c.primary, fontWeight: FontWeight.w600)),
                ],
              ]),
            ),
          ]),
        ),
      ),
    ));
  }
}
