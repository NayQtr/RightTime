import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../data/meetups_repository.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../common/loader.dart';
import '../format.dart';
import '../theme.dart';
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/press.dart';
import '../../core/sounds.dart';

/// Cancelling: the refund outcome is stated before she confirms (full refund, none after the deadline, or nothing paid).
class CancelScreen extends StatelessWidget {
  const CancelScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return Scaffold(
      appBar: AppBar(title: Text(t.cancelBooking)),
      body: SafeArea(
        child: Loader<DetailsResult>(
          key: ValueKey(lang),
          load: () => repo.eventDetails(bookingId),
          builder: (context, r, _) => _CancelForm(bookingId: bookingId, r: r),
        ),
      ),
    );
  }
}

class _CancelForm extends StatefulWidget {
  const _CancelForm({required this.bookingId, required this.r});
  final String bookingId;
  final DetailsResult r;

  @override
  State<_CancelForm> createState() => _CancelFormState();
}

class _CancelFormState extends State<_CancelForm> {
  String? reason;
  bool busy = false;
  ApiError? error;

  Future<void> _confirm() async {
    setState(() {
      busy = true;
      error = null;
    });
    final t = AppLocalizations.of(context);
    try {
      await context.read<MeetupsRepository>().cancel(widget.bookingId, reason);
      if (!mounted) return;
      Sounds.instance.play(UiSound.success);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.cancelled)));
      context.go('/events');
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final lang = context.watch<LocaleController>().code;
    final c = hzColors(context);
    final d = widget.r.details;
    final deadline = d.fullRefundUntil == null ? '' : fmtWhen(d.fullRefundUntil!, lang);
    final outcome = switch (d.refundIfCancelledNow) {
      'full' => t.refundFull(d.amountPaid ?? '', 10),
      null => t.refundNoPayment,
      _ => t.refundNone(deadline),
    };
    final full = d.refundIfCancelledNow == 'full' || d.refundIfCancelledNow == null;
    return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
      TestId('refund-outcome', child: Container(
        key: const Key('refund-outcome'),
        padding: EdgeInsets.all(HzSpace.s3 - (full ? 1 : 0)), // the hairline edge takes the pixel
        // same as the booking review: a full refund reads on the light surface with its hairline edge (60-30-10), a
        // partial one keeps the warning tint
        decoration: full
            ? BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(HzRadius.sm), border: Border.all(color: c.border))
            : BoxDecoration(color: c.warning.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(HzRadius.sm)),
        child: Text(outcome),
      )),
      // "+1": cancelling ends both seats, with one refund of the whole amount
      if (d.seatCount == 2) ...[
        const SizedBox(height: HzSpace.s3),
        Text(ltrPlusOne([d.guestName == null ? t.plusOne : t.plusOneGuest(d.guestName!), ?d.amountPaid].join(' · ')), key: const Key('plus-one-cancel'), style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: HzSpace.s1),
        Text(t.cancelBothSeats, key: const Key('cancel-both')),
      ],
      const SizedBox(height: HzSpace.s4),
      Text(t.reasonLegend, style: Theme.of(context).textTheme.titleMedium),
      RadioGroup<String>(
        groupValue: reason,
        onChanged: (v) => setState(() => reason = v),
        child: Column(children: [
          for (final (v, label) in [('schedule_changed', t.reasonSchedule), ('illness', t.reasonIllness), ('other', t.reasonOther)])
            TestId('reason-$v', child: RadioListTile<String>(key: Key('reason-$v'), contentPadding: EdgeInsets.zero, value: v, title: Text(label))),
        ]),
      ),
      if (error != null) ...[const SizedBox(height: HzSpace.s3), ErrorBanner(error!)],
      const SizedBox(height: HzSpace.s4),
      Press(child: FilledButton(
        key: const Key('confirm-cancel'),
        style: FilledButton.styleFrom(backgroundColor: c.danger, foregroundColor: c.onDanger),
        onPressed: !d.canCancel || busy || widget.r.offlineSavedAt != null ? null : _confirm,
        child: BusyLabel(busy: busy, child: Text(t.confirmCancel)),
      )),
    ]);
  }
}
