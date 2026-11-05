import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/link_opener.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/update_gate.dart';
import '../../l10n/app_localizations.dart';
import 'test_id.dart';

/// Shown instead of the whole app when the server requires a newer version (NMX-61). The only action is the store.
class UpdateScreen extends StatelessWidget {
  const UpdateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final gate = context.watch<UpdateGate>();
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(HzSpace.gutter),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Icon(Icons.system_update_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: HzSpace.s4),
            Text(t.updateTitle, style: tt.headlineMedium, textAlign: TextAlign.center),
            const SizedBox(height: HzSpace.s3),
            Text(gate.message.isNotEmpty ? gate.message : t.updateBody, textAlign: TextAlign.center),
            const SizedBox(height: HzSpace.s6),
            if (gate.storeUrl != null)
              TestId('update', child: FilledButton(
                key: const Key('update'),
                onPressed: () => context.read<LinkOpener>().open(Uri.parse(gate.storeUrl!)),
                child: Text(t.updateButton),
              )),
          ]),
        ),
      ),
    );
  }
}
