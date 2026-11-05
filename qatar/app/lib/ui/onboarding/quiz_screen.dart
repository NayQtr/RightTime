import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../data/onboarding.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../theme.dart';
import 'quiz_view_model.dart';
import '../common/test_id.dart';
import '../common/busy_label.dart';

class QuizScreen extends StatefulWidget {
  const QuizScreen({super.key});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<QuizViewModel>().load());
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final vm = context.watch<QuizViewModel>();
    final c = hzColors(context);
    final tt = Theme.of(context).textTheme;
    final q = vm.current;
    // a signed-in member who finished (first time or editing) goes to the tabs
    if (vm.done && vm.signedIn) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        vm.done = false;
        context.go('/home');
      });
    }
    Widget body;
    if (vm.busy && vm.q == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (vm.q == null) {
      body = ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
        if (vm.error != null) ErrorBanner(vm.error!),
        const SizedBox(height: HzSpace.s4),
        OutlinedButton(key: const Key('retry'), onPressed: vm.load, child: Text(t.retry)),
      ]);
    } else if (vm.done && !vm.signedIn) {
      body = ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
        Text(t.quizDoneTitle, style: tt.headlineMedium),
        const SizedBox(height: HzSpace.s3),
        Text(t.quizDoneBody),
        const SizedBox(height: HzSpace.s6),
        FilledButton(key: const Key('save-answers'), onPressed: () => context.go('/sign-in'), child: Text(t.saveAnswers)),
      ]);
    } else if (q == null) {
      body = const Center(child: CircularProgressIndicator());
    } else {
      body = ListView(key: ValueKey(q.id), padding: const EdgeInsets.all(HzSpace.gutter), children: [
        LinearProgressIndicator(value: (vm.step + 1) / vm.total, color: c.primary, backgroundColor: c.surfaceSunken, minHeight: 6, borderRadius: BorderRadius.circular(3)),
        const SizedBox(height: HzSpace.s3),
        Text(t.qOf(vm.step + 1, vm.total), style: tt.bodySmall?.copyWith(color: c.primary, fontWeight: FontWeight.w600)),
        if (q.section != null) Text(q.section!, style: tt.bodySmall),
        const SizedBox(height: HzSpace.s2),
        TestId('question', child: Text(q.text, key: const Key('question'), style: tt.headlineMedium)),
        if (q.purpose != null) ...[const SizedBox(height: HzSpace.s2), Text(q.purpose!, style: tt.bodySmall?.copyWith(color: c.textMuted))],
        if (q.multi && q.max > 1) ...[const SizedBox(height: HzSpace.s2), Text(t.chooseUpTo(q.max), style: tt.bodySmall)],
        const SizedBox(height: HzSpace.s4),
        if (q.layout == 'chips' || q.layout == 'scale')
          Wrap(spacing: HzSpace.s2, runSpacing: HzSpace.s2, children: [for (final o in q.options) _Chip(o: o, selected: vm.selected.contains(o.id), onTap: () => vm.choose(o))])
        else
          for (final o in q.options) _OptionTile(o: o, selected: vm.selected.contains(o.id), multi: q.multi, onTap: () => vm.choose(o)),
        if (q.layout == 'scale' && (q.scaleLow != null || q.scaleHigh != null))
          Padding(
            padding: const EdgeInsets.only(top: HzSpace.s2),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(q.scaleLow ?? '', style: tt.bodySmall), Text(q.scaleHigh ?? '', style: tt.bodySmall)]),
          ),
        if (vm.error != null) ...[const SizedBox(height: HzSpace.s4), ErrorBanner(vm.error!)],
      ]);
    }
    final showNav = q != null && !(vm.done && !vm.signedIn);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: t.back,
          icon: const BackButtonIcon(),
          onPressed: () => vm.step > 0 && !vm.done ? vm.back() : (vm.signedIn ? context.go('/home') : context.go('/')),
        ),
      ),
      body: SafeArea(child: body),
      bottomNavigationBar: !showNav
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(HzSpace.gutter),
                child: Row(children: [
                  if (!q.required) ...[
                    Expanded(child: OutlinedButton(key: const Key('skip'), onPressed: vm.busy ? null : vm.skip, child: Text(t.skipQ))),
                    const SizedBox(width: HzSpace.s3),
                  ],
                  Expanded(
                    flex: 2,
                    child: FilledButton(key: const Key('next'), onPressed: vm.canNext && !vm.busy ? vm.next : null, child: BusyLabel(busy: vm.busy, child: Text(vm.step + 1 == vm.total ? t.continueLabel : t.next))),
                  ),
                ]),
              ),
            ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.o, required this.selected, required this.multi, required this.onTap});
  final QOption o;
  final bool selected, multi;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: HzSpace.s2),
      child: Semantics(
        selected: selected,
        button: true,
        child: TestId('opt-${o.key}', child: InkWell(
          key: Key('opt-${o.key}'),
          borderRadius: BorderRadius.circular(HzRadius.md),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: HzSpace.s4, vertical: HzSpace.s3),
            decoration: BoxDecoration(
              color: selected ? c.primarySubtle : c.surface,
              borderRadius: BorderRadius.circular(HzRadius.md),
              border: Border.all(color: selected ? c.primary : c.border, width: selected ? 2 : 1),
            ),
            child: Row(children: [
              if (o.emoji != null) ...[Text(o.emoji!, style: const TextStyle(fontSize: 20)), const SizedBox(width: HzSpace.s3)],
              Expanded(child: Text(o.label)),
              Icon(selected ? (multi ? Icons.check_box : Icons.radio_button_checked) : (multi ? Icons.check_box_outline_blank : Icons.radio_button_off),
                  color: selected ? c.primary : c.borderStrong),
            ]),
          ),
        )),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.o, required this.selected, required this.onTap});
  final QOption o;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return TestId('opt-${o.key}', child: FilterChip(
      key: Key('opt-${o.key}'),
      label: Text(o.emoji == null ? o.label : '${o.emoji} ${o.label}'),
      selected: selected,
      showCheckmark: false,
      selectedColor: c.primary,
      labelStyle: TextStyle(color: selected ? c.onPrimary : c.text),
      backgroundColor: c.surfaceSunken,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.pill), side: BorderSide(color: selected ? c.primary : c.borderStrong)),
      onSelected: (_) => onTap(),
    ));
  }
}
