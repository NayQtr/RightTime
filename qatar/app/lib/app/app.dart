import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/token_store.dart';
import '../data/auth_repository.dart';
import '../data/meetups_repository.dart';
import '../data/onboarding.dart';
import '../data/trip_store.dart';
import '../domain/locale_controller.dart';
import '../domain/session.dart';
import '../l10n/app_localizations.dart';
import '../ui/auth/sign_in_view_model.dart';
import '../ui/onboarding/quiz_view_model.dart';
import '../ui/theme.dart';
import 'router.dart';

/// Dependency wiring: one ApiClient, repositories over it, app-wide state as ChangeNotifiers (provider). Tests pass a
/// fake http client and an in-memory token store through the same constructor.
class HerZoneApp extends StatefulWidget {
  const HerZoneApp({super.key, required this.config, required this.tokens, required this.trips, required this.quizStore, this.httpClientFactory});

  final AppConfig config;
  final TokenStore tokens;
  final TripStore trips;
  final QuizStore quizStore;
  final dynamic Function()? httpClientFactory;

  @override
  State<HerZoneApp> createState() => _HerZoneAppState();
}

class _HerZoneAppState extends State<HerZoneApp> {
  final locale = LocaleController();
  late final ApiClient api;
  late final AuthRepository auth;
  late final MeetupsRepository meetups;
  late final OnboardingRepository onboarding;
  late final Session session;
  late final GoRouter router;

  @override
  void initState() {
    super.initState();
    api = ApiClient(
      baseUrl: widget.config.apiBase,
      tokens: widget.tokens,
      locale: () => locale.code,
      httpClient: widget.httpClientFactory?.call(),
      onSignedOut: () => session.signedOutByServer(),
    );
    auth = AuthRepository(api);
    meetups = MeetupsRepository(api, widget.trips);
    onboarding = OnboardingRepository(api);
    session = Session(api, auth, clearDevice: meetups.forgetDevice, onboarding: onboarding)..restore();
    router = buildRouter(session);
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: locale),
        ChangeNotifierProvider.value(value: session),
        Provider.value(value: auth),
        Provider.value(value: meetups),
        Provider.value(value: onboarding),
        ChangeNotifierProvider(create: (_) => QuizViewModel(onboarding, widget.quizStore, session)),
        ChangeNotifierProvider(create: (_) => SignInViewModel(auth, session, () => locale.code)),
      ],
      child: ListenableBuilder(
        listenable: locale,
        builder: (context, _) => MaterialApp.router(
          onGenerateTitle: (c) => AppLocalizations.of(c).brand,
          debugShowCheckedModeBanner: false,
          locale: locale.locale,
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          theme: herZoneTheme(Brightness.light, locale.code),
          darkTheme: herZoneTheme(Brightness.dark, locale.code),
          routerConfig: router,
        ),
      ),
    );
  }
}
