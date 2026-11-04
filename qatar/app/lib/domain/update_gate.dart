import 'package:flutter/foundation.dart';

/// Forced update (NMX-61). When the server says this version is too old (426 APP_UPDATE_REQUIRED, for example after a
/// security fix), the whole app is replaced by one screen that leads to the store. It stays until the app is updated.
class UpdateGate extends ChangeNotifier {
  bool required = false;
  String? storeUrl;
  String message = '';

  void require({String? storeUrl, String message = ''}) {
    if (required) return;
    required = true;
    this.storeUrl = storeUrl;
    this.message = message;
    notifyListeners();
  }
}
