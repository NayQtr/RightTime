import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../core/link_opener.dart';
import '../../data/meetups_repository.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../common/loader.dart';
import '../format.dart';
import '../theme.dart';
import 'contacts_section.dart';
import 'home_tab.dart' show experienceName;
import 'resolution_section.dart';

/// One meetup. The server decides what is visible when (venue after the reveal, names on the day); this screen shows
/// what it gets. Offline, it shows the copy saved on the device, read-only, with when it was saved.
class EventDetailsScreen extends StatefulWidget {
  const EventDetailsScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  State<EventDetailsScreen> createState() => _EventDetailsScreenState();
}

class _EventDetailsScreenState extends State<EventDetailsScreen> {
  int _reload = 0;
  String get bookingId => widget.bookingId;

  Future<void> _checkIn(BuildContext context) async {
    try {
      await context.read<MeetupsRepository>().checkIn(bookingId);
    } on ApiError catch (_) {
      // the reloaded screen shows the current state either way
    }
    if (mounted) setState(() => _reload++);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return Scaffold(
      appBar: AppBar(title: Text(t.detailsTitle)),
      body: SafeArea(
        child: Loader<DetailsResult>(
          key: ValueKey('$lang-$_reload'),
          load: () => repo.eventDetails(bookingId),
          builder: (context, r, _) {
            final d = r.details;
            final c = hzColors(context);
            final tt = Theme.of(context).textTheme;
            final v = d.venue;
            return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
              if (r.offlineSavedAt != null) ...[
                Container(
                  key: const Key('offline-copy'),
                  padding: const EdgeInsets.all(HzSpace.s3),
                  decoration: BoxDecoration(color: c.warning.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(HzRadius.sm)),
                  child: Text(t.offlineCopy(fmtWhen(r.offlineSavedAt!.toIso8601String(), lang))),
                ),
                const SizedBox(height: HzSpace.s4),
              ],
              Text('${experienceName(t, d.experience)} · ${fmtWhen(d.startsAt, lang)}', style: tt.headlineMedium),
              const SizedBox(height: HzSpace.s1),
              Text('${t.bookingRef} ${d.ref}', style: tt.bodySmall),
              if (d.stage != null) ...[const SizedBox(height: HzSpace.s4), _Tracker(stage: d.stage!)],
              const SizedBox(height: HzSpace.s4),
              _Fact(icon: Icons.place_outlined, label: t.district, value: d.district),
              _Fact(icon: Icons.translate, label: t.tableLanguage, value: d.language == 'ar' ? t.langAr : t.langEn),
              if (d.foodBand != null) _Fact(icon: Icons.account_balance_wallet_outlined, label: t.foodBandLabel, value: d.foodBand!),
              _Fact(icon: Icons.schedule, label: '${t.dateTime} · Asia/Qatar', value: fmtTime(d.startsAt, lang)),
              if (d.confirmedCount != null) ...[
                const SizedBox(height: HzSpace.s4),
                Text(t.yourTable, style: tt.titleLarge),
                Text(t.confirmedCount(d.confirmedCount!)),
                if (d.tablemates.isNotEmpty) Text('${t.tablemates}: ${d.tablemates.join('، ')}'),
              ],
              const SizedBox(height: HzSpace.s4),
              if (v == null && !d.isOver)
                Container(
                  key: const Key('venue-hidden'),
                  padding: const EdgeInsets.all(HzSpace.s3),
                  decoration: BoxDecoration(color: c.primarySubtle, borderRadius: BorderRadius.circular(HzRadius.sm)),
                  child: Text(t.venueHidden(fmtWhen(d.revealAt, lang))),
                ),
              if (v != null)
                Card(
                  key: const Key('venue'),
                  color: c.surface,
                  child: Padding(
                    padding: const EdgeInsets.all(HzSpace.s4),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(v.name, style: tt.titleLarge),
                      Text('${v.address} · ${v.district}'),
                      const SizedBox(height: HzSpace.s3),
                      Text(t.arrival, style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text(v.arrival),
                      if (d.tableCode != null) ...[
                        const SizedBox(height: HzSpace.s3),
                        Text(t.tableCode),
                        Ltr(SelectableText(d.tableCode!, key: const Key('table-code'), style: tt.displaySmall?.copyWith(color: c.primary, letterSpacing: 2))),
                        Text(t.mentionCode, style: tt.bodySmall),
                      ],
                      const SizedBox(height: HzSpace.s3),
                      Text(v.billPolicy, style: tt.bodySmall),
                      if (v.mapUrl.isNotEmpty)
                        TextButton.icon(
                          icon: const Icon(Icons.copy, size: 18),
                          label: Ltr(Text(v.mapUrl, overflow: TextOverflow.ellipsis)),
                          onPressed: () => Clipboard.setData(ClipboardData(text: v.mapUrl)),
                        ),
                    ]),
                  ),
                ),
              if (r.offlineSavedAt == null && d.resolution != null && d.resolution!.open && d.rebookedInto == null) ...[
                const SizedBox(height: HzSpace.s4),
                ResolutionSection(bookingId: bookingId, details: d, onDone: () => setState(() => _reload++)),
              ],
              if (d.rebookedInto != null) ...[
                const SizedBox(height: HzSpace.s4),
                ListTile(
                  key: const Key('rebooked'),
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.event_available, color: c.success),
                  title: Text(t.rebookedInto(d.rebookedInto!.ref)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/booking/${d.rebookedInto!.id}'),
                ),
              ],
              if (r.offlineSavedAt == null && d.action('check_in')) ...[
                const SizedBox(height: HzSpace.s4),
                FilledButton(key: const Key('check-in'), onPressed: () => _checkIn(context), child: Text(t.imHere)),
              ],
              if (d.status == 'checked_in') ...[
                const SizedBox(height: HzSpace.s4),
                Text(t.checkedIn, key: const Key('checked-in'), style: TextStyle(color: c.success, fontWeight: FontWeight.w600)),
              ],
              if (r.offlineSavedAt == null && d.action('feedback')) ...[
                const SizedBox(height: HzSpace.s4),
                FilledButton(key: const Key('rate'), onPressed: () => context.push('/booking/$bookingId/feedback'), child: Text(t.rateIt)),
              ],
              if (d.phase == 'completed' && r.offlineSavedAt == null) ...[const SizedBox(height: HzSpace.s4), ContactsSection(bookingId: bookingId)],
              const SizedBox(height: HzSpace.s6),
              const _CoordinatorButtons(),
              if (r.offlineSavedAt == null && ['forming', 'locked', 'revealed', 'day_of', 'completed'].contains(d.phase))
                OutlinedButton.icon(
                  key: const Key('report'),
                  icon: const Icon(Icons.flag_outlined),
                  label: Text(t.privateReport),
                  onPressed: () => context.push('/report/$bookingId'),
                ),
              if (d.action('cancel') && r.offlineSavedAt == null) ...[
                const SizedBox(height: HzSpace.s3),
                TextButton(
                  key: const Key('cancel'),
                  style: TextButton.styleFrom(foregroundColor: c.danger),
                  onPressed: () => context.push('/booking/$bookingId/cancel'),
                  child: Text(t.cancelBooking),
                ),
              ],
            ]);
          },
        ),
      ),
    );
  }
}

