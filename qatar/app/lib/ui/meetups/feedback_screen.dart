import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../data/meetups_repository.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../theme.dart';
import '../common/busy_label.dart';
import '../common/press.dart';
import '../common/sound_on_show.dart';
import '../../core/sounds.dart';
import '../common/test_id.dart';

/// Reasons she can pick when the overall rating is this or lower (Notion fix 10, provisional). The server keeps them up to
/// LOW_RATING_REASONS_MAX (api/src/lib/config.js); the website uses LOW_RATING_REASONS_UP_TO in web/app.js.
const lowRatingReasonsUpTo = 3;
const lowRatingReasons = ['table_fit', 'venue', 'food_service', 'organisation', 'no_shows', 'other'];

/// Private feedback after the meetup: two required ratings, the rest optional. No one at the table sees it.
class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  int? overall, comfort, venue;
  bool again = false, busy = false, sent = false;
  final Set<String> reasons = {};
  bool get _low => overall != null && overall! <= lowRatingReasonsUpTo;
  final _comment = TextEditingController();
  ApiError? error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await context.read<MeetupsRepository>().feedback(widget.bookingId, overall: overall!, comfort: comfort!, venue: venue, again: again, comment: _comment.text,
          reasons: _low ? [for (final k in lowRatingReasons) if (reasons.contains(k)) k] : const []);
      if (mounted) setState(() => sent = true);
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _stars(String key, int? value, ValueChanged<int> onChanged) {
    final c = hzColors(context);
    return Row(children: [
      for (var i = 1; i <= 5; i++)
        Press(child: IconButton(
          key: Key('$key-$i'),
          tooltip: '$i/5',
          icon: Icon(value != null && i <= value ? Icons.star : Icons.star_border, color: c.primary),
          onPressed: () => onChanged(i),
        )),
    ]);
  }

  Widget _reasonChips(AppLocalizations t) {
    final c = hzColors(context);
    final label = {'table_fit': t.fbReasonTable, 'venue': t.fbReasonVenue, 'food_service': t.fbReasonFood, 'organisation': t.fbReasonOrg,
        'no_shows': t.fbReasonNoShows, 'other': t.reasonOther};
    return Wrap(spacing: HzSpace.s2, runSpacing: HzSpace.s2, children: [
      for (final k in lowRatingReasons)
        TestId('reason-$k', child: FilterChip(
          key: Key('reason-$k'),
          label: Text(label[k]!),
          selected: reasons.contains(k),
          showCheckmark: false,
          selectedColor: c.primary,
          backgroundColor: c.surfaceSunken,
          labelStyle: TextStyle(color: reasons.contains(k) ? c.onPrimary : c.text),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.pill), side: BorderSide(color: reasons.contains(k) ? c.primary : c.borderStrong)),
          onSelected: (on) => setState(() => on ? reasons.add(k) : reasons.remove(k)),
        )),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(t.rateIt)),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: sent
            ? [
                SoundOnShow(child: Text(t.fbThanks, key: const Key('fb-thanks'), style: tt.titleLarge)),
                const SizedBox(height: HzSpace.s6),
                Press(child: FilledButton(onPressed: () => context.go('/events'), child: Text(t.tabEvents))),
              ]
            : [
                Text(t.fbTitle, style: tt.headlineMedium),
                const SizedBox(height: HzSpace.s4),
                Text(t.overall, style: tt.titleMedium),
                // 3 stars or less: what fell short (optional); a higher rating hides and clears them
                _stars('overall', overall, (v) => setState(() {
                      overall = v;
                      if (!_low) reasons.clear();
                    })),
                if (_low) ...[
                  Text(t.fbReasonsLegend, key: const Key('reasons'), style: tt.titleMedium),
                  const SizedBox(height: HzSpace.s2),
                  _reasonChips(t),
                  const SizedBox(height: HzSpace.s3),
                ],
                Text(t.comfort, style: tt.titleMedium),
                _stars('comfort', comfort, (v) => setState(() => comfort = v)),
                Text(t.venueRating, style: tt.titleMedium),
                _stars('venue', venue, (v) => setState(() => venue = v)),
                SwitchListTile(key: const Key('again'), contentPadding: EdgeInsets.zero, value: again, onChanged: (v) {
                  Sounds.instance.play(v ? UiSound.toggleOn : UiSound.toggleOff);
                  setState(() => again = v);
                }, title: Text(t.wouldBookAgain)),
                TextField(key: const Key('comment'), controller: _comment, maxLength: 500, maxLines: 3, decoration: InputDecoration(labelText: t.commentLabel, helperText: t.commentHelp)),
                if (error != null) ...[const SizedBox(height: HzSpace.s3), ErrorBanner(error!)],
                const SizedBox(height: HzSpace.s4),
                Press(child: FilledButton(key: const Key('send-feedback'), onPressed: overall == null || comfort == null || busy ? null : _send, child: BusyLabel(busy: busy, child: Text(t.send)))),
              ]),
      ),
    );
  }
}
