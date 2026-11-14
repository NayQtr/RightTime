import 'package:flutter/material.dart';

import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../format.dart';
import '../theme.dart';

/// "What does the organising fee cover?" (owner's texts, 14 Nov 2026): what the fee includes and what it does not,
/// then the common questions, each opening its answer in place. Reached from the fee line of the booking review.
class FeeInfoScreen extends StatelessWidget {
  const FeeInfoScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    final still = MediaQuery.of(context).disableAnimations;
    Widget card(Widget child) => Material(
          color: c.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.xl), side: BorderSide(color: c.border)),
          clipBehavior: Clip.antiAlias,
          child: child,
        );
    Widget item(String text, {required bool included}) => Padding(
          padding: const EdgeInsets.only(top: HzSpace.s2),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // told by the heading and the icon's shape, not by colour alone
            ExcludeSemantics(child: Icon(included ? Icons.check_rounded : Icons.remove_rounded, size: 20, color: included ? c.primary : c.textMuted)),
            const SizedBox(width: HzSpace.s2),
            Expanded(child: Text(text)),
          ]),
        );
    Widget small(String text) => Semantics(header: true, child: Text(text, style: tt.labelMedium?.copyWith(color: c.textMuted, fontWeight: FontWeight.w600)));
    final faq = [(t.faqQ1, t.faqA1), (t.faqQ2, t.faqA2), (t.faqQ3, t.faqA3), (t.faqQ4, t.faqA4), (t.faqQ5, t.faqA5)];
    return Scaffold(
      appBar: AppBar(title: Text(t.serviceFee)),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
          Semantics(header: true, child: Text(t.feeInfoTitle, key: const Key('fee-info-title'), style: tt.headlineMedium)),
          const SizedBox(height: HzSpace.s4),
          card(Padding(
            padding: const EdgeInsets.all(HzSpace.s4),
            child: Column(key: const Key('fee-covers'), crossAxisAlignment: CrossAxisAlignment.start, children: [
              small(t.feeIncludes),
              for (final line in [t.feeInc1, t.feeInc2, t.feeInc3]) item(line, included: true),
              Divider(height: HzSpace.s6, thickness: 1, color: c.border),
              small(t.feeExcludes),
              item(t.feeExc1, included: false),
            ]),
          )),
          const SizedBox(height: HzSpace.s4),
          card(Theme(
            // the rows are divided by one hairline each; the tile's own top and bottom lines are not drawn
            data: Theme.of(context).copyWith(dividerColor: c.border.withValues(alpha: 0)),
            child: Column(children: [
              for (final (i, (q, a)) in faq.indexed) ...[
                if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
                ExpansionTile(
                  key: Key('faq-${i + 1}'),
                  title: Text(q, style: tt.titleMedium),
                  iconColor: c.primary,
                  collapsedIconColor: c.textMuted,
                  textColor: c.text,
                  collapsedTextColor: c.text,
                  expandedAlignment: AlignmentDirectional.centerStart,
                  tilePadding: const EdgeInsets.symmetric(horizontal: HzSpace.s4),
                  childrenPadding: const EdgeInsetsDirectional.fromSTEB(HzSpace.s4, 0, HzSpace.s4, HzSpace.s4),
                  expansionAnimationStyle: still ? AnimationStyle.noAnimation : null,
                  children: [Text(ltrPlusOne(a), key: Key('faq-${i + 1}-answer'))],
                ),
              ],
            ]),
          )),
        ]),
      ),
    );
  }
}
