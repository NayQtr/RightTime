import 'package:go_router/go_router.dart';

import '../domain/session.dart';
import '../l10n/app_localizations.dart';
import '../ui/auth/otp_screen.dart';
import '../ui/auth/phone_screen.dart';
import '../ui/shell/shell_screen.dart';
import 'splash.dart';

/// Routes. The session decides: unknown -> splash, signed out -> sign-in, signed in (or offline with a session) -> tabs.
GoRouter buildRouter(Session session) => GoRouter(
      initialLocation: '/',
      refreshListenable: session,
      redirect: (context, state) {
        final loc = state.matchedLocation;
        final inSignIn = loc.startsWith('/sign-in');
        switch (session.status) {
          case SessionStatus.unknown:
            return loc == '/' ? null : '/';
          case SessionStatus.signedOut:
            return inSignIn ? null : '/sign-in';
          case SessionStatus.signedIn:
          case SessionStatus.offline:
            return inSignIn || loc == '/' ? '/home' : null;
        }
      },
      routes: [
        GoRoute(path: '/', builder: (_, _) => const Splash()),
        GoRoute(path: '/sign-in', builder: (_, _) => const PhoneScreen(), routes: [
          GoRoute(path: 'code', builder: (_, _) => const OtpScreen()),
        ]),
        StatefulShellRoute.indexedStack(
          builder: (_, _, shell) => ShellScreen(shell: shell),
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => PlaceholderTab(title: (AppLocalizations t) => t.tabHome))]),
            StatefulShellBranch(routes: [GoRoute(path: '/events', builder: (_, _) => PlaceholderTab(title: (AppLocalizations t) => t.tabEvents))]),
            StatefulShellBranch(routes: [GoRoute(path: '/inbox', builder: (_, _) => PlaceholderTab(title: (AppLocalizations t) => t.tabInbox))]),
            StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountTab())]),
          ],
        ),
      ],
    );
