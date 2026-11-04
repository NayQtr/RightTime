import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import 'sign_in_view_model.dart';
import 'widgets.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
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
              Wrap(spacing: 6, children: [Text(t.devCode), Ltr(Text(c!.devCode!, key: const Key('devCode'), style: const TextStyle(fontWeight: FontWeight.w700)))]),
            ],
            const SizedBox(height: HzSpace.s6),
            Ltr(TextField(
              key: const Key('code'),
              controller: _code,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(letterSpacing: 8),
              decoration: InputDecoration(labelText: t.otpLabel),
              onChanged: (v) {
                if (v.length == 6 && !vm.busy) vm.verify(v);
              },
            )),
            if (vm.error != null) ...[const SizedBox(height: HzSpace.s4), ErrorBanner(vm.error!)],
            const SizedBox(height: HzSpace.s6),
            FilledButton(key: const Key('verify'), onPressed: vm.busy ? null : () => vm.verify(_code.text), child: Text(t.verify)),
            const SizedBox(height: HzSpace.s3),
            OutlinedButton(
              key: const Key('resend'),
              onPressed: vm.busy || vm.resendIn > 0 ? null : vm.resend,
              child: Text(vm.resendIn > 0 ? t.resendIn(vm.resendIn) : t.resend),
            ),
          ],
        ),
      ),
    );
  }
}
