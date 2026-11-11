import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../common/table_art.dart';
import '../theme.dart';
import '../common/press.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    // the last words of the headline in the brand colour, as on herzone.app ("تعرّفي على ناس.. تفهمك")
    final hero = t.welcomeHero;
    final em = t.welcomeHeroEm;
    final at = hero.lastIndexOf(em);
    final heroText = at < 0
        ? Text(hero, style: tt.displaySmall)
        : Text.rich(TextSpan(style: tt.displaySmall, children: [
            TextSpan(text: hero.substring(0, at)),
            TextSpan(text: em, style: TextStyle(color: c.primary)),
            TextSpan(text: hero.substring(at + em.length)),
          ]));
    return Scaffold(
      body: SafeArea(
        // scrolls when the text is enlarged or the screen is short, and fills the screen otherwise
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            padding: const EdgeInsets.all(HzSpace.gutter),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight - 2 * HzSpace.gutter),
              child: IntrinsicHeight(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: Press(child: TextButton(key: const Key('lang'), onPressed: context.read<LocaleController>().toggle, child: Text(t.language))),
                  ),
                  const SizedBox(height: HzSpace.s4),
                  Text(t.brand, style: tt.titleLarge?.copyWith(color: c.primary)),
                  const SizedBox(height: HzSpace.s3),
                  heroText,
                  const SizedBox(height: HzSpace.s3),
                  Text(t.welcomeSub, style: tt.bodyLarge?.copyWith(color: c.textMuted)),
                  const Spacer(),
                  const Center(child: Padding(padding: EdgeInsets.symmetric(vertical: HzSpace.s3), child: TableArt(size: 150))),
                  const Spacer(),
                  Press(child: FilledButton(key: const Key('start'), onPressed: () => context.go('/quiz'), child: Text(t.getStarted))),
                  const SizedBox(height: HzSpace.s2),
                  Text(t.quizLength, textAlign: TextAlign.center, style: tt.bodySmall),
                  // T12: Qatar numbers only, said before the questionnaire (the phone hint's own sentence)
                  const SizedBox(height: HzSpace.s1),
                  Text(t.qatarOnly, key: const Key('qatar-only'), textAlign: TextAlign.center, style: tt.bodySmall?.copyWith(color: c.textMuted)),
                  const SizedBox(height: HzSpace.s5),
                  Press(child: OutlinedButton(key: const Key('have-account'), onPressed: () => context.go('/sign-in'), child: Text(t.haveAccount))),
                  const SizedBox(height: HzSpace.s3),
                  Text(t.deviceNote, textAlign: TextAlign.center, style: tt.bodySmall?.copyWith(color: c.textMuted)),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
