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

  @override
  String get dinner => 'Dinner';

  @override
  String get coffee => 'Coffee';

  @override
  String seatsLeft(int n) {
    return '$n seats left';
  }

  @override
  String get full => 'Full';

  @override
  String get alreadyBooked => 'Booked';

  @override
  String get langAr => 'Arabic table';

  @override
  String get langEn => 'English table';

  @override
  String get noSessions =>
      'There are no sessions in your languages right now. We run Arabic and English tables only.';

  @override
  String get cityFull => 'Doha, Qatar';

  @override
  String get dateTime => 'Date & time';

  @override
  String get district => 'Area';

  @override
  String get tableLanguage => 'Table language';

  @override
  String get bookingRef => 'Booking ref';

  @override
  String get viewDetails => 'View details';

  @override
  String get detailsTitle => 'Event details';

  @override
  String get yourTable => 'Your table';

  @override
  String confirmedCount(int n) {
    return '$n women confirmed';
  }

  @override
  String get arrival => 'Arrival instructions';

  @override
  String get tableCode => 'Your table code';

  @override
  String get mentionCode =>
      'Mention \"HerZone\" and the table code at reception.';

  @override
  String venueHidden(String revealAt) {
    return 'We reveal the venue name and address after the table is confirmed, at $revealAt.';
  }

  @override
  String get foodBandLabel => 'Food budget';

  @override
  String get noNotifications => 'No notifications yet.';

  @override
  String get inboxEmptyBody => 'Updates about your meetups will appear here.';

  @override
  String get noBookings => 'You haven\'t booked a meetup yet.';

  @override
  String get bookOnWeb =>
      'Booking and payment are available now on herzone.app and are coming to the app soon.';

  @override
  String offlineCopy(String at) {
    return 'You\'re offline. This is the copy saved on your device ($at).';
  }

  @override
  String get step1 => 'Paid';

  @override
  String get step2 => 'Forming the table';

  @override
  String get step3 => 'Table confirmed';

  @override
  String get step4 => 'Venue revealed';

  @override
  String get tablemates => 'Your tablemates';

  @override
  String get welcomeHero => 'Meet people who get you.';

  @override
  String get welcomeSub =>
      'A table of 4 to 6 women, in your language and within your budget, in Doha.';

  @override
  String get getStarted => 'Get started';

  @override
  String get quizLength => 'Short questions that take a few minutes.';

  @override
  String get haveAccount => 'I already have an account';

  @override
  String get deviceNote =>
      'We keep your progress on this device only until you sign up, so you can pick up where you left off.';

  @override
  String qOf(int i, int n) {
    return '$i of $n';
  }

  @override
  String chooseUpTo(int n) {
    return 'Choose up to $n';
  }

  @override
  String get next => 'Next';

  @override
  String get skipQ => 'Skip';

  @override
  String get continueLabel => 'Continue';

  @override
  String get quizDoneTitle => 'Thank you';

  @override
  String get quizDoneBody =>
      'One last step: your mobile number, so we save your answers to your account.';

  @override
  String get saveAnswers => 'Save my answers';

  @override
  String get regTitle => 'Before we start';

  @override
  String get nameLabel => 'Your first name or nickname (optional)';

  @override
  String get nameHelp =>
      'Shown to your tablemates on the day of the event only.';

  @override
  String get womenOnly => 'HerZone is for women only.';

  @override
  String get womanLabel => 'I confirm I am a woman';

  @override
  String get ageLabel => 'I confirm I am 18 or older';

  @override
  String get termsLabel => 'I accept the terms';

  @override
  String get conductLabel => 'I accept the code of conduct';

  @override
  String get privacyLabel => 'I have read the privacy notice';

  @override
  String get marketingLabel => 'Send me marketing messages (optional)';

  @override
  String get readDoc => 'Read';

  @override
  String get required => 'Required';

  @override
  String get close => 'Close';

  @override
  String get myAnswers => 'My answers';
}
