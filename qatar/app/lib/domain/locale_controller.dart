import 'package:flutter/widgets.dart';

/// Arabic first (right to left); English on request. The API answers in the same language (Accept-Language).
class LocaleController extends ChangeNotifier {
  Locale locale = const Locale('ar');

  String get code => locale.languageCode;

  void toggle() {
    locale = Locale(code == 'ar' ? 'en' : 'ar');
    notifyListeners();
  }
}
