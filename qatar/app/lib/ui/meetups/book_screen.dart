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
import 'fee_info_screen.dart';
import 'home_tab.dart' show experienceName;
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/press.dart';
import '../common/sound_on_show.dart';

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

  /// "+1" (owner, 14 Nov): she may bring one companion. The seat is held before the review, so the choice sits here,
  /// before the hold: the booking is created with her companion's name, and the review then shows the two seats.
  bool plusOne = false, guestOk = false, seatsRefused = false;
  final _guest = TextEditingController();
  bool get _plusOneOpen => widget.session.plusOneAvailable && !seatsRefused;
  bool get _guestReady => _guest.text.trim().isNotEmpty && guestOk;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    _poll?.cancel();
    _guest.dispose();
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

  /// Item 32 (provisional): a celebration needs notice; the server says so per session, or refuses a late one.
  bool tooLate = false;
  bool get _occasionOpen => widget.session.occasionAllowed && !tooLate;

  Future<void> _hold() => _run(() async {
        try {
          b = await context.read<MeetupsRepository>().book(widget.session.id, occasion: !_occasionOpen || occasion == 'none' ? null : occasion,
              guestName: plusOne && _plusOneOpen ? _guest.text.trim() : null);
        } on ApiError catch (e) {
          // the second seat went while she chose: +1 turns off with the line that says so, and she can book alone
          if (e.status == 409 && (e.code == 'NOT_ENOUGH_SEATS' || e.details.any((d) => d['code'] == 'NOT_ENOUGH_SEATS'))) {
            seatsRefused = true;
            plusOne = false;
            return;
          }
          // the date came closer while she chose: the question goes away with the note, and she can book without it
          if (!e.details.any((d) => d['field'] == 'occasion' && d['code'] == 'NOTICE_TOO_SHORT')) rethrow;
          tooLate = true;
          occasion = 'none';
        }
      });

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
    // the review has one heading, "Review your booking", at the top of the page as on the website; the app bar then
    // carries no title of its own
    final review = bk != null && !bk.paid && !bk.expired;
    // a refused request is said just above the button it came from, and read out when it appears
    final failed = [if (error != null) ...[ErrorBanner(error!, key: const Key('book-error')), const SizedBox(height: HzSpace.s3)]];
    // a disabled button says what is still missing, under it and to a screen reader on the button itself
    Widget reason(String? why, String id) => why == null
        ? const SizedBox.shrink()
        : Padding(padding: const EdgeInsets.only(top: HzSpace.s2), child: Text(why, key: Key(id), style: tt.bodySmall?.copyWith(color: c.textMuted)));
    final children = <Widget>[
      // where she is in booking: the date she chose, the review, then paying (as on the website)
      if (bk == null || review) ...[_BookSteps(current: bk == null ? 0 : waiting ? 2 : 1), const SizedBox(height: HzSpace.s4)],
      if (review) ...[Semantics(header: true, child: Text(t.reviewTitle, key: const Key('review-title'), style: tt.headlineMedium)), const SizedBox(height: HzSpace.s1)],
      Text('${experienceName(t, s.experience)} · ${fmtWhen(s.startsAt, lang)}', style: review ? tt.titleMedium : tt.headlineMedium),
      const SizedBox(height: HzSpace.s1),
      Text('${s.district} · ${s.language == 'ar' ? t.langAr : t.langEn}'),
      const SizedBox(height: HzSpace.s4),
    ];
    final twoSeats = plusOne && _plusOneOpen;
    final holdWhy = busy || !(plusOne && _plusOneOpen) ? null : _guest.text.trim().isEmpty ? t.needGuestName : !guestOk ? t.needGuestConfirm : null;
    if (bk == null) {
      children.addAll([
        if (_occasionOpen) ...[
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
        ] else
          TestId('occasion-notice', child: Text(t.occasionNotice((s.occasionNoticeHours / 24).ceil()), key: const Key('occasion-notice'),
              style: tt.bodySmall?.copyWith(color: c.textMuted))),
        const SizedBox(height: HzSpace.s3),
        _PlusOneToggle(on: plusOne, onTap: _plusOneOpen && !busy ? () => setState(() => plusOne = !plusOne) : null),
        if (!_plusOneOpen)
          Padding(
            padding: const EdgeInsets.only(top: HzSpace.s2),
            // read out when it appears because the server refused the second seat
            child: Semantics(liveRegion: seatsRefused, child: Text(t.plusOneUnavailable, key: const Key('plus-one-unavailable'), style: tt.bodySmall?.copyWith(color: c.textMuted))),
          ),
        if (plusOne && _plusOneOpen) ...[
          const SizedBox(height: HzSpace.s3),
          Text(t.plusOneExplain, key: const Key('plus-one-explain')),
          const SizedBox(height: HzSpace.s3),
          TextField(
            key: const Key('guest-name'),
            controller: _guest,
            maxLength: 60,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(labelText: t.guestNameLabel),
            onChanged: (_) => setState(() {}),
          ),
          TestId('guest-confirm', child: CheckboxListTile(key: const Key('guest-confirm'), contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading,
              value: guestOk, onChanged: (v) => setState(() => guestOk = v!), title: Text(t.guestConfirm))),
        ],
      ]);
    } else if (bk.paid) {
      children.addAll([
        SoundOnShow(child: TestId('paid', child: Text(t.paidTitle, key: const Key('paid'), style: tt.titleLarge?.copyWith(color: c.success)))),
        Text('${t.bookingRef} ${bk.ref}'),
        const SizedBox(height: HzSpace.s4),
        Press(child: FilledButton(onPressed: () => context.go('/events'), child: Text(t.viewDetails))),
      ]);
    } else if (bk.expired) {
      children.addAll([Text(t.holdExpired, key: const Key('expired')), const SizedBox(height: HzSpace.s4), Press(child: OutlinedButton(onPressed: () => context.go('/home'), child: Text(t.backHome)))]);
    } else {
      final ordinary = bk.refundWindowOpen && bk.fullRefundUntil != null;
      final terms = Container(
        padding: const EdgeInsets.all(HzSpace.s3),
        // The ordinary refund note sits on the sunken surface, as the same note does on the website; only the late
        // warning is tinted. "info" is a steel blue and washed out grey over the warm background of identity v0.5.
        decoration: BoxDecoration(color: bk.refundWindowOpen ? c.surfaceSunken : c.warning.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(HzRadius.sm)),
        child: Text(ordinary ? t.refundLine(fmtWhen(bk.fullRefundUntil!, lang)) : t.lateWarning, key: const Key('terms')),
      );
      final payWhy = !busy && bk.ackRequired && !ack ? t.needLateAck : null;
      children.addAll([
        // Item 41 (owner, 11 Nov): during the launch period the amount stays visible, struck through, beside the
        // owner's words, and a line explains that it is taken and refunded. Nothing about money is said before this step.
        // Read as a receipt before paying (owner, 14 Nov: rounds 1-3): what it is, the amount large, and the same
        // amount on the button; the ordinary refund note follows the button directly.
        const SizedBox(height: HzSpace.s3),
        // the fee line opens what the fee covers and the common questions (owner, 14 Nov)
        Semantics(
          button: true,
          hint: t.feeInfoTitle,
          child: InkWell(
            key: const Key('fee-info'),
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const FeeInfoScreen())),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: HzSpace.touchTarget),
              child: Row(children: [
                Flexible(child: Text(bk.seats == 2 ? t.feeTimesTwo : t.serviceFee, key: const Key('fee-line'), style: tt.bodySmall?.copyWith(color: c.textMuted))),
                const SizedBox(width: HzSpace.s1),
                Icon(Icons.info_outline, size: 16, color: c.textMuted),
              ]),
            ),
          ),
        ),
        if (bk.launchFree)
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: HzSpace.s2, children: [
            Text(bk.amount, key: const Key('amount'), style: tt.headlineMedium?.copyWith(color: c.textMuted, decoration: TextDecoration.lineThrough)),
            Text(t.feeLaunchFree, style: TextStyle(fontWeight: FontWeight.w700, color: c.primary)),
          ])
        else
          Text(bk.amount, key: const Key('amount'), style: tt.headlineMedium),
        // "+1": two seats, with her companion's name; the amount above and on the button is the total for both
        if (bk.seats == 2) ...[
          const SizedBox(height: HzSpace.s1),
          Text(ltrPlusOne([t.twoSeats, bk.guestName == null ? t.plusOne : t.plusOneGuest(bk.guestName!)].join(' · ')), key: const Key('seats')),
        ],
        Divider(height: HzSpace.s6, thickness: 1, color: c.border),
        if (bk.launchFree) Text(t.feeLaunchNote, key: const Key('launch-note'), style: tt.bodySmall?.copyWith(color: c.textMuted)),
        Text(t.foodNote, style: tt.bodySmall),
        const SizedBox(height: HzSpace.s3),
        if (bk.holdExpiresAt != null) Text(t.holdUntil(fmtTime(bk.holdExpiresAt!, lang)), style: tt.bodySmall),
        const SizedBox(height: HzSpace.s3),
        // the late warning and its acknowledgement come before the button; the ordinary note comes right after it
        if (!ordinary) terms,
        if (bk.ackRequired)
          TestId('ack', child: CheckboxListTile(key: const Key('ack'), contentPadding: EdgeInsets.zero, value: ack, onChanged: (v) => setState(() => ack = v!), title: Text(t.lateAck))),
        if (bk.paymentFailed) Padding(padding: const EdgeInsets.only(top: HzSpace.s2), child: Text(t.payFailed, style: TextStyle(color: c.danger))),
        const SizedBox(height: HzSpace.s4),
        if (waiting) ...[TestId('waiting', child: Text(t.waitingPayment, key: const Key('waiting'))), const SizedBox(height: HzSpace.s3)],
        ...failed,
        Press(child: FilledButton(key: const Key('pay'), onPressed: busy || (bk.ackRequired && !ack) ? null : _pay,
            child: Semantics(hint: payWhy, child: BusyLabel(busy: busy, child: Text(bk.launchFree || bk.amount.isEmpty ? t.payNow : t.payAmount(bk.amount)))))),
        reason(payWhy, 'pay-reason'),
        if (ordinary) ...[const SizedBox(height: HzSpace.s3), terms],
        if (waiting) Press(child: TextButton(key: const Key('check'), onPressed: _refresh, child: Text(t.checkPayment))),
      ]);
    }
    // before the seat is held, a bar stays at the bottom with her pick and the button; the button names what it does
    // and, while it waits, says why under it
    final bar = bk != null
        ? null
        : Material(
            key: const Key('pick-bar'),
            color: c.surface,
            shape: Border(top: BorderSide(color: c.border)),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(HzSpace.gutter, HzSpace.s3, HzSpace.gutter, HzSpace.s3),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(t.yourPick, style: tt.labelSmall?.copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
                  Text(ltrPlusOne([experienceName(t, s.experience), fmtWhen(s.startsAt, lang), if (twoSeats) t.plusOne].join(' · ')),
                      key: const Key('pick-summary'), maxLines: 2, overflow: TextOverflow.ellipsis, style: tt.titleSmall),
                  const SizedBox(height: HzSpace.s2),
                  ...failed,
                  // with +1 on, the seat is held only once her companion is named and confirmed
                  Press(child: FilledButton(key: const Key('hold'), onPressed: busy || s.isFull || (twoSeats && !_guestReady) ? null : _hold,
                      child: Semantics(hint: holdWhy, child: Text(twoSeats ? t.bookTwoSeats : t.bookSeat)))),
                  reason(holdWhy, 'hold-reason'),
                ]),
              ),
            ),
          );
    return Scaffold(
      appBar: AppBar(title: review ? null : Text(t.reviewTitle)),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: children)),
      bottomNavigationBar: bar,
    );
  }
}

