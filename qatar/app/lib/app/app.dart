import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/device_unlock.dart';
import '../core/link_opener.dart';
import '../core/token_store.dart';
import '../design/herzone_tokens.dart';
import '../data/auth_repository.dart';
import '../data/meetups_repository.dart';
import '../data/onboarding.dart';
import '../data/trip_store.dart';
import '../domain/locale_controller.dart';
import '../domain/session.dart';
import '../domain/theme_controller.dart';
import '../domain/update_gate.dart';
import '../l10n/app_localizations.dart';
import '../ui/auth/sign_in_view_model.dart';
import '../ui/common/privacy_cover.dart';
import '../ui/common/update_screen.dart';
import '../ui/onboarding/quiz_view_model.dart';
import '../ui/theme.dart';
import 'router.dart';

/// Dependency wiring: one ApiClient, repositories over it, app-wide state as ChangeNotifiers (provider). Tests pass a
/// fake http client and an in-memory token store through the same constructor.
class HerZoneApp extends StatefulWidget {
  const HerZoneApp({super.key, required this.config, required this.tokens, required this.trips, required this.quizStore, this.deviceUnlock, this.linkOpener = const LinkOpener(), this.httpClientFactory});

  final AppConfig config;
  final TokenStore tokens;
  final TripStore trips;
  final QuizStore quizStore;

  /// Face ID / fingerprint check; tests pass a fake.
  final DeviceUnlock? deviceUnlock;
  final LinkOpener linkOpener;
  final dynamic Function()? httpClientFactory;

  @override
  State<HerZoneApp> createState() => _HerZoneAppState();
}

class _HerZoneAppState extends State<HerZoneApp> {
  final locale = LocaleController();
  final theme = ThemeController()..load();
  final updateGate = UpdateGate();
  late final PrivacyLock privacyLock = PrivacyLock(widget.deviceUnlock ?? LocalDeviceUnlock());
  late final ApiClient api;
  late final AuthRepository auth;
  late final MeetupsRepository meetups;
  late final OnboardingRepository onboarding;
  late final Session session;
  late final GoRouter router;
  late final QuizViewModel quiz;
  late final SignInViewModel signIn;

  @override
  void initState() {
    super.initState();
    api = ApiClient(
      baseUrl: widget.config.apiBase,
      tokens: widget.tokens,
      locale: () => locale.code,
      httpClient: widget.httpClientFactory?.call(),
      onSignedOut: () => session.signedOutByServer(),
      onUpdateRequired: (store, message) => updateGate.require(storeUrl: store, message: message),
      appVersion: '${AppConfig.appVersion} ${defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : defaultTargetPlatform.name.toLowerCase()}',
    );
    auth = AuthRepository(api);
    meetups = MeetupsRepository(api, widget.trips);
    onboarding = OnboardingRepository(api);
    // When a session ends, nothing of that person stays on the device: saved meetups and unsent quiz answers.
    session = Session(api, auth, clearDevice: () async {
      await meetups.forgetDevice();
      await widget.quizStore.clear();
    }, onboarding: onboarding)..restore();
    router = buildRouter(session);
    quiz = QuizViewModel(onboarding, widget.quizStore, session);
    signIn = SignInViewModel(auth, session, () => locale.code);
    // a new session never inherits an unlocked inbox, or the previous person's answers and phone number
    var was = session.status;
    session.addListener(() {
      final now = session.status;
      if (now == SessionStatus.signedOut) privacyLock.unlocked = false;
      if (now == SessionStatus.signedOut && (was == SessionStatus.signedIn || was == SessionStatus.offline)) {
        quiz.reset();
        signIn.reset();
      }
      was = now;
    });
  }

  @override
  void dispose() {
    quiz.dispose();
    signIn.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: locale),
        ChangeNotifierProvider.value(value: theme),
        ChangeNotifierProvider.value(value: updateGate),
        ChangeNotifierProvider.value(value: session),
        ChangeNotifierProvider.value(value: privacyLock),
        Provider.value(value: widget.linkOpener),
        Provider.value(value: auth),
        Provider.value(value: meetups),
        Provider.value(value: onboarding),
        ChangeNotifierProvider.value(value: quiz),
        ChangeNotifierProvider.value(value: signIn),
      ],
      child: ListenableBuilder(
        listenable: Listenable.merge([locale, theme]),
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
          themeMode: theme.mode,
          themeAnimationCurve: HzMotion.easingInOut, // a colour change, not an arrival
          routerConfig: router,
          // a required update replaces everything (NMX-61)
          builder: (context, child) => PrivacyCover(
            child: ListenableBuilder(listenable: updateGate, builder: (context, _) => updateGate.required ? const UpdateScreen() : child!),
          ),
        ),
      ),
    );
  }
}
