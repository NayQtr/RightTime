import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import 'sign_in_view_model.dart';
import 'widgets.dart';
import '../common/test_id.dart';

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _phone = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit(SignInViewModel vm) async {
    if (await vm.sendCode(_phone.text) && mounted) context.go('/sign-in/code');
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final vm = context.watch<SignInViewModel>();
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(HzSpace.gutter),
          children: [
            Text(t.phoneTitle, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: HzSpace.s2),
            Text(t.phoneHelp),
            const SizedBox(height: HzSpace.s6),
            Ltr(TestId('phone', child: TextField(
              key: const Key('phone'),
              controller: _phone,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumberNational],
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9 ]')), LengthLimitingTextInputFormatter(9)],
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _submit(vm),
              decoration: InputDecoration(
                labelText: t.phoneLabel,
                prefixText: '+974 ',
                errorText: vm.phoneInvalid ? t.phoneInvalid : null,
              ),
            ))),
            if (vm.error != null) ...[const SizedBox(height: HzSpace.s4), ErrorBanner(vm.error!)],
            const SizedBox(height: HzSpace.s6),
            FilledButton(
              key: const Key('send'),
              onPressed: vm.busy ? null : () => _submit(vm),
              child: Text(t.sendCode),
            ),
          ],
        ),
      ),
    );
  }
}
