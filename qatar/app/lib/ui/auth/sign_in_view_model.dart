import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api_error.dart';
import '../../data/auth_repository.dart';
import '../../domain/session.dart';

/// State of the two sign-in screens (phone, then code). One view model for both, so the challenge survives the step.
class SignInViewModel extends ChangeNotifier {
  SignInViewModel(this._auth, this._session, this._locale);

  final AuthRepository _auth;
  final Session _session;
  final String Function() _locale;

  Challenge? challenge;
  bool busy = false;
  ApiError? error;
  bool phoneInvalid = false;
  int resendIn = 0;
  Timer? _timer;

  /// Forgets the previous phone number and code challenge when a session ends on this device (app review #5).
  void reset() {
    _timer?.cancel();
    challenge = null;
    busy = false;
    error = null;
    phoneInvalid = false;
    resendIn = 0;
    notifyListeners();
  }

  Future<bool> sendCode(String local) async {
    final phone = AuthRepository.toE164(local);
    phoneInvalid = phone == null;
    error = null;
    if (phone == null) {
      notifyListeners();
      return false;
    }
    return _run(() async {
      challenge = await _auth.requestCode(phone, _locale());
      _startCountdown(challenge!.resendAfter);
    });
  }

  Future<bool> resend() async {
    final c = challenge;
    if (c == null || resendIn > 0) return false;
    return _run(() async {
      challenge = await _auth.requestCode(c.phone, _locale());
      _startCountdown(challenge!.resendAfter);
    });
  }

  Future<bool> verify(String code) {
    final c = challenge;
    if (c == null) return Future.value(false);
    return _run(() async {
      await _auth.verify(c, code.trim(), _locale());
      await _session.loadMe();
    });
  }

  Future<bool> _run(Future<void> Function() f) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await f();
      return true;
    } on ApiError catch (e) {
      error = e;
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  void _startCountdown(int seconds) {
    _timer?.cancel();
    resendIn = seconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      resendIn = resendIn > 0 ? resendIn - 1 : 0;
      if (resendIn == 0) t.cancel();
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
