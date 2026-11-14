import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../core/sounds.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../domain/session.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart' show errorText;
import '../common/press.dart';
import '../../domain/theme_controller.dart';
import '../theme.dart' show hzColors;

/// The four tabs of the web app: home, my meetups, notifications, account.
class ShellScreen extends StatelessWidget {
  const ShellScreen({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      body: shell,
      bottomNavigationBar: _TabBar(
        selected: shell.currentIndex,
        onSelected: (i) {
          Sounds.instance.play(UiSound.tap);
          shell.goBranch(i, initialLocation: i == shell.currentIndex);
        },
        tabs: [
          (Icons.home_outlined, Icons.home, t.tabHome),
          (Icons.calendar_month_outlined, Icons.calendar_month, t.tabEvents),
          (Icons.notifications_outlined, Icons.notifications, t.tabInbox),
          (Icons.account_circle_outlined, Icons.account_circle, t.tabProfile),
        ],
      ),
    );
  }
}

/// The tab bar: the same four tabs, icons and words, with one tinted indicator that glides from the old tab to the new
/// one (owner, 14 Nov: rounds 1-3) instead of fading out and in. It jumps at once when the device asks for reduced
/// motion.
class _TabBar extends StatelessWidget {
  const _TabBar({required this.selected, required this.onSelected, required this.tabs});

  final int selected;
  final ValueChanged<int> onSelected;
  final List<(IconData, IconData, String)> tabs;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    final label = Theme.of(context).textTheme.labelMedium;
    final n = tabs.length;
    return Material(
      color: c.surface,
      shape: Border(top: BorderSide(color: c.border)),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: HzSpace.s2, vertical: 6),
          child: Stack(children: [
            Positioned.fill(
              child: AnimatedAlign(
                key: const Key('tab-indicator'),
                alignment: AlignmentDirectional(-1 + 2 * selected / (n - 1), 0),
                duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 400),
                curve: const Cubic(0.16, 1, 0.3, 1),
                child: FractionallySizedBox(
                  widthFactor: 1 / n,
                  heightFactor: 1,
                  child: DecoratedBox(decoration: BoxDecoration(color: c.primarySubtle, borderRadius: BorderRadius.circular(HzRadius.md))),
                ),
              ),
            ),
            Row(children: [
              for (final (i, (icon, iconOn, text)) in tabs.indexed)
                Expanded(
                  child: Semantics(
                    selected: i == selected,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(HzRadius.md),
                      onTap: () => onSelected(i),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 52),
                        child: Column(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(i == selected ? iconOn : icon, color: i == selected ? c.primary : c.textMuted),
                          Text(text, maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: label?.copyWith(color: i == selected ? c.primary : c.textMuted, fontWeight: i == selected ? FontWeight.w600 : null)),
                        ]),
                      ),
                    ),
                  ),
                ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class AccountTab extends StatelessWidget {
  const AccountTab({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final session = context.watch<Session>();
    return SafeArea(
      child: ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
        Text(t.tabProfile, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: HzSpace.s2),
        if (session.me?.displayName != null) Text(session.me!.displayName!),
        const SizedBox(height: HzSpace.s6),
        // rounded light cards of rows, as on the website (identity step, 13 Nov 2026); same items, same order, same
        // words, now in three named groups (owner, 14 Nov: rounds 1-3). A changed setting answers with a tick in its
        // own row instead of a message.
        _Group(title: t.groupProfile, children: [
          _Row(key: const Key('my-answers'), label: t.myAnswers, onTap: () => context.push('/quiz')),
        ]),
        const SizedBox(height: HzSpace.s4),
        _Group(title: t.groupPrefs, children: [
          _Row(key: const Key('lang'), label: t.language, confirms: true, onTap: context.read<LocaleController>().toggle),
          _Row(
            key: const Key('theme'),
            label: Theme.of(context).brightness == Brightness.dark ? t.themeToLight : t.themeToDark,
            confirms: true,
            onTap: () => context.read<ThemeController>().toggle(MediaQuery.platformBrightnessOf(context)),
          ),
          // interface sounds (item 26): on by default, remembered on this device, quiet when the phone is on silent
          SwitchListTile(
            key: const Key('sounds'),
            contentPadding: EdgeInsets.zero,
            value: context.watch<Sounds>().enabled,
            onChanged: context.read<Sounds>().setEnabled,
            title: Text(t.sounds),
          ),
        ]),
        const SizedBox(height: HzSpace.s4),
        _Group(title: t.groupPrivacy, children: [
          _Row(key: const Key('documents'), label: t.docsTitle, onTap: () => context.push('/documents')),
          _Row(key: const Key('cases'), label: t.casesTitle, onTap: () => context.push('/cases')),
        ]),
        const SizedBox(height: HzSpace.s6),
        Press(child: FilledButton(key: const Key('signOut'), onPressed: session.signOut, child: Text(t.signOut))),
        const SizedBox(height: HzSpace.s6),
        Press(child: TextButton(
          key: const Key('deleteAccount'),
          style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
          onPressed: () => _confirmDelete(context, session),
          child: Text(t.deleteAccount),
        )),
      ]),
    );
  }

