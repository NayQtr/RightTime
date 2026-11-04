import 'package:flutter/material.dart';
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
import '../theme.dart';
import '../common/test_id.dart';

const _categories = ['harassment', 'threat_violence', 'photo_without_consent', 'stalking_unwanted_contact', 'fraud', 'disruptive'];

String categoryLabel(AppLocalizations t, String c) => switch (c) {
      'harassment' => t.cHarassment,
      'threat_violence' => t.cThreat,
      'photo_without_consent' => t.cPhoto,
      'stalking_unwanted_contact' => t.cStalking,
      'fraud' => t.cFraud,
      'identity_mismatch' => t.cIdentity,
      _ => t.cDisruptive,
    };

/// Private safety report. "I'm in danger right now" shows the 999 screen at once, before anything else.
class ReportScreen extends StatelessWidget {
  const ReportScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return Scaffold(
      appBar: AppBar(title: Text(t.privateReport)),
      body: SafeArea(
        child: Loader<DetailsResult>(
          key: ValueKey(lang),
          load: () => repo.eventDetails(bookingId),
          builder: (context, r, _) => _ReportForm(bookingId: bookingId, seats: r.details.seats),
        ),
      ),
    );
  }
}

class _ReportForm extends StatefulWidget {
  const _ReportForm({required this.bookingId, required this.seats});
  final String bookingId;
  final List<({String seat, String name})> seats;

  @override
  State<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<_ReportForm> {
  final _desc = TextEditingController();
  String? category, seat;
  String timing = 'during';
  bool danger = false, busy = false;
  ApiError? error;
  String? caseRef;

  @override
  void dispose() {
    _desc.dispose();
    super.dispose();
  }

  Future<void> _emergency() => showDialog<void>(
        context: context,
        builder: (context) {
          final t = AppLocalizations.of(context);
          final c = hzColors(context);
          return TestId('emergency', child: AlertDialog(
            key: const Key('emergency'),
            title: Text(t.emTitle),
            content: Text(t.emBody),
            actions: [
              TestId('call-999', child: FilledButton.icon(
                key: const Key('call-999'),
                style: FilledButton.styleFrom(backgroundColor: c.danger, foregroundColor: c.onDanger),
                icon: const Icon(Icons.call),
                label: Text(t.emCall),
                onPressed: () => context.read<LinkOpener>().open(Uri.parse('tel:999')),
              )),
              TextButton(onPressed: () => Navigator.pop(context), child: Text(t.close)),
            ],
          ));
        },
      );

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final ref = await context.read<MeetupsRepository>().report(
            bookingId: widget.bookingId, category: category!, timing: timing, danger: danger, seat: seat, description: _desc.text);
      if (mounted) setState(() => caseRef = ref);
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final tt = Theme.of(context).textTheme;
    if (caseRef != null) {
      return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
        TestId('report-sent', child: Text(t.reportSent(caseRef!), key: const Key('report-sent'), style: tt.titleLarge)),
        const SizedBox(height: HzSpace.s6),
        FilledButton(onPressed: () => context.go('/home'), child: Text(t.backHome)),
      ]);
    }
    return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
      Text(t.reportIntro),
      TestId('danger', child: CheckboxListTile(
        key: const Key('danger'),
        contentPadding: EdgeInsets.zero,
        value: danger,
        title: Text(t.dangerLabel, style: TextStyle(color: hzColors(context).danger, fontWeight: FontWeight.w700)),
        onChanged: (v) {
          setState(() => danger = v!);
          if (v!) _emergency();
        },
      )),
      const Divider(),
      Text(t.category, style: tt.titleMedium),
      RadioGroup<String>(
        groupValue: category,
        onChanged: (v) => setState(() => category = v),
        child: Column(children: [
          for (final cat in _categories) RadioListTile<String>(key: Key('cat-$cat'), contentPadding: EdgeInsets.zero, value: cat, title: Text(categoryLabel(t, cat))),
        ]),
      ),
      Text(t.whenLegend, style: tt.titleMedium),
      RadioGroup<String>(
        groupValue: timing,
        onChanged: (v) => setState(() => timing = v!),
        child: Column(children: [
          RadioListTile<String>(contentPadding: EdgeInsets.zero, value: 'during', title: Text(t.during)),
          RadioListTile<String>(key: const Key('timing-after'), contentPadding: EdgeInsets.zero, value: 'after', title: Text(t.afterEv)),
        ]),
      ),
      if (widget.seats.isNotEmpty) ...[
        Text(t.whoLegend, style: tt.titleMedium),
        RadioGroup<String?>(
          groupValue: seat,
          onChanged: (v) => setState(() => seat = v),
          child: Column(children: [
            RadioListTile<String?>(contentPadding: EdgeInsets.zero, value: null, title: Text(t.notSure)),
            for (final s in widget.seats)
              RadioListTile<String?>(key: Key('who-${s.seat}'), contentPadding: EdgeInsets.zero, value: s.seat, title: Text(s.name.isEmpty ? t.unnamed : s.name)),
          ]),
        ),
      ],
      const SizedBox(height: HzSpace.s3),
      TextField(key: const Key('desc'), controller: _desc, maxLines: 4, maxLength: 2000, decoration: InputDecoration(labelText: t.describe)),
      if (error != null) ...[const SizedBox(height: HzSpace.s3), ErrorBanner(error!)],
      const SizedBox(height: HzSpace.s4),
      FilledButton(key: const Key('send-report'), onPressed: category == null || busy ? null : _submit, child: Text(t.submitReport)),
    ]);
  }
}