/// Call or WhatsApp the coordinator on duty. Kept on the device, so calling works with no data connection.
class _CoordinatorButtons extends StatelessWidget {
  const _CoordinatorButtons();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return FutureBuilder(
      future: context.read<MeetupsRepository>().coordinator().catchError((Object _) => null),
      builder: (context, snap) {
        final c = snap.data;
        if (c == null) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: HzSpace.s3),
          child: Row(children: [
            Expanded(
              child: OutlinedButton.icon(key: const Key('call-coord'), icon: const Icon(Icons.call), label: Text(t.callCoordinator), onPressed: () => context.read<LinkOpener>().open(Uri.parse(c.telUrl))),
            ),
            if (c.whatsappUrl != null) ...[
              const SizedBox(width: HzSpace.s2),
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('wa-coord'),
                  icon: const Icon(Icons.chat),
                  label: Text(t.whatsappCoordinator),
                  onPressed: () => context.read<LinkOpener>().open(Uri.parse(c.whatsappUrl!)),
                ),
              ),
            ],
          ]),
        );
      },
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label, value;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(value),
        subtitle: Text(label),
      );
}

/// paid · forming · confirmed · revealed
class _Tracker extends StatelessWidget {
  const _Tracker({required this.stage});
  final int stage;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final steps = [t.step1, t.step2, t.step3, t.step4];
    return Row(children: [
      for (var i = 0; i < steps.length; i++)
        Expanded(
          child: Semantics(
            selected: i == stage,
            child: Column(children: [
              Container(height: 4, margin: const EdgeInsets.symmetric(horizontal: 2), color: i <= stage ? c.primary : c.border),
              const SizedBox(height: HzSpace.s1),
              Text(steps[i], textAlign: TextAlign.center, style: TextStyle(fontSize: 12, fontWeight: i == stage ? FontWeight.w700 : FontWeight.w400, color: i <= stage ? c.text : c.textMuted)),
            ]),
          ),
        ),
    ]);
  }
}
