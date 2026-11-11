import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../core/sounds.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../domain/session.dart';
import '../../l10n/app_localizations.dart';
import '../common/press.dart';
import '../../domain/theme_controller.dart';

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
        Press(child: OutlinedButton(key: const Key('my-answers'), onPressed: () => context.push('/quiz'), child: Text(t.myAnswers))),
        const SizedBox(height: HzSpace.s3),
        Press(child: OutlinedButton(key: const Key('lang'), onPressed: context.read<LocaleController>().toggle, child: Text(t.language))),
        const SizedBox(height: HzSpace.s3),
        Press(child: OutlinedButton(
          key: const Key('theme'),
          onPressed: () => context.read<ThemeController>().toggle(MediaQuery.platformBrightnessOf(context)),
          child: Text(Theme.of(context).brightness == Brightness.dark ? t.themeToLight : t.themeToDark),
        )),
        const SizedBox(height: HzSpace.s1),
        // interface sounds (item 26): on by default, remembered on this device, quiet when the phone is on silent
        SwitchListTile(
          key: const Key('sounds'),
          contentPadding: EdgeInsets.zero,
          value: context.watch<Sounds>().enabled,
          onChanged: context.read<Sounds>().setEnabled,
          title: Text(t.sounds),
        ),
        const SizedBox(height: HzSpace.s1),
        Press(child: OutlinedButton(key: const Key('documents'), onPressed: () => context.push('/documents'), child: Text(t.docsTitle))),
        const SizedBox(height: HzSpace.s3),
        Press(child: OutlinedButton(key: const Key('cases'), onPressed: () => context.push('/cases'), child: Text(t.casesTitle))),
        const SizedBox(height: HzSpace.s3),
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
      messenger.showSnackBar(SnackBar(content: Text(e.isOffline ? t.offline : (e.message.isNotEmpty ? e.message : t.errGeneric))));
    }
  }
}
