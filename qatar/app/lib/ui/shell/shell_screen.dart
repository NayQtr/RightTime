import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../domain/session.dart';
import '../../l10n/app_localizations.dart';

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
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
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
        OutlinedButton(key: const Key('my-answers'), onPressed: () => context.push('/quiz'), child: Text(t.myAnswers)),
        const SizedBox(height: HzSpace.s3),
        OutlinedButton(key: const Key('lang'), onPressed: context.read<LocaleController>().toggle, child: Text(t.language)),
        const SizedBox(height: HzSpace.s3),
        FilledButton(key: const Key('signOut'), onPressed: session.signOut, child: Text(t.signOut)),
      ]),
    );
  }
}
