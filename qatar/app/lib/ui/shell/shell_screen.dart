import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../core/device_unlock.dart';
import '../../core/sounds.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/inbox_badge.dart';
import '../../domain/locale_controller.dart';
import '../../domain/session.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart' show ErrorBanner;
import '../common/busy_label.dart';
import '../common/press.dart';
import '../../domain/theme_controller.dart';
import '../theme.dart' show hzColors;

/// The four tabs of the web app: home, my meetups, notifications, account. The notifications tab carries the number of
/// notifications new since her last visit to it (the website's rule, NMX-18).
class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  static const _inbox = 2;

  @override
  void initState() {
    super.initState();
    if (widget.shell.currentIndex != _inbox) context.read<InboxBadge>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final shell = widget.shell;
    return Scaffold(
      body: shell,
      bottomNavigationBar: _TabBar(
        selected: shell.currentIndex,
        onSelected: (i) {
          Sounds.instance.play(UiSound.tap);
          final badge = context.read<InboxBadge>();
          if (i == _inbox) {
            badge.opened(clear: context.read<PrivacyLock>().unlocked);
          } else {
            badge.refresh();
          }
          shell.goBranch(i, initialLocation: i == shell.currentIndex);
        },
        badge: (_inbox, context.watch<InboxBadge>().unread),
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
  const _TabBar({required this.selected, required this.onSelected, required this.tabs, this.badge = (-1, 0)});

  final int selected;
  final ValueChanged<int> onSelected;
  final List<(IconData, IconData, String)> tabs;

  /// The tab that carries a count, and the count (none shown at 0).
  final (int, int) badge;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    final t = AppLocalizations.of(context);
    final label = Theme.of(context).textTheme.labelMedium;
    final n = tabs.length;
    final (badgeAt, count) = badge;
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
                    // the count is read with the tab's name ("Notifications, 3 unread")
                    label: i == badgeAt && count > 0 ? '$text، ${t.unreadCount(count)}' : null,
                    excludeSemantics: i == badgeAt && count > 0,
                    button: i == badgeAt && count > 0 ? true : null,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(HzRadius.md),
                      onTap: () => onSelected(i),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 52),
                        child: Column(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
                          Badge(
                            key: i == badgeAt ? const Key('inbox-badge') : null,
                            isLabelVisible: i == badgeAt && count > 0,
                            label: Text(count > 9 ? '9+' : '$count'),
                            backgroundColor: c.primary,
                            textColor: c.onPrimary,
                            child: Icon(i == selected ? iconOn : icon, color: i == selected ? c.primary : c.textMuted),
                          ),
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
          _Row(key: const Key('my-answers'), icon: Icons.quiz_outlined, label: t.myAnswers, onTap: () => context.push('/quiz')),
        ]),
        const SizedBox(height: HzSpace.s4),
        _Group(title: t.groupPrefs, children: [
          // each row shows what is set now, not what a tap would choose (owner, 15 Nov)
          _Row(key: const Key('lang'), icon: Icons.translate, label: t.languageLabel, value: t.languageCurrent, confirms: true, onTap: context.read<LocaleController>().toggle),
          SwitchListTile(
            key: const Key('theme'),
            contentPadding: EdgeInsets.zero,
            horizontalTitleGap: HzSpace.s3,
            secondary: const _IconTile(Icons.dark_mode_outlined),
            thumbIcon: WidgetStateProperty.resolveWith((st) => Icon(st.contains(WidgetState.selected) ? Icons.check_rounded : Icons.close_rounded)),
            value: Theme.of(context).brightness == Brightness.dark,
            onChanged: (_) => context.read<ThemeController>().toggle(MediaQuery.platformBrightnessOf(context)),
            title: Text(t.themeToDark),
          ),
          // interface sounds (item 26): on by default, remembered on this device, quiet when the phone is on silent. A
          // screen reader hears the label, "switch" and on or off; on screen the thumb carries a tick or a cross, so the
          // state is never told by colour alone
          SwitchListTile(
            key: const Key('sounds'),
            contentPadding: EdgeInsets.zero,
            horizontalTitleGap: HzSpace.s3,
            secondary: const _IconTile(Icons.volume_up_outlined),
            thumbIcon: WidgetStateProperty.resolveWith((st) => Icon(st.contains(WidgetState.selected) ? Icons.check_rounded : Icons.close_rounded)),
            value: context.watch<Sounds>().enabled,
            onChanged: context.read<Sounds>().setEnabled,
            title: Text(t.sounds),
          ),
        ]),
        const SizedBox(height: HzSpace.s4),
        _Group(title: t.groupPrivacy, children: [
          _Row(key: const Key('documents'), icon: Icons.description_outlined, label: t.docsTitle, onTap: () => context.push('/documents')),
          _Row(key: const Key('cases'), icon: Icons.gavel_outlined, label: t.casesTitle, onTap: () => context.push('/cases')),
        ]),
        const SizedBox(height: HzSpace.s6),
        Press(child: OutlinedButton(key: const Key('signOut'), onPressed: session.signOut, child: Text(t.signOut))), // secondary, as on the website
        const SizedBox(height: HzSpace.s6),
        _DeleteAccount(session: session),
      ]),
    );
  }
}

