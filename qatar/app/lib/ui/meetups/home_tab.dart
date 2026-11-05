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
import '../theme.dart';
import '../common/test_id.dart';

String experienceName(AppLocalizations t, String e) => e == 'coffee' ? t.coffee : t.dinner;

/// Home: Doha, upcoming sessions in the member's languages; tap one to book it, or to open a booked one.
class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return SafeArea(
      child: Loader<List<SessionSummary>>(
        key: ValueKey(lang),
        load: repo.sessions,
        builder: (context, sessions, _) => ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
          Text(t.cityFull, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: HzSpace.s4),
          if (sessions.isEmpty) Text(t.noSessions),
          for (final s in sessions) _SessionCard(s),
        ]),
      ),
    );
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
    final status = s.myBookingId != null ? t.alreadyBooked : s.isFull ? t.full : t.seatsLeft(s.seatsLeft);
    return TestId('session-${s.id}', child: Card(
      key: Key('session-${s.id}'),
      margin: const EdgeInsets.only(bottom: HzSpace.s3),
      child: InkWell(
        borderRadius: BorderRadius.circular(HzRadius.md),
        onTap: s.myBookingId != null
            ? () => context.push('/booking/${s.myBookingId}')
            : s.isFull
                ? null
                : () => context.push('/book', extra: s),
        child: Padding(
          padding: const EdgeInsets.all(HzSpace.s4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // the experience, then the date on its own line: a "·" never dangles at the end of a wrapped line
            Text(experienceName(t, s.experience), style: Theme.of(context).textTheme.titleLarge),
            Text(fmtWhen(s.startsAt, lang), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: HzSpace.s1),
            Text('${s.district} · ${s.language == 'ar' ? t.langAr : t.langEn}'),
            const SizedBox(height: HzSpace.s2),
            Text(status, style: TextStyle(color: s.isFull && s.myBookingId == null ? c.danger : c.primary, fontWeight: FontWeight.w600)),
          ]),
        ),
      ),
    ));
  }
}
