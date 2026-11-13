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
    // The last words of the headline sit on the owner's yellow with dark ink, as on herzone.app (owner, 11 Nov):
    // yellow is a fill here and nowhere else. The text itself is left exactly as the translation gives it, so what a
    // screen reader reads and what the tests look for stay the headline.
    final hero = t.welcomeHero;
    final em = t.welcomeHeroEm;
    final at = hero.lastIndexOf(em);
    final arabic = Localizations.localeOf(context).languageCode == 'ar';
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, box) {
            // The Arabic welcome line reads as one line (owner, 12 Nov). At the full 32 pt it needs more width than a
            // phone gives it, so on a narrow screen the size follows the width, exactly as the website does: 7% of the
            // width, never above 31.2. English keeps its size and its two lines — it is a different sentence.
            final heroStyle = arabic
                ? tt.displaySmall?.copyWith(fontSize: (box.maxWidth * 0.07).clamp(18.0, 31.2))
                : tt.displaySmall;
            final heroText = at < 0
                ? Text(hero, style: heroStyle)
                : Text.rich(TextSpan(style: heroStyle, children: [
                    TextSpan(text: hero.substring(0, at)),
                    TextSpan(text: em, style: TextStyle(color: c.onAccent, backgroundColor: c.accent)),
                    TextSpan(text: hero.substring(at + em.length)),
                  ]));
            // The screen read too long on a tall phone (owner, 11 Nov): two free-growing gaps left a hole above and
            // below the table. Now the gaps are small and fixed, and the whole block is centred in whatever height the
            // phone gives it, so the spare height becomes an even margin instead of a hole. On a short phone, or with
            // enlarged text, the block keeps its natural height and the page scrolls.
            final avail = box.maxHeight - 2 * HzSpace.gutter;
            final gap = (avail * 0.045).clamp(HzSpace.s4, HzSpace.s8);
            final art = (avail * 0.22).clamp(140.0, 220.0);
            return Stack(children: [
              SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(HzSpace.gutter, HzSpace.s12, HzSpace.gutter, HzSpace.gutter),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: avail - HzSpace.s12),
                  child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text(t.brand, style: tt.titleLarge?.copyWith(color: c.primary)),
                      const SizedBox(height: HzSpace.s3),
                      heroText,
                      const SizedBox(height: HzSpace.s3),
                      Text(t.welcomeSub, style: tt.bodyLarge?.copyWith(color: c.textMuted)),
                      SizedBox(height: gap),
                      Center(child: TableArt(size: art)),
                      SizedBox(height: gap),
                      Press(child: FilledButton(key: const Key('start'), onPressed: () => context.go('/quiz'), child: Text(t.getStarted))),
                      const SizedBox(height: HzSpace.s2),
                      Press(child: OutlinedButton(key: const Key('have-account'), onPressed: () => context.go('/sign-in'), child: Text(t.haveAccount))),
                    ]),
                  ),
                ),
              ),
              PositionedDirectional(
                top: 0,
                end: HzSpace.s2,
                child: Press(child: TextButton(key: const Key('lang'), onPressed: context.read<LocaleController>().toggle, child: Text(t.language))),
              ),
            ]);
          },
        ),
      ),
    );
  }
}