/// Delete the account: asks first; while the request runs the button waits, and a refusal is said right under it
/// (not in a passing message at the bottom of the screen).
class _DeleteAccount extends StatefulWidget {
  const _DeleteAccount({required this.session});
  final Session session;

  @override
  State<_DeleteAccount> createState() => _DeleteAccountState();
}

class _DeleteAccountState extends State<_DeleteAccount> {
  bool busy = false;
  ApiError? error;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Press(child: TextButton(
        key: const Key('deleteAccount'),
        style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
        onPressed: busy ? null : () => _confirmDelete(context, widget.session),
        child: BusyLabel(busy: busy, child: Text(t.deleteAccount)),
      )),
      if (error != null) ...[const SizedBox(height: HzSpace.s2), ErrorBanner(error!, key: const Key('delete-error'))],
    ]);
  }

  Future<void> _confirmDelete(BuildContext context, Session session) async {
    final t = AppLocalizations.of(context);
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
    if (yes != true || !mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await session.deleteAccount();
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
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

/// The small neutral tile at the start of an account row, holding the row's icon (40 px, found by shape before it is read).
class _IconTile extends StatelessWidget {
  const _IconTile(this.icon);
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return ExcludeSemantics(
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: BorderRadius.circular(HzRadius.sm)),
        child: Icon(icon, size: 20, color: c.textMuted),
      ),
    );
  }
}

/// One row: its icon tile, its label and the arrow toward where it leads, 56 px tall. A row that changes a setting on the spot
/// ([confirms]) shows a tick in place of its arrow for a moment after the tap.
class _Row extends StatefulWidget {
  const _Row({super.key, required this.icon, required this.label, required this.onTap, this.value, this.confirms = false});

  final IconData icon;
  final String label;
  final String? value;
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
    final c = hzColors(context);
    return InkWell(
      onTap: () {
        widget.onTap();
        if (widget.confirms) _ok.forward(from: 0);
      },
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Row(children: [
          _IconTile(widget.icon),
          const SizedBox(width: HzSpace.s3),
          Expanded(child: Text(widget.label)),
          if (widget.value != null) Text(widget.value!, style: TextStyle(color: c.textMuted)),
          AnimatedBuilder(
            animation: _ok,
            builder: (context, _) => AnimatedSwitcher(
              duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 150),
              child: _ok.isAnimating
                  ? Icon(Icons.check_rounded, key: const ValueKey('ok'), color: c.primary)
                  : Icon(Icons.chevron_right, key: const ValueKey('go'), color: c.textMuted) // the icon mirrors itself in Arabic,
            ),
          ),
        ]),
      ),
    );
  }
}
