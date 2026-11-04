import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(HzSpace.gutter),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton(key: const Key('lang'), onPressed: context.read<LocaleController>().toggle, child: Text(t.language)),
            ),
            const Spacer(),
            Text(t.brand, style: tt.titleLarge?.copyWith(color: c.primary)),
            const SizedBox(height: HzSpace.s3),
            Text(t.welcomeHero, style: tt.displaySmall),
            const SizedBox(height: HzSpace.s3),
            Text(t.welcomeSub, style: tt.bodyLarge),
            const Spacer(),
            FilledButton(key: const Key('start'), onPressed: () => context.go('/quiz'), child: Text(t.getStarted)),
            const SizedBox(height: HzSpace.s2),
            Text(t.quizLength, textAlign: TextAlign.center, style: tt.bodySmall),
            const SizedBox(height: HzSpace.s4),
            OutlinedButton(key: const Key('have-account'), onPressed: () => context.go('/sign-in'), child: Text(t.haveAccount)),
            const SizedBox(height: HzSpace.s3),
            Text(t.deviceNote, textAlign: TextAlign.center, style: tt.bodySmall?.copyWith(color: c.textMuted)),
          ]),
        ),
      ),
    );
  }
}
