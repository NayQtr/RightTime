import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';
import 'sign_in_view_model.dart';
import 'widgets.dart';
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/press.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _code = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _code.addListener(() => setState(() {}));
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final vm = context.watch<SignInViewModel>();
    final c = vm.challenge;
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(HzSpace.gutter),
          children: [
            Text(t.otpTitle, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: HzSpace.s2),
            Wrap(spacing: 6, children: [Text(t.otpHelp), if (c != null) Ltr(Text(c.phoneDisplay, style: const TextStyle(fontWeight: FontWeight.w600)))]),
            if (c?.devCode != null) ...[
              const SizedBox(height: HzSpace.s3),
              Wrap(spacing: 6, children: [Text(t.devCode), Ltr(TestId('devCode', child: Text(c!.devCode!, key: const Key('devCode'), style: const TextStyle(fontWeight: FontWeight.w700))))]),
            ],
            const SizedBox(height: HzSpace.s6),
            Text(t.otpLabel, style: const TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: HzSpace.s2),
            // The code in six boxes, left to right as the SMS reads (identity step, 13 Nov 2026): one real field lies over
            // them, so typing, paste and the phone's SMS autofill fill all six; the next box to fill carries the focus look.
            Ltr(SizedBox(height: 56, child: Stack(children: [
              ExcludeSemantics(child: IgnorePointer(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (var i = 0; i < 6; i++) ...[
                  if (i > 0) const SizedBox(width: HzSpace.s2),
                  _CodeBox(
                    key: Key('code-box-$i'),
                    digit: i < _code.text.length ? _code.text[i] : '',
                    next: _focus.hasFocus && i == (_code.text.length < 6 ? _code.text.length : 5),
                    error: vm.error != null,
                  ),
                ],
              ]))),
              Positioned.fill(child: Opacity(opacity: 0, child: TestId('code', child: Semantics(
                label: t.otpLabel,
                child: TextField(
                  key: const Key('code'),
                  controller: _code,
                  focusNode: _focus,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                  showCursor: false,
                  enableInteractiveSelection: false,
                  decoration: const InputDecoration(border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, filled: false, counterText: ''),
                  onChanged: (v) {
                    if (v.length == 6 && !vm.busy) vm.verify(v);
                  },
                ),
              )))),
            ]))),
            if (vm.error != null) ...[const SizedBox(height: HzSpace.s4), ErrorBanner(vm.error!)],
            const SizedBox(height: HzSpace.s6),
            Press(child: FilledButton(key: const Key('verify'), onPressed: vm.busy ? null : () => vm.verify(_code.text), child: BusyLabel(busy: vm.busy, child: Text(t.verify)))),
            const SizedBox(height: HzSpace.s3),
            Press(child: OutlinedButton(
              key: const Key('resend'),
              onPressed: vm.busy || vm.resendIn > 0 ? null : vm.resend,
              child: Text(vm.resendIn > 0 ? t.resendIn(vm.resendIn) : t.resend),
            )),
          ],
        ),
      ),
    );
  }
}

/// One box of the sign-in code: the digit, or the focus look when it is the next to fill, or red after a wrong code.
class _CodeBox extends StatelessWidget {
  const _CodeBox({super.key, required this.digit, required this.next, required this.error});

  final String digit;
  final bool next;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return AnimatedContainer(
      duration: MediaQuery.of(context).disableAnimations ? Duration.zero : HzMotion.fast,
      width: 46,
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(HzRadius.sm),
        border: Border.all(color: error ? c.danger : (next ? c.text : c.borderStrong), width: error || next ? 2 : 1.5),
        boxShadow: next && !error ? [BoxShadow(color: c.primary.withValues(alpha: 0.2), spreadRadius: 4)] : null,
      ),
      child: Text(digit, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: c.text, fontFeatures: const [FontFeature.tabularFigures()])),
    );
  }
}
