import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
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

/// The clock behind "this week" on home (the seven Doha days from today). Tests set it to a fixed day.
@visibleForTesting
DateTime Function() homeNow = DateTime.now;

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
  String? day, area, kind;
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
    final shown = [
      for (final s in all)
        if ((day == null || qatarDayKey(s.startsAt) == day) && (area == null || s.district == area) && (kind == null || s.experience == kind)) s
    ];
    // This week (owner, 14 Nov: rounds 1-3): the seven Doha days from today are the day filter, with a live count; the
    // week's meetups are a row of photo cards to swipe, and later ones stay in the list below.
    final now = homeNow().toUtc().add(const Duration(hours: 3));
    final week = [for (var i = 0; i < 7; i++) DateTime.utc(now.year, now.month, now.day + i)];
    String keyOf(DateTime d) => d.toIso8601String().substring(0, 10);
    final weekKeys = {for (final d in week) keyOf(d)};
    final daysWith = {for (final s in all) qatarDayKey(s.startsAt)};
    final peek = [for (final s in shown) if (weekKeys.contains(qatarDayKey(s.startsAt))) s];
    final later = [for (final s in shown) if (!weekKeys.contains(qatarDayKey(s.startsAt))) s];
    // the week heading carries its count: the week's meetups under the kind and area chosen (the strip picks the day)
    final weekN = [for (final s in all) if (weekKeys.contains(qatarDayKey(s.startsAt)) && (area == null || s.district == area) && (kind == null || s.experience == kind)) s].length;
    return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
      Text(t.cityFull, style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: HzSpace.s4),
      if (all.isNotEmpty) ...[
        RiseIn(index: 0, once: 'home', child: _Tile(
          color: c.surfaceSunken,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Semantics(
              header: true,
              label: t.weekCount(weekN),
              excludeSemantics: true,
              child: Row(children: [
                Text(t.thisWeek, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
                Text(' · $weekN', key: const Key('week-heading-count'), style: Theme.of(context).textTheme.labelSmall?.copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
              ]),
            ),
            const SizedBox(height: HzSpace.s1),
            Row(key: const Key('week'), children: [
              for (final d in week)
                Expanded(child: _WeekDay(
                  date: d,
                  lang: lang,
                  has: daysWith.contains(keyOf(d)),
                  selected: day == keyOf(d),
                  onTap: () => setState(() => day = day == keyOf(d) ? null : keyOf(d)),
                )),
            ]),
          ]),
        )),
        const SizedBox(height: HzSpace.s3),
        RiseIn(index: 1, once: 'home', child: Row(children: [
          for (final (k, name, icon) in [('dinner', t.dinner, Icons.restaurant_outlined), ('coffee', t.coffee, Icons.coffee_outlined)]) ...[
            if (k == 'coffee') const SizedBox(width: HzSpace.s3),
            Expanded(child: _KindTile(
              id: k,
              name: name,
              icon: icon,
              enabled: all.any((s) => s.experience == k),
              selected: kind == k,
              onTap: () => setState(() => kind = kind == k ? null : k),
            )),
          ],
        ])),
        const SizedBox(height: HzSpace.s3),
        if (peek.isNotEmpty) ...[
          Text(day == null ? t.weekCount(peek.length) : t.dayCount(peek.length), key: const Key('week-count'),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: c.textMuted)),
          const SizedBox(height: HzSpace.s2),
          SingleChildScrollView(
            key: const Key('peek'),
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            child: IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final (i, s) in peek.indexed)
                  Padding(
                    padding: EdgeInsetsDirectional.only(end: i + 1 == peek.length ? 0 : HzSpace.s3),
                    child: RiseIn(index: 2 + i, once: 'home', child: _PeekCard(s)),
                  ),
              ]),
            ),
          ),
          const SizedBox(height: HzSpace.s4),
        ],
      ],
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
      ],
      if (shown.isEmpty && all.isNotEmpty) Text(t.noFilterMatch, key: const Key('no-filter-match')),
      for (final (i, s) in later.indexed) RiseIn(index: i, once: 'home', child: _SessionCard(s)),
    ]);
  }
}

/// One tinted tile of the home header.
class _Tile extends StatelessWidget {
  const _Tile({required this.color, required this.child, this.selected = false});
  final Color color;
  final Widget child;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return AnimatedContainer(
      duration: MediaQuery.of(context).disableAnimations ? Duration.zero : HzMotion.base,
      curve: HzMotion.easing,
      padding: const EdgeInsets.all(HzSpace.s3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(HzRadius.md),
        border: Border.all(color: selected ? c.primary : color, width: 2),
      ),
      child: child,
    );
  }
}

