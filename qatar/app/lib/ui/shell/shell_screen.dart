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
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) {
          Sounds.instance.play(UiSound.tap);
          shell.goBranch(i, initialLocation: i == shell.currentIndex);
        },
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: t.tabHome),
          NavigationDestination(icon: const Icon(Icons.calendar_month_outlined), selectedIcon: const Icon(Icons.calendar_month), label: t.tabEvents),
          NavigationDestination(icon: const Icon(Icons.notifications_outlined), selectedIcon: const Icon(Icons.notifications), label: t.tabInbox),
          NavigationDestination(icon: const Icon(Icons.account_circle_outlined), selectedIcon: const Icon(Icons.account_circle), label: t.tabProfile),
        ],
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
        // one rounded light card of rows, as on the website (identity step, 13 Nov 2026); same items, same order, same words
        _Group(children: [
          _Row(key: const Key('my-answers'), label: t.myAnswers, onTap: () => context.push('/quiz')),
          _Row(key: const Key('lang'), label: t.language, onTap: context.read<LocaleController>().toggle),
          _Row(
            key: const Key('theme'),
            label: Theme.of(context).brightness == Brightness.dark ? t.themeToLight : t.themeToDark,
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
  const _Group({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = hzColors(context);
    return Material(
      color: c.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.lg), side: BorderSide(color: c.border)),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: HzSpace.s4),
        child: Column(children: [
          for (final (i, row) in children.indexed) ...[if (i > 0) Divider(height: 1, thickness: 1, color: c.border), row],
        ]),
      ),
    );
  }
}

/// One row: its label and the arrow toward where it leads, 56 px tall.
class _Row extends StatelessWidget {
  const _Row({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Row(children: [
          Expanded(child: Text(label)),
          Icon(rtl ? Icons.chevron_left : Icons.chevron_right, color: hzColors(context).textMuted),
        ]),
      ),
    );
  }
}
