import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../data/onboarding.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../theme.dart';
import 'quiz_view_model.dart';
import '../common/table_art.dart';
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/press.dart';
import '../common/sufra_background.dart';

/// The owner's wording (11 Nov): one minute, two minutes, then "a few minutes". The longest questionnaire is about
/// four minutes, so no larger number is reached. The website says the same (timeLeftText in web/app.js).
String timeLeftText(AppLocalizations t, int minutes) => switch (minutes) {
      <= 0 => t.timeLeftUnder,
      1 => t.timeLeftOne,
      2 => t.timeLeftTwo,
      _ => t.timeLeftFew,
    };

class QuizScreen extends StatefulWidget {
  const QuizScreen({super.key});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  /// The question whose heading has given way to the reply line. It happens once per visit, on her first answer to a
  /// question that stays on screen (a single choice moves on by itself).
  String? _replyFor;
  bool _replied = false;

  void _choose(QuizViewModel vm, Question q, QOption o) {
    final first = q.multi && !_replied && vm.selected.isEmpty;
    vm.choose(o);
    if (first && vm.selected.isNotEmpty) {
      setState(() {
        _replied = true;
        _replyFor = q.id;
      });
    }
  }

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
        Press(child: OutlinedButton(key: const Key('retry'), onPressed: vm.load, child: Text(t.retry))),
      ]);
    } else if (vm.done && !vm.signedIn) {
      // the end of the questions (the app's interstitial) has the «سُفرة» seats pattern behind it (owner, 15 Nov)
      body = SufraBackground(child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
        // the end of the questions: the table drawing with every seat taken (as on the website's last screen)
        const Align(alignment: AlignmentDirectional.centerStart, child: TableArt(key: Key('done-table'), filled: 6, size: 132)),
        const SizedBox(height: HzSpace.s4),
        Text(t.quizDoneTitle, style: tt.headlineMedium),
        const SizedBox(height: HzSpace.s3),
        Text(t.quizDoneBody),
        const SizedBox(height: HzSpace.s6),
        Press(child: FilledButton(key: const Key('save-answers'), onPressed: () => context.go('/sign-in'), child: Text(t.saveAnswers))),
      ]));
    } else if (q == null) {
      body = const Center(child: CircularProgressIndicator());
    } else {
      body = ListView(key: ValueKey(q.id), padding: const EdgeInsets.all(HzSpace.gutter), children: [
        LinearProgressIndicator(value: (vm.step + 1) / vm.total, color: c.primary, backgroundColor: c.surfaceSunken, minHeight: 6, borderRadius: BorderRadius.circular(3)),
        const SizedBox(height: HzSpace.s3),
        // After her first answer the heading gives way to one reply line and a seat fills at the small table (owner,
        // 14 Nov: rounds 1-3); the next question brings the heading back. At once with reduced motion.
        AnimatedSwitcher(
          duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 180),
          switchInCurve: HzMotion.easing,
          switchOutCurve: HzMotion.easing,
          layoutBuilder: (current, previous) => Stack(alignment: AlignmentDirectional.topStart, children: [...previous, ?current]),
          child: _replyFor == q.id
              ? _Reply(key: const Key('quiz-reply'), text: t.quizReply)
              : Column(key: const ValueKey('heading'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  // the step count, then the time left in a quieter colour
                  Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Text(t.qOf(vm.step + 1, vm.total), style: tt.bodySmall?.copyWith(color: c.primary, fontWeight: FontWeight.w600)),
                    Text(' · ${timeLeftText(t, vm.minutesToGo)}', key: const Key('time-left'),
                        style: tt.bodySmall?.copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
                  ]),
                  if (q.section != null) Text(q.section!, style: tt.bodySmall),
                  const SizedBox(height: HzSpace.s2),
                  TestId('question', child: Text(q.text, key: const Key('question'), style: tt.headlineMedium)),
                  if (q.purpose != null) ...[const SizedBox(height: HzSpace.s2), Text(q.purpose!, style: tt.bodySmall?.copyWith(color: c.textMuted))],
                  if (q.multi && q.max > 1) ...[const SizedBox(height: HzSpace.s2), Text(t.chooseUpTo(q.max), style: tt.bodySmall)],
                ]),
        ),
        const SizedBox(height: HzSpace.s4),
        if (q.layout == 'scale')
          _ScaleTrack(options: q.options, selected: vm.selected, onTap: (o) => _choose(vm, q, o))
        else if (q.layout == 'chips')
          Wrap(spacing: HzSpace.s2, runSpacing: HzSpace.s2, children: [for (final o in q.options) _Chip(o: o, selected: vm.selected.contains(o.id), onTap: () => _choose(vm, q, o))])
        else
          for (final o in q.options) _OptionTile(o: o, selected: vm.selected.contains(o.id), multi: q.multi, onTap: () => _choose(vm, q, o)),
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
        leading: Press(child: IconButton(
          tooltip: t.back,
          icon: const BackButtonIcon(),
          onPressed: () => vm.step > 0 && !vm.done ? vm.back() : (vm.signedIn ? context.go('/home') : context.go('/')),
        )),
      ),
      body: SafeArea(child: body),
      bottomNavigationBar: !showNav
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(HzSpace.gutter),
                child: Row(children: [
                  if (!q.required) ...[
                    Expanded(child: Press(child: OutlinedButton(key: const Key('skip'), onPressed: vm.busy ? null : vm.skip, child: Text(t.skipQ)))),
                    const SizedBox(width: HzSpace.s3),
                  ],
                  Expanded(
                    flex: 2,
                    child: Press(child: FilledButton(key: const Key('next'), onPressed: vm.canNext && !vm.busy ? vm.next : null, child: BusyLabel(busy: vm.busy, child: Text(vm.step + 1 == vm.total ? t.continueLabel : t.next)))),
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
    final still = MediaQuery.of(context).disableAnimations;
    return Padding(
      padding: const EdgeInsets.only(bottom: HzSpace.s2),
      child: Semantics(
        selected: selected,
        button: true,
        // the row dims while touched and fills when released (owner, 14 Nov: rounds 1-3)
        child: TestId('opt-${o.key}', child: Press(dim: true, child: InkWell(
          key: Key('opt-${o.key}'),
          borderRadius: BorderRadius.circular(HzRadius.md),
          onTap: onTap,
          // the row and its mark change smoothly when chosen (design study item 4, 13 Nov 2026); at once with reduced motion
          child: AnimatedContainer(
            duration: still ? Duration.zero : HzMotion.fast,
            curve: HzMotion.easing,
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: HzSpace.s4, vertical: HzSpace.s3),
            decoration: BoxDecoration(
              color: selected ? c.primarySubtle : c.surface,
              borderRadius: BorderRadius.circular(HzRadius.md),
              border: Border.all(color: selected ? c.primary : c.border, width: selected ? 2 : 1.5),
            ),
            child: Row(children: [
              if (o.emoji != null) ...[Text(o.emoji!, style: const TextStyle(fontSize: 20)), const SizedBox(width: HzSpace.s3)],
              // the chosen answer reads in mauve, as on the website (identity step, 13 Nov 2026)
              Expanded(child: Text(o.label, style: selected ? TextStyle(color: c.primary, fontWeight: FontWeight.w600) : null)),
              AnimatedSwitcher(
                key: ValueKey('mark-${o.key}'),
                duration: still ? Duration.zero : HzMotion.base,
                switchInCurve: HzMotion.easing,
                switchOutCurve: HzMotion.easingIn,
                transitionBuilder: (child, animation) => ScaleTransition(scale: Tween<double>(begin: 0.6, end: 1).animate(animation),
                    child: FadeTransition(opacity: animation, child: child)),
                child: Icon(selected ? (multi ? Icons.check_box : Icons.radio_button_checked) : (multi ? Icons.check_box_outline_blank : Icons.radio_button_off),
                    key: ValueKey(selected), color: selected ? c.primary : c.borderStrong),
              ),
            ]),
          ),
        ))),
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
    return TestId('opt-${o.key}', child: Press(dim: true, child: FilterChip(
      key: Key('opt-${o.key}'),
      label: Text(o.emoji == null ? o.label : '${o.emoji} ${o.label}'),
      selected: selected,
      showCheckmark: false,
      selectedColor: c.primary,
      labelStyle: TextStyle(color: selected ? c.onPrimary : c.text),
      backgroundColor: c.surfaceSunken,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.pill), side: BorderSide(color: selected ? c.primary : c.borderStrong)),
      onSelected: (_) => onTap(),
    )));
  }
}

