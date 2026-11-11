import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../data/countries.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import 'sign_in_view_model.dart';
import 'widgets.dart';
import '../../core/sounds.dart';
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/press.dart';

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _phone = TextEditingController();

  /// The country the number belongs to. Qatar to begin with (owner's decision, 11 Nov 2026: every country except
  /// Israel, which is not in the list at all).
  Country _country = countryByIso(kDefaultCountry);

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit(SignInViewModel vm) async {
    if (await vm.sendCode(_phone.text, dial: _country.dial) && mounted) context.go('/sign-in/code');
  }

  Future<void> _pickCountry() async {
    Sounds.instance.play(UiSound.sheetOpen);
    final chosen = await showModalBottomSheet<Country>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _CountrySheet(selected: _country),
    );
    Sounds.instance.play(UiSound.sheetClose);
    if (chosen != null && mounted) setState(() => _country = chosen);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final vm = context.watch<SignInViewModel>();
    final lang = Localizations.localeOf(context).languageCode;
    final qatar = _country.dial == '974';
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
            // The calling code is its own box and opens the country list; the number goes in the box beside it. Left to
            // right in both languages, as a phone number is read.
            Ltr(Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(height: 56, child: IntrinsicWidth(child: TestId('country', child: Press(child: OutlinedButton(
                key: const Key('country'),
                onPressed: _pickCountry,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Semantics(label: '${t.countryLabel}: ${_country.name(lang)}', child: Text('+${_country.dial}')),
                  const Icon(Icons.arrow_drop_down, size: 20),
                ]),
              ))))),
              const SizedBox(width: HzSpace.s2),
              Expanded(child: TestId('phone', child: TextField(
                key: const Key('phone'),
                controller: _phone,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumberNational],
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9 ]')), LengthLimitingTextInputFormatter(qatar ? 9 : 17)],
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _submit(vm),
                decoration: InputDecoration(
                  labelText: t.phoneLabel,
                  // Qatar keeps its 8-digit rule; for any other country the server has the last word.
                  errorText: vm.phoneInvalid ? (qatar ? t.phoneInvalid : t.csPhoneBad) : null,
                ),
              ))),
            ])),
            if (vm.error != null) ...[const SizedBox(height: HzSpace.s4), ErrorBanner(vm.error!)],
            const SizedBox(height: HzSpace.s6),
            Press(child: FilledButton(
              key: const Key('send'),
              onPressed: vm.busy ? null : () => _submit(vm),
              child: BusyLabel(busy: vm.busy, child: Text(t.sendCode)),
            )),
          ],
        ),
      ),
    );
  }
}

/// Every country we accept, as one plain list. Qatar is the default (owner, 11 Nov).
class _CountrySheet extends StatelessWidget {
  const _CountrySheet({required this.selected});

  final Country selected;

  @override
  Widget build(BuildContext context) {
    final lang = Localizations.localeOf(context).languageCode;
    final all = [...kCountries]..sort((a, b) => a.name(lang).compareTo(b.name(lang)));
    // One plain list, Qatar selected by default (owner, 11 Nov): no label, no search field.
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.8,
      child: ListView.builder(
        itemCount: all.length,
        itemBuilder: (context, i) => ListTile(
          key: Key('country-${all[i].iso}'),
          selected: all[i].iso == selected.iso,
          title: Text(all[i].name(lang)),
          trailing: Ltr(Text('+${all[i].dial}')),
          onTap: () => Navigator.of(context).pop(all[i]),
        ),
      ),
    );
  }
}
