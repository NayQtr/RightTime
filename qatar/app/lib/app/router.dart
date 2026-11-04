import 'package:go_router/go_router.dart';

import '../domain/session.dart';
import '../ui/account/documents_screen.dart';
import '../ui/auth/otp_screen.dart';
import '../ui/auth/phone_screen.dart';
import '../data/models.dart';
import '../ui/meetups/book_screen.dart';
import '../ui/meetups/cancel_screen.dart';
import '../ui/meetups/event_details_screen.dart';
import '../ui/meetups/feedback_screen.dart';
import '../ui/meetups/report_screen.dart';
import '../ui/onboarding/quiz_screen.dart';
import '../ui/onboarding/register_screen.dart';
import '../ui/onboarding/welcome_screen.dart';
import '../ui/meetups/events_tab.dart';
import '../ui/meetups/home_tab.dart';
import '../ui/meetups/inbox_tab.dart';
import '../ui/shell/shell_screen.dart';
import 'splash.dart';

/// Routes. The session decides: unknown -> splash, signed out -> sign-in, signed in (or offline with a session) -> tabs.
GoRouter buildRouter(Session session) => GoRouter(
      initialLocation: '/',
      refreshListenable: session,
      redirect: (context, state) {
        final loc = state.matchedLocation;
        final open = loc == '/welcome' || loc == '/quiz' || loc.startsWith('/sign-in');
        switch (session.status) {
          case SessionStatus.unknown:
            return loc == '/' ? null : '/';
          case SessionStatus.signedOut:
            return open ? null : '/welcome';
          case SessionStatus.signedIn:
            if (session.needsRegistration) return loc == '/register' ? null : '/register';
            if (session.needsQuiz) return loc == '/quiz' ? null : '/quiz';
            return open && loc != '/quiz' || loc == '/' || loc == '/register' ? '/home' : null;
          case SessionStatus.offline:
            return open || loc == '/' || loc == '/register' ? '/home' : null;
        }
      },
      routes: [
        GoRoute(path: '/', builder: (_, _) => const Splash()),
        GoRoute(path: '/welcome', builder: (_, _) => const WelcomeScreen()),
        GoRoute(path: '/quiz', builder: (_, _) => const QuizScreen()),
        GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
        GoRoute(path: '/sign-in', builder: (_, _) => const PhoneScreen(), routes: [
          GoRoute(path: 'code', builder: (_, _) => const OtpScreen()),
        ]),
        GoRoute(path: '/booking/:id', builder: (_, state) => EventDetailsScreen(bookingId: state.pathParameters['id']!)),
        GoRoute(path: '/book', redirect: (_, state) => state.extra is SessionSummary ? null : '/home', builder: (_, state) => BookScreen(session: state.extra! as SessionSummary)),
        GoRoute(path: '/booking/:id/feedback', builder: (_, state) => FeedbackScreen(bookingId: state.pathParameters['id']!)),
        GoRoute(path: '/booking/:id/cancel', builder: (_, state) => CancelScreen(bookingId: state.pathParameters['id']!)),
        GoRoute(path: '/report/:id', builder: (_, state) => ReportScreen(bookingId: state.pathParameters['id']!)),
        GoRoute(path: '/documents', builder: (_, _) => const DocumentsScreen()),
        StatefulShellRoute.indexedStack(
          builder: (_, _, shell) => ShellScreen(shell: shell),
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeTab())]),
            StatefulShellBranch(routes: [GoRoute(path: '/events', builder: (_, _) => const EventsTab())]),
            StatefulShellBranch(routes: [GoRoute(path: '/inbox', builder: (_, _) => const InboxTab())]),
            StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const AccountTab())]),
          ],
        ),
      ],
    );
