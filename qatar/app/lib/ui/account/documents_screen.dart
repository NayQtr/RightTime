import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/onboarding.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../common/loader.dart';

/// Terms, code of conduct and privacy notice, always reachable from Account (App Store 5.1.1(i): the privacy policy is
/// available inside the app). The texts are the current published versions from the server, in the app's language.
class DocumentsScreen extends StatelessWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final lang = context.watch<LocaleController>().code;
    final repo = context.read<OnboardingRepository>();
    String title(String type) => switch (type) { 'terms' => t.docTerms, 'conduct' => t.docConduct, _ => t.docPrivacy };
    return Scaffold(
      appBar: AppBar(title: Text(t.docsTitle)),
      body: SafeArea(
        child: Loader<List<LegalDoc>>(
          key: ValueKey(lang),
          load: repo.legal,
          builder: (context, docs, _) => ListView(padding: const EdgeInsets.symmetric(vertical: HzSpace.s2), children: [
            for (final d in docs.where((d) => d.type != 'marketing'))
              ListTile(
                key: Key('open-${d.type}'),
                title: Text(title(d.type)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => Scaffold(
                    appBar: AppBar(title: Text(title(d.type))),
                    body: SafeArea(
                      child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [SelectableText(d.text, key: Key('doc-${d.type}'))]),
                    ),
                  ),
                )),
              ),
          ]),
        ),
      ),
    );
  }
}