/// One day of the week strip: the weekday, the day of the month, and a dot when a meetup falls on it. A day without a
/// meetup is faded and cannot be chosen; tapping the chosen day again shows the whole week.
class _WeekDay extends StatelessWidget {
  const _WeekDay({required this.date, required this.lang, required this.has, required this.selected, required this.onTap});
  final DateTime date;
  final String lang;
  final bool has, selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    final id = 'wk-${date.toIso8601String().substring(0, 10)}';
    return Semantics(
      button: true,
      enabled: has,
      selected: selected,
      label: latinDigits(DateFormat('EEEE d', lang).format(date)),
      child: TestId(id, child: Press(dim: true, child: InkWell(
        key: Key(id),
        borderRadius: BorderRadius.circular(HzRadius.md),
        onTap: has ? onTap : null,
        child: ExcludeSemantics(
          child: Opacity(
            opacity: has ? 1 : 0.45,
            child: AnimatedContainer(
              duration: MediaQuery.of(context).disableAnimations ? Duration.zero : HzMotion.base,
              curve: HzMotion.easing,
              height: 60,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(HzRadius.md),
                border: Border.all(color: selected ? c.primary : c.primary.withValues(alpha: 0), width: 2),
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: FittedBox(fit: BoxFit.scaleDown, child: Text(DateFormat('EEE', lang).format(date), maxLines: 1, style: tt.labelSmall?.copyWith(fontSize: 11, height: 1.3, color: c.textMuted))),
                ),
                Text('${date.day}', style: tt.titleLarge?.copyWith(fontSize: 18, height: 1.2, fontWeight: FontWeight.w800, color: c.text)),
                Container(width: 5, height: 5, decoration: BoxDecoration(shape: BoxShape.circle, color: has ? c.primary : c.primary.withValues(alpha: 0))),
              ]),
            ),
          ),
        ),
      ))),
    );
  }
}

/// Dinner or coffee: a tinted tile that narrows the meetups to that kind; tapping it again shows both.
class _KindTile extends StatelessWidget {
  const _KindTile({required this.id, required this.name, required this.icon, required this.enabled, required this.selected, required this.onTap});
  final String id, name;
  final IconData icon;
  final bool enabled, selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      child: TestId('kind-$id', child: Press(dim: true, child: InkWell(
        key: Key('kind-$id'),
        borderRadius: BorderRadius.circular(HzRadius.md),
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: _Tile(
            color: c.primarySubtle,
            selected: selected,
            child: Row(children: [
              Expanded(child: Text(name, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 17))),
              // the one small yellow mark: a dot beside the drawing
              Container(width: 6, height: 6, decoration: BoxDecoration(shape: BoxShape.circle, color: c.accent)),
              const SizedBox(width: HzSpace.s1),
              Icon(icon, size: 30, color: c.primary),
            ]),
          ),
        ),
      ))),
    );
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

/// What a session card says under its details: booked, full, or the few seats left; nothing when there is room.
String _statusOf(AppLocalizations t, SessionSummary s) =>
    s.myBookingId != null ? t.alreadyBooked : s.isFull ? t.full : s.seatsLeft <= seatsLow ? t.seatsLeft(s.seatsLeft) : '';

/// Where a session card leads: her booking when she has one, the booking flow otherwise, nowhere when it is full.
VoidCallback? _openOf(BuildContext context, SessionSummary s) => s.myBookingId != null
    ? () => pushFromCard(context, '/booking/${s.myBookingId}')
    : s.isFull
        ? null
        : () => context.push('/book', extra: s);

/// Under a full session: how the waiting list works, in three steps (owner's texts, 14 Nov 2026). Information only:
/// the app has no call to join the list yet, so nothing here can be tapped.
class _WaitlistSteps extends StatelessWidget {
  const _WaitlistSteps();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final small = Theme.of(context).textTheme.bodySmall;
    return Column(key: const Key('waitlist-steps'), crossAxisAlignment: CrossAxisAlignment.start, children: [
      Divider(height: HzSpace.s5, thickness: 1, color: c.border),
      for (final (i, step) in [t.waitlistStep1, t.waitlistStep2, t.waitlistStep3].indexed)
        Padding(
          padding: EdgeInsets.only(top: i == 0 ? 0 : HzSpace.s1),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: HzSpace.s5, child: Text('${i + 1}', style: small?.copyWith(color: c.primary, fontWeight: FontWeight.w700))),
            Expanded(child: Text(step, style: small?.copyWith(color: c.textMuted))),
          ]),
        ),
    ]);
  }
}

