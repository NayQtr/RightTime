import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/api_error.dart';
import '../data/auth_repository.dart';
import '../data/onboarding.dart';

enum SessionStatus { unknown, signedOut, signedIn, offline }

/// The one place that knows whether the member is signed in. The router listens to it (redirects), screens read it.
/// No network never signs her out: it becomes [SessionStatus.offline] until the next successful refresh.
class Session extends ChangeNotifier {
  Session(this._api, this._auth, {this.clearDevice, this.onboarding});

  final ApiClient _api;
  final AuthRepository _auth;

  /// Removes what this device keeps for the member (saved meetup details) when the session ends.
  final Future<void> Function()? clearDevice;
  final OnboardingRepository? onboarding;

  /// Signed in but sign-up not finished (name, women-only and age confirmation, consents).
  bool needsRegistration = false;

  /// Registered but has never submitted the questionnaire.
  bool needsQuiz = false;

  SessionStatus status = SessionStatus.unknown;
  Me? me;

  Future<void> restore() async {
    if (await _api.tokens.readRefreshToken() == null) return _set(SessionStatus.signedOut);
    final r = await _api.refresh();
    if (r == RefreshOutcome.signedOut) return _set(SessionStatus.signedOut);
    if (r == RefreshOutcome.offline) return _set(SessionStatus.offline);
    await loadMe();
  }

  Future<void> loadMe() async {
    try {
      me = await _auth.me();
      needsRegistration = me!.registrationStatus != 'complete';
      needsQuiz = !needsRegistration && onboarding != null && !(await onboarding!.current()).submitted;
      _set(SessionStatus.signedIn);
    } on ApiError catch (e) {
      _set(e.isOffline ? SessionStatus.offline : SessionStatus.signedOut);
    }
  }

  /// Called by the API client when the server ends the session (refresh refused).
  void signedOutByServer() {
    me = null;
    clearDevice?.call();
    _set(SessionStatus.signedOut);
  }

  Future<void> signOut() async {
    await _auth.signOut();
    await clearDevice?.call();
    me = null;
    _set(SessionStatus.signedOut);
  }

  void _set(SessionStatus s) {
    status = s;
    notifyListeners();
  }
}