/// The three steps of booking: the date, the review, then paying. Done steps carry a tick and the current one is bold in
/// the brand colour (not colour alone); a screen reader hears the current step and its place ("Review, step 2 of 3").
class _BookSteps extends StatelessWidget {
  const _BookSteps({required this.current});
  final int current;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final steps = [t.bookStepDate, t.bookStepReview, t.bookStepPay];
    return Row(key: const Key('book-steps'), crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (var i = 0; i < steps.length; i++)
        Expanded(
          child: Semantics(
            selected: i == current,
            label: i == current ? '${steps[i]}، ${t.bookStepOf(i + 1, steps.length)}' : steps[i],
            excludeSemantics: true,
            child: Column(key: Key('book-step-$i'), children: [
              Container(height: 4, margin: const EdgeInsets.symmetric(horizontal: 2), color: i <= current ? c.primary : c.border),
              const SizedBox(height: HzSpace.s1),
              Text.rich(
                TextSpan(children: [
                  if (i < current) ...[
                    WidgetSpan(alignment: PlaceholderAlignment.middle, child: Icon(Icons.check_rounded, size: 14, color: c.primary)),
                    const TextSpan(text: ' '),
                  ],
                  TextSpan(text: steps[i]),
                ]),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, fontWeight: i == current ? FontWeight.w700 : FontWeight.w400,
                    color: i == current ? c.primary : i < current ? c.text : c.textMuted),
              ),
            ]),
          ),
        ),
    ]);
  }
}

/// The "+1" control: off by default; on, it takes the brand edge and a tick. A session that cannot seat two leaves it
/// faded and untappable. A screen reader hears a button and whether it is chosen.
class _PlusOneToggle extends StatelessWidget {
  const _PlusOneToggle({required this.on, required this.onTap});
  final bool on;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      selected: on,
      child: TestId('plus-one', child: Press(dim: true, child: InkWell(
        key: const Key('plus-one'),
        borderRadius: BorderRadius.circular(HzRadius.md),
        onTap: onTap,
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: AnimatedContainer(
            duration: MediaQuery.of(context).disableAnimations ? Duration.zero : HzMotion.base,
            curve: HzMotion.easing,
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: HzSpace.s4),
            decoration: BoxDecoration(
              color: c.primarySubtle,
              borderRadius: BorderRadius.circular(HzRadius.md),
              border: Border.all(color: on ? c.primary : c.primarySubtle, width: 2),
            ),
            child: Row(children: [
              Expanded(child: Text(ltrPlusOne(t.plusOne), style: Theme.of(context).textTheme.titleLarge)),
              Icon(on ? Icons.check_circle : Icons.add_circle_outline, color: on ? c.primary : c.textMuted),
            ]),
          ),
        ),
      ))),
    );
  }
}
