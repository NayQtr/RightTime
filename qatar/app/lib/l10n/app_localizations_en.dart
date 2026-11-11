// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get idCheckPending =>
      'We are reviewing the payment details of your booking. We will show you the venue and table code after the review.';

  @override
  String get cIdentity =>
      'The name on the payment card does not match the account';

  @override
  String get casesTitle => 'Decisions about you';

  @override
  String get noCases => 'There are no decisions about you.';

  @override
  String appealUntil(String date) {
    return 'You can appeal until $date';
  }

  @override
  String get appeal => 'Appeal';

  @override
  String get appealSent =>
      'We received your appeal. Someone who did not make the original decision will review it.';

  @override
  String get docsTitle => 'Terms and privacy';

  @override
  String get docTerms => 'Terms';

  @override
  String get docConduct => 'Code of conduct';

  @override
  String get docPrivacy => 'Privacy notice';

  @override
  String get updateTitle => 'Update HerZone';

  @override
  String get updateBody =>
      'A newer version of HerZone is available. Please update the app to continue.';

  @override
  String get updateButton => 'Update the app';

  @override
  String get openMap => 'Open in Maps';

  @override
  String get deleteAccount => 'Request account deletion';

  @override
  String get deleteConfirm =>
      'We\'ll delete your data under our retention policy. Are you sure?';

  @override
  String get deleteYes => 'Delete my account';

  @override
  String get deleteNo => 'Keep my account';

  @override
  String get brand => 'HerZone';

  @override
  String get staging => 'Staging';

  @override
  String get back => 'Back';

  @override
  String get retry => 'Try again';

  @override
  String get nextEvent => 'Your next event';

  @override
  String get loading => 'Loading…';

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
  String get themeToDark => 'Dark mode';

  @override
  String get themeToLight => 'Light mode';

  @override
  String get sounds => 'Sounds';

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
  String get notifyMe => 'Notify me when a session opens';

  @override
  String get notifyMeOn =>
      'We\'ll let you know when a session in your language opens.';

  @override
  String get filterDay => 'Day';

  @override
  String get filterAll => 'All';

  @override
  String get noFilterMatch => 'No sessions match this choice.';

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
  String get welcomeHeroEm => 'get you';

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
  String get timeLeftOne => 'About a minute left';

  @override
  String get timeLeftTwo => 'About 2 minutes left';

  @override
  String get timeLeftFew => 'A few minutes left';

  @override
  String get timeLeftUnder => 'Less than a minute left';

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
  String get nameLabel => 'Your first name, as on your payment card';

  @override
  String get nameHelp =>
      'Shown to your tablemates on the day of the event. We also match it with the name on your payment card, to keep meetups safe.';

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

  @override
  String get cancelBooking => 'Cancel booking';

  @override
  String get confirmCancel => 'Confirm cancellation';

  @override
  String get cancelled => 'Your booking has been cancelled.';

  @override
  String refundFull(String fee, int days) {
    return 'You\'ll get $fee back to your card within $days business days.';
  }

  @override
  String refundNone(String deadline) {
    return 'The refund deadline has passed ($deadline). The organising fee isn\'t refunded.';
  }

  @override
  String get refundNoPayment =>
      'You haven\'t paid yet, so there\'s nothing to refund.';

  @override
  String get reasonLegend => 'Reason (optional)';

  @override
  String get reasonSchedule => 'My plans changed';

  @override
  String get reasonIllness => 'Illness';

  @override
  String get reasonOther => 'Another reason';

  @override
  String get contactLegend => 'Contact after the event';

  @override
  String get contactHelp =>
      'Ask a tablemate you\'d like to see again. If she accepts, you both get a WhatsApp button. We never tell anyone if a request isn\'t accepted.';

  @override
  String get contactSend => 'Ask to stay in touch';

  @override
  String get contactSent => 'Request sent';

  @override
  String get contactIncoming => 'would like to stay in touch';

  @override
  String get contactAccept => 'Accept';

  @override
  String get contactDecline => 'Decline';

  @override
  String get contactWhatsapp => 'WhatsApp';

  @override
  String contactUntil(String date) {
    return 'Open until $date';
  }

  @override
  String get contactClosed => 'Contact requests for this meetup are closed.';

  @override
  String get contactDeclined => 'Done. We won\'t tell her you declined.';

  @override
  String get contactAccepted => 'Done. You both now have a WhatsApp button.';

  @override
  String get unnamed => 'Guest';

  @override
  String get privateReport => 'Private report';

  @override
  String get reportIntro =>
      'Your report is confidential. We won\'t reveal your identity to the person reported.';

  @override
  String get category => 'What happened?';

  @override
  String get cHarassment => 'Harassment';

  @override
  String get cThreat => 'Threat or violence';

  @override
  String get cPhoto => 'Photographed without consent';

  @override
  String get cStalking => 'Stalking or unwanted contact';

  @override
  String get cFraud => 'Fraud';

  @override
  String get cDisruptive => 'Disruptive or disrespectful behaviour';

  @override
  String get whenLegend => 'When did it happen?';

  @override
  String get during => 'During the event';

  @override
  String get afterEv => 'After the event';

  @override
  String get whoLegend => 'Who? (optional)';

  @override
  String get notSure => 'I don\'t know / prefer not to say';

  @override
  String get describe => 'Tell us what happened (optional)';

  @override
  String get dangerLabel => 'I\'m in danger right now';

  @override
  String get submitReport => 'Send report';

  @override
  String reportSent(String caseRef) {
    return 'We received your report ($caseRef). We won\'t reveal your identity to the person reported.';
  }

  @override
  String get emTitle => 'Call emergency services on 999 now';

  @override
  String get emCall => 'Call 999';

  @override
  String get emBody =>
      'Your safety comes first. Call emergency services and ask the venue staff for help. Our coordinator on duty has been alerted.';

  @override
  String get contactRequest => 'Request contact';

  @override
  String get csPhone => 'Phone call';

  @override
  String get csChat => 'WhatsApp chat';

  @override
  String get csRequest => 'Request contact';

  @override
  String get csRequestSub => 'A short note on the problem or request first';

  @override
  String get csCallNow => 'Call us now';

  @override
  String get csCallNowSub => 'You\'ll call us by phone right away';

  @override
  String get csMessageLabel => 'Describe the problem or request';

  @override
  String get csPhoneLabel => 'Confirm your contact number';

  @override
  String get csWhenLabel => 'Best time to call';

  @override
  String get csWhenNow => 'Now';

  @override
  String get csWhen10 => 'In 10 minutes';

  @override
  String get csWhen60 => 'In an hour';

  @override
  String get csWhenTomorrow => 'Tomorrow';

  @override
  String get csSend => 'Send request';

  @override
  String get csMessageNeeded => 'Please write the problem or request.';

  @override
  String get csPhoneBad => 'That phone number isn\'t valid.';

  @override
  String waHello(Object who) {
    return 'Hello, I\'m $who, I have a problem/request';
  }

  @override
  String get waHelloAnon => 'Hello, I have a problem/request';

  @override
  String get callRequested => 'We got your request. We will call you.';

  @override
  String get backHome => 'Back to home';

  @override
  String get inboxLocked =>
      'Your notifications are protected. Open them with Face ID, your fingerprint or your phone\'s passcode.';

  @override
  String get unlock => 'Open';

  @override
  String get unlockReason => 'To show your HerZone notifications';

  @override
  String get bookSeat => 'Book your seat';

  @override
  String get occasionLegend => 'Are you celebrating an occasion on this date?';

  @override
  String get occasionBirthday => 'My birthday';

  @override
  String get occasionOther => 'Another occasion';

  @override
  String get occasionNo => 'No';

  @override
  String occasionNotice(int days) {
    return 'Celebrations need at least $days days\' notice.';
  }

  @override
  String get celebrationBirthday =>
      'One of the guests is celebrating her birthday';

  @override
  String get celebrationOther =>
      'One of the guests is celebrating a special occasion';

  @override
  String get errGenericNext => 'If it happens again, contact us.';

  @override
  String get qatarOnly => 'We currently accept Qatar numbers only.';

  @override
  String get reviewTitle => 'Review your booking';

  @override
  String get payNow => 'Pay now';

  @override
  String get lateAck =>
      'I understand and agree that the organising fee isn\'t refunded if I cancel this booking.';

  @override
  String policyBox(String deadline) {
    return 'You can cancel with a full refund until $deadline. If the table doesn\'t fill, we cancel it and refund you in full or move you to another session — your choice.';
  }

  @override
  String get lateWarning =>
      'This meetup is soon: if you cancel after paying, the organising fee isn\'t refunded.';

  @override
  String get serviceFee => 'Organising fee';

  @override
  String holdUntil(String time) {
    return 'Your seat is held for you until $time.';
  }

  @override
  String get waitingPayment =>
      'Finish paying on the page that opened, then come back here.';

  @override
  String get checkPayment => 'Check payment';

  @override
  String get paidTitle => 'Paid. We\'re forming your table now.';

  @override
  String get payFailed =>
      'The payment didn\'t go through. You can try again while the seat is held.';

  @override
  String get holdExpired =>
      'Your seat hold has ended. Please choose the session again.';

  @override
  String get foodNote => 'You pay the venue directly for your food and drinks.';

  @override
  String get imHere => 'I\'m here';

  @override
  String get checkedIn => 'You\'re checked in';

  @override
  String get rateIt => 'Rate the event';

  @override
  String get fbThanks => 'Thank you! We received your feedback.';

  @override
  String get fbTitle => 'How was it?';

  @override
  String get overall => 'Overall rating';

  @override
  String get comfort => 'Did you feel comfortable in the conversation?';

  @override
  String get venueRating => 'Venue rating (optional)';

  @override
  String get fbReasonsLegend => 'What didn\'t work for you? (optional)';

  @override
  String get fbReasonTable => 'Fit with my table';

  @override
  String get fbReasonVenue => 'Venue';

  @override
  String get fbReasonFood => 'Food or service';

  @override
  String get fbReasonOrg => 'Organisation and timing';

  @override
  String get fbReasonNoShows => 'Some guests didn\'t come';

  @override
  String get commentLabel => 'Private comment (optional)';

  @override
  String get send => 'Send';

  @override
  String get wouldBookAgain => 'I\'d book again';

  @override
  String get commentHelp => 'No one at your table will see it';

  @override
  String get alternateTag => 'From your alternates';

  @override
  String get chooseNow => 'Choose now';

  @override
  String get confirmChoice => 'Confirm my choice';

  @override
  String defaultRefund(String deadline) {
    return 'If you don\'t choose before $deadline, we\'ll refund you in full automatically.';
  }

  @override
  String get optRebook => 'Another session';

  @override
  String get optRebookHelp => 'We transfer your fee as it is.';

  @override
  String get optRefund => 'Full refund';

  @override
  String optRefundHelp(String fee, int days) {
    return '$fee to your original payment method within $days business days.';
  }

  @override
  String get orgBody =>
      'The minimum (4 women) wasn\'t reached for this session, so we cancelled the table. You won\'t pay anything.';

  @override
  String get orgTitle => 'Sorry, your table didn\'t fill';

  @override
  String get stOrganizer =>
      'We cancelled this table. Choose: refund or another session.';

  @override
  String rebookedInto(String ref) {
    return 'We moved you to booking $ref.';
  }
}
