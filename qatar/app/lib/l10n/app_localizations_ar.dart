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

  @override
  String get dinner => 'عشاء';

  @override
  String get coffee => 'قهوة';

  @override
  String seatsLeft(int n) {
    return '$n مقاعد متبقية';
  }

  @override
  String get full => 'ممتلئ';

  @override
  String get alreadyBooked => 'محجوز';

  @override
  String get langAr => 'طاولة بالعربية';

  @override
  String get langEn => 'طاولة بالإنجليزية';

  @override
  String get noSessions =>
      'لا توجد حاليًا مواعيد بلغة تختارينها. نُنظّم طاولات بالعربية والإنجليزية فقط.';

  @override
  String get cityFull => 'الدوحة، قطر';

  @override
  String get dateTime => 'الموعد';

  @override
  String get district => 'المنطقة';

  @override
  String get tableLanguage => 'لغة الطاولة';

  @override
  String get bookingRef => 'رقم الحجز';

  @override
  String get viewDetails => 'عرض التفاصيل';

  @override
  String get detailsTitle => 'تفاصيل اللقاء';

  @override
  String get yourTable => 'طاولتك';

  @override
  String confirmedCount(int n) {
    return '$n سيدات مؤكدات';
  }

  @override
  String get arrival => 'تعليمات الوصول';

  @override
  String get tableCode => 'رمز طاولتك';

  @override
  String get mentionCode => 'اذكري \"HerZone\" ورمز الطاولة لموظف الاستقبال.';

  @override
  String venueHidden(String revealAt) {
    return 'نكشف اسم المكان وعنوانه بعد تأكيد الطاولة، في $revealAt.';
  }

  @override
  String get foodBandLabel => 'ميزانية الطعام';

  @override
  String get noNotifications => 'لا إشعارات بعد.';

  @override
  String get inboxEmptyBody => 'ستجدين هنا تحديثات لقاءاتك.';

  @override
  String get noBookings => 'لم تحجزي أي لقاء بعد.';

  @override
  String get bookOnWeb =>
      'الحجز والدفع متاحان الآن على herzone.app، ويصلان إلى التطبيق قريبًا.';

  @override
  String offlineCopy(String at) {
    return 'أنتِ غير متصلة. هذه آخر نسخة محفوظة على جهازكِ ($at).';
  }

  @override
  String get step1 => 'تم الدفع';

  @override
  String get step2 => 'تكوين الطاولة';

  @override
  String get step3 => 'تأكيد الطاولة';

  @override
  String get step4 => 'كشف المكان';

  @override
  String get tablemates => 'زميلات الطاولة';

  @override
  String get welcomeHero => 'تعرّفي على ناس.. تفهمك';

  @override
  String get welcomeSub =>
      'طاولة من 4 إلى 6 سيدات، بلغتك وضمن ميزانيتك، في الدوحة.';

  @override
  String get getStarted => 'ابدئي';

  @override
  String get quizLength => 'أسئلة قصيرة تأخذ دقائق قليلة.';

  @override
  String get haveAccount => 'لديّ حساب';

  @override
  String get deviceNote =>
      'نحفظ تقدّمك على هذا الجهاز فقط حتى تسجّلي، لتكملي لاحقًا من حيث توقفتِ.';

  @override
  String qOf(int i, int n) {
    return '$i من $n';
  }

  @override
  String chooseUpTo(int n) {
    return 'اختاري حتى $n';
  }

  @override
  String get next => 'التالي';

  @override
  String get skipQ => 'تخطَّي';

  @override
  String get continueLabel => 'متابعة';

  @override
  String get quizDoneTitle => 'شكرًا لكِ';

  @override
  String get quizDoneBody => 'خطوة أخيرة: رقم جوالك لنحفظ إجاباتك في حسابك.';

  @override
  String get saveAnswers => 'احفظي إجاباتي';

  @override
  String get regTitle => 'قبل أن نبدأ';

  @override
  String get nameLabel => 'اسمك الأول أو لقبك (اختياري)';

  @override
  String get nameHelp => 'يظهر لزميلات الطاولة يوم اللقاء فقط.';

  @override
  String get womenOnly => 'HerZone للنساء فقط.';

  @override
  String get womanLabel => 'أؤكد أنني امرأة';

  @override
  String get ageLabel => 'أؤكد أن عمري 18 عامًا أو أكثر';

  @override
  String get termsLabel => 'أوافق على الشروط';

  @override
  String get conductLabel => 'أوافق على قواعد السلوك';

  @override
  String get privacyLabel => 'قرأت إشعار الخصوصية';

  @override
  String get marketingLabel => 'أرغب في رسائل تسويقية (اختياري)';

  @override
  String get readDoc => 'اقرئي';

  @override
  String get required => 'مطلوب';

  @override
  String get close => 'إغلاق';

  @override
  String get myAnswers => 'إجاباتي';

  @override
  String get cancelBooking => 'إلغاء الحجز';

  @override
  String get confirmCancel => 'تأكيد الإلغاء';

  @override
  String get cancelled => 'تم إلغاء حجزك.';

  @override
  String refundFull(String fee, int days) {
    return 'ستستردين $fee كاملة إلى بطاقتك خلال $days أيام عمل.';
  }

  @override
  String refundNone(String deadline) {
    return 'انتهت مهلة الاسترداد ($deadline). لن يُرد رسم التنظيم.';
  }

  @override
  String get refundNoPayment => 'لم يتم الدفع بعد، فلا يوجد مبلغ للاسترداد.';

  @override
  String get reasonLegend => 'السبب (اختياري)';

  @override
  String get reasonSchedule => 'تغيّر موعدي';

  @override
  String get reasonIllness => 'مرض';

  @override
  String get reasonOther => 'سبب آخر';

  @override
  String get contactLegend => 'التواصل بعد اللقاء';

  @override
  String get contactHelp =>
      'أرسلي طلب تواصل لمن ترغبين بلقائها مجددًا. إن قبلت، يظهر لكما زر واتساب. لا نخبر أحدًا إن لم يُقبل الطلب.';

  @override
  String get contactSend => 'طلب تواصل';

  @override
  String get contactSent => 'أُرسل الطلب';

  @override
  String get contactIncoming => 'ترغب بالتواصل معكِ';

  @override
  String get contactAccept => 'قبول';

  @override
  String get contactDecline => 'اعتذار';

  @override
  String get contactWhatsapp => 'واتساب';

  @override
  String contactUntil(String date) {
    return 'متاح حتى $date';
  }

  @override
  String get contactClosed => 'انتهت مدة طلبات التواصل لهذا اللقاء.';

  @override
  String get contactDeclined => 'تم. لن نخبرها باعتذاركِ.';

  @override
  String get contactAccepted => 'تم. يظهر لكما الآن زر واتساب.';

  @override
  String get unnamed => 'ضيفة';

  @override
  String get privateReport => 'إبلاغ خاص';

  @override
  String get reportIntro => 'بلاغك سري. لن نكشف هويتك للشخص المُبلَّغ عنه.';

  @override
  String get category => 'نوع المشكلة';

  @override
  String get cHarassment => 'تحرش أو إزعاج';

  @override
  String get cThreat => 'تهديد أو عنف';

  @override
  String get cPhoto => 'تصوير دون إذن';

  @override
  String get cStalking => 'ملاحقة أو تواصل غير مرغوب';

  @override
  String get cFraud => 'احتيال';

  @override
  String get cDisruptive => 'سلوك مزعج أو غير محترم';

  @override
  String get whenLegend => 'متى حدث ذلك؟';

  @override
  String get during => 'أثناء اللقاء';

  @override
  String get afterEv => 'بعد اللقاء';

  @override
  String get whoLegend => 'من الشخص؟ (اختياري)';

  @override
  String get notSure => 'لا أعرف / لا أريد التحديد';

  @override
  String get describe => 'ماذا حدث؟ (اختياري)';

  @override
  String get dangerLabel => 'أنا في خطر الآن';

  @override
  String get submitReport => 'إرسال البلاغ';

  @override
  String reportSent(String caseRef) {
    return 'وصلنا بلاغك ($caseRef). لن نكشف هويتك للشخص المُبلَّغ عنه.';
  }

  @override
  String get emTitle => 'اتصلي بالطوارئ 999 فورًا';

  @override
  String get emCall => 'اتصال 999';

  @override
  String get emBody =>
      'سلامتكِ أولًا. اتصلي بالطوارئ، واطلبي مساعدة موظفي المكان. أبلغنا منسّقنا المناوب.';

  @override
  String get callCoordinator => 'اتصلي بالمنسق';

  @override
  String get whatsappCoordinator => 'واتساب المنسق';

  @override
  String get backHome => 'العودة إلى الرئيسية';

  @override
  String get inboxLocked =>
      'إشعاراتك محمية. افتحيها بالبصمة أو بوجهك أو برمز جوالك.';

  @override
  String get unlock => 'افتحي';

  @override
  String get unlockReason => 'لعرض إشعاراتك في HerZone';

  @override
  String get bookSeat => 'احجزي مقعدك';

  @override
  String get reviewTitle => 'راجعي حجزك';

  @override
  String get payNow => 'ادفعي الآن';

  @override
  String get lateAck =>
      'أفهم وأوافق على أن رسم التنظيم لا يُسترد إذا ألغيت هذا الحجز.';

  @override
  String policyBox(String deadline) {
    return 'يمكنك الإلغاء مع استرداد كامل حتى $deadline. إذا لم تكتمل الطاولة نُلغيها ونرد المبلغ كاملًا أو ننقلك لموعد آخر باختيارك.';
  }

  @override
  String get lateWarning =>
      'موعد هذا اللقاء قريب: إذا ألغيتِ بعد الدفع فلن يُسترد رسم التنظيم.';

  @override
  String get serviceFee => 'رسم التنظيم';

  @override
  String holdUntil(String time) {
    return 'مقعدك محجوز لكِ حتى $time.';
  }

  @override
  String get waitingPayment =>
      'أكملي الدفع في الصفحة التي فُتحت، ثم عودي إلى هنا.';

  @override
  String get checkPayment => 'تحققي من الدفع';

  @override
  String get paidTitle => 'تم الدفع. نجمع طاولتك الآن.';

  @override
  String get payFailed =>
      'لم يكتمل الدفع. يمكنكِ المحاولة مرة أخرى ما دام المقعد محجوزًا.';

  @override
  String get holdExpired => 'انتهت مدة حجز المقعد. اختاري الموعد مرة أخرى.';

  @override
  String get foodNote => 'طعامكِ وشرابكِ تدفعينه للمكان مباشرة.';

  @override
  String get imHere => 'أنا هنا';

  @override
  String get checkedIn => 'تم تسجيل وصولك';

  @override
  String get rateIt => 'قيّمي اللقاء';

  @override
  String get fbThanks => 'شكرًا! وصلنا تقييمك.';

  @override
  String get fbTitle => 'كيف كانت التجربة؟';

  @override
  String get overall => 'التقييم العام';

  @override
  String get comfort => 'هل شعرتِ بالراحة في الحوار؟';

  @override
  String get venueRating => 'تقييم المكان (اختياري)';

  @override
  String get commentLabel => 'تعليق خاص (اختياري)';

  @override
  String get send => 'إرسال';

  @override
  String get wouldBookAgain => 'سأحجز مرة أخرى';

  @override
  String get commentHelp => 'لن يراه أحد من الطاولة';
}
