// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get brand => 'HerZone';

  @override
  String get staging => 'Staging';

  @override
  String get back => 'Back';

  @override
  String get retry => 'Try again';

  @override
  String get signOut => 'Sign out';

  @override
  String get phoneTitle => 'Your mobile number';

  @override
  String get phoneHelp =>
      'We\'ll send you a 6-digit code. We currently accept Qatar numbers only.';

  @override
  String get phoneLabel => 'Mobile number';

  @override
  String get phoneInvalid =>
      'Enter 8 digits starting with a digit from 3 to 7.';

  @override
  String get sendCode => 'Send code';

  @override
  String get otpTitle => 'Enter the code';

  @override
  String get otpHelp => 'We sent a code to';

  @override
  String get otpLabel => 'Verification code';

  @override
  String get verify => 'Verify';

  @override
  String get resend => 'Resend code';

  @override
  String resendIn(int s) {
    return 'Resend in ${s}s';
  }

  @override
  String get devCode => 'Staging: the code is';

  @override
  String get tabHome => 'Home';

  @override
  String get tabEvents => 'My events';

  @override
  String get tabInbox => 'Notifications';

  @override
  String get tabProfile => 'Account';

  @override
  String get errGeneric => 'Something went wrong. Please try again.';

  @override
  String get offline => 'You\'re offline.';

  @override
  String get comingSoon =>
      'This screen is being built in the app. Everything is available now on herzone.app.';

  @override
  String get language => 'العربية';
}
