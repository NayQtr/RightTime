import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../data/meetups_repository.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../theme.dart';

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
      await context.read<MeetupsRepository>().feedback(widget.bookingId, overall: overall!, comfort: comfort!, venue: venue, again: again, comment: _comment.text);
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
        IconButton(
          key: Key('$key-$i'),
          tooltip: '$i/5',
          icon: Icon(value != null && i <= value ? Icons.star : Icons.star_border, color: c.primary),
          onPressed: () => onChanged(i),
        ),
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
                Text(t.fbThanks, key: const Key('fb-thanks'), style: tt.titleLarge),
                const SizedBox(height: HzSpace.s6),
                FilledButton(onPressed: () => context.go('/events'), child: Text(t.tabEvents)),
              ]
            : [
                Text(t.fbTitle, style: tt.headlineMedium),
                const SizedBox(height: HzSpace.s4),
                Text(t.overall, style: tt.titleMedium),
                _stars('overall', overall, (v) => setState(() => overall = v)),
                Text(t.comfort, style: tt.titleMedium),
                _stars('comfort', comfort, (v) => setState(() => comfort = v)),
                Text(t.venueRating, style: tt.titleMedium),
                _stars('venue', venue, (v) => setState(() => venue = v)),
                SwitchListTile(key: const Key('again'), contentPadding: EdgeInsets.zero, value: again, onChanged: (v) => setState(() => again = v), title: Text(t.wouldBookAgain)),
                TextField(key: const Key('comment'), controller: _comment, maxLength: 500, maxLines: 3, decoration: InputDecoration(labelText: t.commentLabel, helperText: t.commentHelp)),
                if (error != null) ...[const SizedBox(height: HzSpace.s3), ErrorBanner(error!)],
                const SizedBox(height: HzSpace.s4),
                FilledButton(key: const Key('send-feedback'), onPressed: overall == null || comfort == null || busy ? null : _send, child: Text(t.send)),
              ]),
      ),
    );
  }
}