  Future<void> _confirmDelete(BuildContext context, Session session) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(t.deleteConfirm),
        actions: [
          Press(child: TextButton(key: const Key('deleteNo'), onPressed: () => Navigator.pop(c, false), child: Text(t.deleteNo))),
          Press(child: TextButton(
            key: const Key('deleteYes'),
            style: TextButton.styleFrom(foregroundColor: Theme.of(c).colorScheme.error),
            onPressed: () => Navigator.pop(c, true),
            child: Text(t.deleteYes),
          )),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await session.deleteAccount();
    } on ApiError catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(t, e))));
    }
  }
}

/// A section of the account screen: one rounded light card, its rows divided inside it (identity step, 13 Nov 2026).
class _Group extends StatelessWidget {
  const _Group({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsetsDirectional.only(start: HzSpace.s1, bottom: HzSpace.s1),
        child: Text(title, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: c.textMuted, fontWeight: FontWeight.w600)),
      ),
      Material(
        color: c.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.lg), side: BorderSide(color: c.border)),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: HzSpace.s4),
          child: Column(children: [
            for (final (i, row) in children.indexed) ...[if (i > 0) Divider(height: 1, thickness: 1, color: c.border), row],
          ]),
        ),
      ),
    ]);
  }
}

/// One row: its label and the arrow toward where it leads, 56 px tall. A row that changes a setting on the spot
/// ([confirms]) shows a tick in place of its arrow for a moment after the tap.
class _Row extends StatefulWidget {
  const _Row({super.key, required this.label, required this.onTap, this.confirms = false});

  final String label;
  final VoidCallback onTap;
  final bool confirms;

  @override
  State<_Row> createState() => _RowState();
}

class _RowState extends State<_Row> with SingleTickerProviderStateMixin {
  // how long the tick stays; a controller, not a timer, so nothing is left running when the screen goes away
  late final AnimationController _ok = AnimationController(vsync: this, duration: const Duration(milliseconds: 1350));

  @override
  void dispose() {
    _ok.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final c = hzColors(context);
    return InkWell(
      onTap: () {
        widget.onTap();
        if (widget.confirms) _ok.forward(from: 0);
      },
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Row(children: [
          Expanded(child: Text(widget.label)),
          AnimatedBuilder(
            animation: _ok,
            builder: (context, _) => AnimatedSwitcher(
              duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 150),
              child: _ok.isAnimating
                  ? Icon(Icons.check_rounded, key: const ValueKey('ok'), color: c.primary)
                  : Icon(rtl ? Icons.chevron_left : Icons.chevron_right, key: const ValueKey('go'), color: c.textMuted),
            ),
          ),
        ]),
      ),
    );
  }
}
