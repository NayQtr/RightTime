import 'package:flutter/widgets.dart';
import 'package:local_auth/local_auth.dart';

/// Face ID / fingerprint (or the phone's passcode) before private details are shown (NMX-52, decision of 2 Nov:
/// generic text on the lock screen, the details only after the owner of the phone is confirmed).
abstract interface class DeviceUnlock {
  /// true when the person holding the phone is its owner, or when the phone has no lock at all (nothing to check).
  Future<bool> unlock(String reason);
}

class LocalDeviceUnlock implements DeviceUnlock {
  LocalDeviceUnlock([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();
  final LocalAuthentication _auth;

  @override
  Future<bool> unlock(String reason) async {
    try {
      if (!await _auth.isDeviceSupported()) return true;
      return await _auth.authenticate(localizedReason: reason);
    } catch (_) {
      return false;
    }
  }
}

class AlwaysUnlock implements DeviceUnlock {
  int calls = 0;
  bool allow = true;

  @override
  Future<bool> unlock(String reason) async {
    calls++;
    return allow;
  }
}

/// Unlocked until the app goes to the background; then the next view asks again.
class PrivacyLock extends ChangeNotifier with WidgetsBindingObserver {
  PrivacyLock(this._unlock) {
    WidgetsBinding.instance.addObserver(this);
  }

  final DeviceUnlock _unlock;
  bool unlocked = false;

  Future<bool> unlock(String reason) async {
    unlocked = await _unlock.unlock(reason);
    notifyListeners();
    return unlocked;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      unlocked = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
