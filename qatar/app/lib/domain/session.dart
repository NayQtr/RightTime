import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/api_error.dart';
import '../data/auth_repository.dart';

enum SessionStatus { unknown, signedOut, signedIn, offline }

/// The one place that knows whether the member is signed in. The router listens to it (redirects), screens read it.
/// No network never signs her out: it becomes [SessionStatus.offline] until the next successful refresh.
class Session extends ChangeNotifier {
  Session(this._api, this._auth);

  final ApiClient _api;
  final AuthRepository _auth;

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
      _set(SessionStatus.signedIn);
    } on ApiError catch (e) {
      _set(e.isOffline ? SessionStatus.offline : SessionStatus.signedOut);
    }
  }

  /// Called by the API client when the server ends the session (refresh refused).
  void signedOutByServer() {
    me = null;
    _set(SessionStatus.signedOut);
  }

  Future<void> signOut() async {
    await _auth.signOut();
    me = null;
    _set(SessionStatus.signedOut);
  }

  void _set(SessionStatus s) {
    status = s;
    notifyListeners();
  }
}
