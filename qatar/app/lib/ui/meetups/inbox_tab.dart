import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/device_unlock.dart';
import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../domain/inbox_badge.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../common/loader.dart';
import '../format.dart';
import '../common/press.dart';
import '../common/sound_on_show.dart';
import '../theme.dart';

/// Notifications in full (the lock screen only ever shows a generic line, NMX-21).
class InboxTab extends StatelessWidget {
  const InboxTab({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    final lock = context.watch<PrivacyLock>();
    final badge = context.watch<InboxBadge>();
    if (!lock.unlocked) {
      return SafeArea(
        child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
          Text(t.tabInbox, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: HzSpace.s4),
          const Icon(Icons.lock_outline, size: 40),
          const SizedBox(height: HzSpace.s3),
          Text(t.inboxLocked, key: const Key('inbox-locked')),
          const SizedBox(height: HzSpace.s4),
          Press(child: FilledButton.icon(key: const Key('unlock'), icon: const Icon(Icons.fingerprint), label: Text(t.unlock), onPressed: () => lock.unlock(t.unlockReason))),
        ]),
      );
    }
    return SafeArea(
      // fetched again on each visit to the tab; what is new since her last visit is marked, and from now on seen (the
      // website's rule, NMX-18)
      child: Loader<(List<Notice>, String?)>(
        key: ValueKey('$lang-${badge.visit}'),
        load: () async {
          final list = await repo.notifications();
          return (list, badge.markSeen(list));
        },
        builder: (context, data, _) {
          final (list, seen) = data;
          return NewNoticeSound(newest: _newest(list), child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
          Text(t.tabInbox, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: HzSpace.s4),
          if (list.isEmpty) ...[Text(t.noNotifications, style: Theme.of(context).textTheme.titleLarge), Text(t.inboxEmptyBody)],
          // a dated record on a thin rail (owner, 14 Nov: rounds 1-3): each day is named once, then its notices
          for (final (i, n) in list.indexed) ...[
            if (i == 0 || qatarDayKey(list[i - 1].createdAt) != qatarDayKey(n.createdAt))
              _Rail(
                first: i == 0,
                child: Padding(
                  padding: const EdgeInsets.only(top: HzSpace.s2, bottom: HzSpace.s1),
                  child: Text(_dayName(t, n.createdAt, lang), key: Key('day-${qatarDayKey(n.createdAt)}'),
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: hzColors(context).textMuted, fontWeight: FontWeight.w600)),
                ),
              ),
            _Rail(
              dot: true,
              filled: InboxBadge.isNew(n, seen),
              last: i + 1 == list.length,
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                // a new one: a filled dot, its words in bold and the word "New" (never colour alone), as on the website
                title: InboxBadge.isNew(n, seen)
                    ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(t.newTag, key: Key('new-${n.id}'), style: Theme.of(context).textTheme.labelMedium?.copyWith(color: hzColors(context).primary, fontWeight: FontWeight.w700)),
                        Text(n.text, style: const TextStyle(fontWeight: FontWeight.w600)),
                      ])
                    : Text(n.text),
                subtitle: Text(fmtTime(n.createdAt, lang)),
                shape: Border(bottom: BorderSide(color: hzColors(context).border)),
                onTap: n.bookingId == null ? null : () => context.push('/booking/${n.bookingId}'),
              ),
            ),
          ],
        ]));
        },
      ),
    );
  }

  /// "Today" for a notice of this Doha day, the full date otherwise.
  static String _dayName(AppLocalizations t, String iso, String lang) =>
      qatarDayKey(iso) == qatarDayKey(DateTime.now().toIso8601String()) ? t.dayToday : fmtDate(iso, lang);

  static String? _newest(List<Notice> list) {
    String? best;
    for (final n in list) {
      final at = DateTime.tryParse(n.createdAt);
      if (at != null && (best == null || at.isAfter(DateTime.parse(best)))) best = n.createdAt;
    }
    return best;
  }
}

/// One row of the dated rail: a thin line down the start side, with a ring where a notice hangs on it.
class _Rail extends StatelessWidget {
  const _Rail({required this.child, this.dot = false, this.filled = false, this.first = false, this.last = false});
  final Widget child;
  final bool dot, filled, first, last;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    final line = c.primary.withValues(alpha: 0.3);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        ExcludeSemantics(
          child: SizedBox(
            width: 26,
            child: Stack(children: [
              PositionedDirectional(start: 8, top: first ? 14 : 0, bottom: last ? null : 0, height: last ? 26 : null, child: Container(width: 1, color: line)),
              if (dot)
                PositionedDirectional(
                  start: 3.5,
                  top: 22,
                  child: Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: filled ? c.primary : c.bg, border: Border.all(color: c.primary, width: 1.5))),
                ),
            ]),
          ),
        ),
        Expanded(child: child),
      ]),
    );
  }
}