/// The reply that stands where the heading stood after her first answer: the small table with one seat filling, and
/// one line. The seat fills as the line arrives; with reduced motion it is already filled.
class _Reply extends StatefulWidget {
  const _Reply({super.key, required this.text});
  final String text;

  @override
  State<_Reply> createState() => _ReplyState();
}

class _ReplyState extends State<_Reply> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: HzMotion.slow);
  late final Animation<double> _seat = CurvedAnimation(parent: _c, curve: const Interval(0.25, 1, curve: HzMotion.easing));
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.of(context).disableAnimations) {
      _c.value = 1;
    } else {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Row(children: [
          Stack(children: [
            const TableArt(filled: 0, size: 56),
            FadeTransition(opacity: _seat, child: const TableArt(filled: 1, size: 56)),
          ]),
          const SizedBox(width: HzSpace.s3),
          Expanded(child: Text(widget.text, style: Theme.of(context).textTheme.titleLarge)),
        ]),
      );
}

/// A scale question as one track: the numbers sit in a single rounded bar and a light thumb slides to the chosen one
/// (owner, 14 Nov: rounds 1-3). Each number is still its own button with the option's key. At once with reduced motion.
class _ScaleTrack extends StatelessWidget {
  const _ScaleTrack({required this.options, required this.selected, required this.onTap});
  final List<QOption> options;
  final Set<String> selected;
  final ValueChanged<QOption> onTap;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    final n = options.length;
    final at = options.indexWhere((o) => selected.contains(o.id));
    final still = MediaQuery.of(context).disableAnimations;
    return Container(
      key: const Key('scale-track'),
      height: 56,
      padding: const EdgeInsets.all(HzSpace.s1),
      // the sunken surface under the light thumb: the two stay apart in the dark theme as well
      decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: BorderRadius.circular(HzRadius.pill)),
      child: Stack(children: [
        if (at >= 0)
          AnimatedAlign(
            alignment: AlignmentDirectional(n < 2 ? 0 : -1 + 2 * at / (n - 1), 0),
            duration: still ? Duration.zero : HzMotion.base,
            curve: Curves.easeOut,
            child: FractionallySizedBox(
              widthFactor: 1 / n,
              heightFactor: 1,
              child: DecoratedBox(
                key: const Key('scale-thumb'),
                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(HzRadius.pill), boxShadow: HzElevation.e1),
              ),
            ),
          ),
        Material(
          type: MaterialType.transparency,
          child: Row(children: [
            for (final (i, o) in options.indexed)
              Expanded(
                child: Semantics(
                  selected: i == at,
                  button: true,
                  child: TestId('opt-${o.key}', child: InkWell(
                    key: Key('opt-${o.key}'),
                    borderRadius: BorderRadius.circular(HzRadius.pill),
                    onTap: () => onTap(o),
                    child: Center(
                      child: Text(o.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 16, fontWeight: FontWeight.w700, color: i == at ? c.primary : c.textMuted)),
                    ),
                  )),
                ),
              ),
          ]),
        ),
      ]),
    );
  }
}
