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
          icon: Icon(value != null && i <= value ? Icons.star : Icons.star_border, color: c.text), // filled or outlined, in ink (60-30-10)
          onPressed: () => onChanged(i),
        )),
    ]);
  }

  /// What she chose, to follow a row's title: ": 4 of 5", or just " 4 of 5" after a title that is a question.
  String _echo(AppLocalizations t, String title, int value) => '${title.endsWith('؟') || title.endsWith('?') ? '' : ':'} ${t.qOf(value, 5)}';

  /// A row's title, then what she chose beside it in a quieter colour ("Overall rating: 4 of 5").
  Widget _title(String key, String title, int? value) {
    final t = AppLocalizations.of(context);
    final tt = Theme.of(context).textTheme;
    return Wrap(children: [
      Text(title, style: tt.titleMedium),
      if (value != null) Text(_echo(t, title, value), key: Key('$key-echo'), style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w400, color: hzColors(context).textMuted)),
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
          // chosen: an ink ring and a tick on the light surface (60-30-10)
          showCheckmark: true,
          checkmarkColor: c.text,
          selectedColor: c.surface,
          backgroundColor: c.surface,
          labelStyle: TextStyle(color: c.text, fontWeight: reasons.contains(k) ? FontWeight.w600 : null),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.pill),
              side: BorderSide(color: reasons.contains(k) ? c.text : c.borderStrong, width: reasons.contains(k) ? 2 : 1)),
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
                const SizedBox(height: HzSpace.s4),
                // what she sent, read back once (owner, 14 Nov: rounds 1-3)
                Container(
                  key: const Key('fb-summary'),
                  padding: const EdgeInsets.all(HzSpace.s4),
                  decoration: BoxDecoration(color: hzColors(context).surface, borderRadius: BorderRadius.circular(HzRadius.md), border: Border.all(color: hzColors(context).border)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    for (final (label, value) in [(t.overall, overall), (t.comfort, comfort), (t.venueRating, venue)])
                      if (value != null) Text('$label${_echo(t, label, value)}'),
                  ]),
                ),
                const SizedBox(height: HzSpace.s6),
                Press(child: FilledButton(onPressed: () => context.go('/events'), child: Text(t.tabEvents))),
              ]
            : [
                Text(t.fbTitle, style: tt.headlineMedium),
                const SizedBox(height: HzSpace.s4),
                _title('overall', t.overall, overall),
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
                _title('comfort', t.comfort, comfort),
                _stars('comfort', comfort, (v) => setState(() => comfort = v)),
                _title('venue', t.venueRating, venue),
                _stars('venue', venue, (v) => setState(() => venue = v)),
                SwitchListTile(key: const Key('again'), contentPadding: EdgeInsets.zero, value: again, onChanged: (v) {
                  Sounds.instance.play(v ? UiSound.toggleOn : UiSound.toggleOff);
                  setState(() => again = v);
                }, title: Text(t.wouldBookAgain)),
                TextField(key: const Key('comment'), controller: _comment, maxLength: 500, maxLines: 3, decoration: InputDecoration(labelText: t.commentLabel, helperText: t.commentHelp)),
                if (error != null) ...[const SizedBox(height: HzSpace.s3), ErrorBanner(error!)],
                const SizedBox(height: HzSpace.s4),
                Press(child: FilledButton(key: const Key('send-feedback'), onPressed: overall == null || comfort == null || busy ? null : _send, child: BusyLabel(busy: busy, child: Text(t.sendRating)))),
              ]),
      ),
    );
  }
}
