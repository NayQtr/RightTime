import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Light or dark: follows the device until she picks one; the choice is remembered on this device (like the website's
/// `q_theme`). If the device store is unavailable the app simply follows the device.
class ThemeController extends ChangeNotifier {
  static const _key = 'theme';
  ThemeMode mode = ThemeMode.system;

  Future<void> load() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getString(_key);
      final m = switch (saved) { 'light' => ThemeMode.light, 'dark' => ThemeMode.dark, _ => null };
      if (m != null && m != mode) {
        mode = m;
        notifyListeners();
      }
    } catch (_) {/* no store: follow the device */}
  }

  bool isDark(Brightness device) => mode == ThemeMode.dark || (mode == ThemeMode.system && device == Brightness.dark);

  /// Switches to the other theme from what is on screen now, and remembers it.
  void toggle(Brightness device) {
    mode = isDark(device) ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
    SharedPreferences.getInstance().then((p) => p.setString(_key, mode == ThemeMode.dark ? 'dark' : 'light')).catchError((_) => false);
  }
}
