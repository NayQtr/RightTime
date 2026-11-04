// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get brand => 'HerZone';

  @override
  String get staging => 'نسخة تجريبية';

  @override
  String get back => 'رجوع';

  @override
  String get retry => 'حاولي مرة أخرى';

  @override
  String get signOut => 'تسجيل الخروج';

  @override
  String get phoneTitle => 'رقم جوالك';

  @override
  String get phoneHelp =>
      'نرسل لكِ رمزًا من 6 أرقام. نقبل أرقام قطر فقط حاليًا.';

  @override
  String get phoneLabel => 'رقم الجوال';

  @override
  String get phoneInvalid => 'أدخلي 8 أرقام تبدأ بأحد الأرقام من 3 إلى 7.';

  @override
  String get sendCode => 'أرسلي الرمز';

  @override
  String get otpTitle => 'أدخلي الرمز';

  @override
  String get otpHelp => 'أرسلنا رمزًا إلى';

  @override
  String get otpLabel => 'رمز التحقق';

  @override
  String get verify => 'تحقّقي';

  @override
  String get resend => 'إعادة الإرسال';

  @override
  String resendIn(int s) {
    return 'إعادة الإرسال بعد $s ث';
  }

  @override
  String get devCode => 'بيئة تجريبية: الرمز هو';

  @override
  String get tabHome => 'الرئيسية';

  @override
  String get tabEvents => 'لقاءاتي';

  @override
  String get tabInbox => 'الإشعارات';

  @override
  String get tabProfile => 'حسابي';

  @override
  String get errGeneric => 'حدث خطأ. حاولي مرة أخرى.';

  @override
  String get offline => 'لا يوجد اتصال بالإنترنت.';

  @override
  String get comingSoon =>
      'هذه الشاشة قيد البناء في التطبيق. كل شيء متاح الآن على herzone.app.';

  @override
  String get language => 'English';
}
