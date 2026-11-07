import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../core/link_opener.dart';
import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../format.dart';
import '../theme.dart';
import 'home_tab.dart' show experienceName;
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/press.dart';

/// Booking: hold the seat, review (fee, refund terms, and the no-refund acknowledgement close to the date), pay on the
/// payment provider's page in the browser, then come back: the app checks the booking and shows the result.
class BookScreen extends StatefulWidget {
  const BookScreen({super.key, required this.session});
  final SessionSummary session;

  @override
  State<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends State<BookScreen> with WidgetsBindingObserver {
  BookingStart? b;
  bool busy = false, ack = false, waiting = false;
  String occasion = 'none'; // celebration meetups: birthday | other | none
  ApiError? error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // back from the browser: check the booking at once
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && waiting) _refresh();
  }

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await f();
    } on ApiError catch (e) {
      error = e;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _hold() => _run(() async => b = await context.read<MeetupsRepository>().book(widget.session.id, occasion: occasion == 'none' ? null : occasion));

  Future<void> _pay() => _run(() async {
        final repo = context.read<MeetupsRepository>();
        final url = b!.checkoutUrl != null && !b!.ackRequired ? b!.checkoutUrl! : await repo.checkout(b!.id, acknowledgeLate: b!.ackRequired && ack);
        waiting = true;
        _poll?.cancel();
        _poll = Timer.periodic(const Duration(seconds: 4), (_) => _refresh());
        if (!mounted) return;
        await context.read<LinkOpener>().open(Uri.parse(url));
      });

  Future<void> _refresh() async {
    final id = b?.id;
    if (id == null) return;
    try {
      final now = await context.read<MeetupsRepository>().booking(id);
      if (!mounted) return;
      setState(() => b = now);
      if (now.paid || now.expired) {
        _poll?.cancel();
        waiting = false;
      }
    } on ApiError {
      // keep waiting; the next check tries again
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final lang = context.watch<LocaleController>().code;
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    final s = widget.session;
    final bk = b;
    final children = <Widget>[
      Text('${experienceName(t, s.experience)} · ${fmtWhen(s.startsAt, lang)}', style: tt.headlineMedium),
      const SizedBox(height: HzSpace.s1),
      Text('${s.district} · ${s.language == 'ar' ? t.langAr : t.langEn}'),
      const SizedBox(height: HzSpace.s4),
    ];
    if (bk == null) {
      children.addAll([
        Text(t.occasionLegend, style: tt.titleMedium),
        RadioGroup<String>(
          groupValue: occasion,
          onChanged: (v) => setState(() => occasion = v ?? 'none'),
          child: Column(children: [
            for (final (v, label) in [('birthday', t.occasionBirthday), ('other', t.occasionOther), ('none', t.occasionNo)])
              TestId('occasion-$v', child: RadioListTile<String>(key: Key('occasion-$v'), contentPadding: EdgeInsets.zero, value: v, title: Text(label),
                  secondary: v == 'birthday' ? const Icon(Icons.cake_outlined) : null)),
          ]),
        ),
        const SizedBox(height: HzSpace.s3),
        Press(child: FilledButton(key: const Key('hold'), onPressed: busy || s.isFull ? null : _hold, child: Text(t.bookSeat))),
      ]);
    } else if (bk.paid) {
      children.addAll([
        TestId('paid', child: Text(t.paidTitle, key: const Key('paid'), style: tt.titleLarge?.copyWith(color: c.success))),
        Text('${t.bookingRef} ${bk.ref}'),
        const SizedBox(height: HzSpace.s4),
        Press(child: FilledButton(onPressed: () => context.go('/events'), child: Text(t.viewDetails))),
      ]);
    } else if (bk.expired) {
      children.addAll([Text(t.holdExpired, key: const Key('expired')), const SizedBox(height: HzSpace.s4), Press(child: OutlinedButton(onPressed: () => context.go('/home'), child: Text(t.backHome)))]);
    } else {
      children.addAll([
        Text(t.reviewTitle, style: tt.titleLarge),
        ListTile(contentPadding: EdgeInsets.zero, title: Text(t.serviceFee), trailing: Text(bk.amount, key: const Key('amount'), style: const TextStyle(fontWeight: FontWeight.w700))),
        Text(t.foodNote, style: tt.bodySmall),
        const SizedBox(height: HzSpace.s3),
        if (bk.holdExpiresAt != null) Text(t.holdUntil(fmtTime(bk.holdExpiresAt!, lang)), style: tt.bodySmall),
        const SizedBox(height: HzSpace.s3),
        Container(
          padding: const EdgeInsets.all(HzSpace.s3),
          decoration: BoxDecoration(color: (bk.refundWindowOpen ? c.info : c.warning).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(HzRadius.sm)),
          child: Text(bk.refundWindowOpen && bk.fullRefundUntil != null ? t.policyBox(fmtWhen(bk.fullRefundUntil!, lang)) : t.lateWarning, key: const Key('terms')),
        ),
        if (bk.ackRequired)
          TestId('ack', child: CheckboxListTile(key: const Key('ack'), contentPadding: EdgeInsets.zero, value: ack, onChanged: (v) => setState(() => ack = v!), title: Text(t.lateAck))),
        if (bk.paymentFailed) Padding(padding: const EdgeInsets.only(top: HzSpace.s2), child: Text(t.payFailed, style: TextStyle(color: c.danger))),
        const SizedBox(height: HzSpace.s4),
        if (waiting) ...[TestId('waiting', child: Text(t.waitingPayment, key: const Key('waiting'))), const SizedBox(height: HzSpace.s3)],
        Press(child: FilledButton(key: const Key('pay'), onPressed: busy || (bk.ackRequired && !ack) ? null : _pay, child: BusyLabel(busy: busy, child: Text(t.payNow)))),
        if (waiting) Press(child: TextButton(key: const Key('check'), onPressed: _refresh, child: Text(t.checkPayment))),
      ]);
    }
    if (error != null) children.addAll([const SizedBox(height: HzSpace.s3), ErrorBanner(error!)]);
    return Scaffold(
      appBar: AppBar(title: Text(t.reviewTitle)),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: children)),
    );
  }
}