/// The date as a calendar leaf, as on the website (decoration: the date line beside it says the same).
class _Leaf extends StatelessWidget {
  const _Leaf(this.startsAt, {this.width = 60});
  final String startsAt;
  final double width;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    final lang = context.watch<LocaleController>().code;
    return ExcludeSemantics(
      child: Container(
        width: width,
        padding: const EdgeInsets.symmetric(vertical: HzSpace.s2),
        decoration: BoxDecoration(color: c.primarySubtle, borderRadius: BorderRadius.circular(HzRadius.md)),
        child: Column(children: [
          Text(fmtDay(startsAt), style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: c.primary, fontWeight: FontWeight.w800, height: 1.05)),
          Text(fmtWeekday(startsAt, lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: c.primary)),
        ]),
      ),
    );
  }
}

/// One of this week's meetups in the row to swipe: an atmosphere photo (no faces; dinner the laid table, coffee the
/// counter), then the same date leaf, words and action as the list card, under the same key.
class _PeekCard extends StatelessWidget {
  const _PeekCard(this.s);

  final SessionSummary s;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    final lang = context.watch<LocaleController>().code;
    final status = _statusOf(t, s);
    final open = _openOf(context, s);
    // on the photo: the status as a small pill at the top start (full, booked, or the few seats left), and a round
    // chevron at the bottom end when the card opens; both on a nearly solid light fill so they read over any photo
    final veil = c.surface.withValues(alpha: 0.92);
    return TestId('session-${s.id}', child: Container(
      key: Key('session-${s.id}'),
      constraints: const BoxConstraints.tightFor(width: 272),
      child: Material(
        color: c.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.xl), side: BorderSide(color: c.border)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: open,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Stack(children: [
              Positioned.fill(child: ExcludeSemantics(child: Image.asset('assets/photos/${s.experience == 'coffee' ? 'cake' : 'seat'}-720.webp', height: 132, fit: BoxFit.cover))),
              const SizedBox(height: 132, width: double.infinity),
              if (status.isNotEmpty)
                PositionedDirectional(
                  top: HzSpace.s2,
                  start: HzSpace.s2,
                  child: Container(
                    key: Key('pill-${s.id}'),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: veil, borderRadius: BorderRadius.circular(HzRadius.pill)),
                    child: Text(status, style: tt.labelSmall?.copyWith(fontWeight: FontWeight.w600,
                        color: s.myBookingId != null ? c.success : s.isFull ? c.danger : c.text)),
                  ),
                ),
              if (open != null)
                PositionedDirectional(
                  bottom: HzSpace.s2,
                  end: HzSpace.s2,
                  child: ExcludeSemantics(
                    child: Container(
                      key: Key('chevron-${s.id}'),
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(color: veil, shape: BoxShape.circle),
                      child: Icon(Icons.chevron_right, size: 18, color: c.text), // the icon mirrors itself in Arabic
                    ),
                  ),
                ),
            ]),
            Padding(
              padding: const EdgeInsets.all(HzSpace.s3),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _Leaf(s.startsAt, width: 56),
                const SizedBox(width: HzSpace.s3),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${experienceName(t, s.experience)} · ${s.language == 'ar' ? t.langAr : t.langEn}', style: tt.titleMedium),
                    Text('${s.district} · ${fmtTime(s.startsAt, lang)}', style: tt.bodySmall?.copyWith(color: c.textMuted)),
                  ]),
                ),
              ]), if (s.isFull && s.myBookingId == null) const _WaitlistSteps()]),
            ),
          ]),
        ),
      ),
    ));
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard(this.s);

  final SessionSummary s;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final lang = context.watch<LocaleController>().code;
    final status = _statusOf(t, s);
    // raised light card with a hairline edge and a soft shadow, as on the website (identity step, 13 Nov 2026)
    return TestId('session-${s.id}', child: Container(
      key: Key('session-${s.id}'),
      margin: const EdgeInsets.only(bottom: HzSpace.s3),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(HzRadius.xl), boxShadow: [
        BoxShadow(color: c.text.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(0, 10), spreadRadius: -18),
      ]),
      child: Material(
      color: c.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.xl), side: BorderSide(color: c.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        borderRadius: BorderRadius.circular(HzRadius.xl),
        onTap: _openOf(context, s),
        child: Padding(
          padding: const EdgeInsets.all(HzSpace.s4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _Leaf(s.startsAt),
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
          ]), if (s.isFull && s.myBookingId == null) const _WaitlistSteps()]),
        ),
      ),
    )));
  }
}
