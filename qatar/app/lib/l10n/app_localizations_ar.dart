// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get idCheckPending =>
      'نراجع بيانات الدفع لحجزك. سنكشف لكِ المكان ورمز الطاولة بعد المراجعة.';

  @override
  String get cIdentity => 'اسم بطاقة الدفع لا يطابق اسم الحساب';

  @override
  String get casesTitle => 'قرارات تخصّك';

  @override
  String get noCases => 'لا توجد قرارات تخصّك.';

  @override
  String appealUntil(String date) {
    return 'يمكنكِ الاعتراض حتى $date';
  }

  @override
  String get appeal => 'اعتراض';

  @override
  String get appealSent =>
      'استلمنا اعتراضكِ. سيراجعه شخص لم يتخذ القرار الأصلي.';

  @override
  String get docsTitle => 'الشروط والخصوصية';

  @override
  String get docTerms => 'الشروط';

  @override
  String get docConduct => 'قواعد السلوك';

  @override
  String get docPrivacy => 'إشعار الخصوصية';

  @override
  String get updateTitle => 'حدّثي HerZone';

  @override
  String get updateBody =>
      'يتوفر إصدار أحدث من HerZone. حدّثي التطبيق للمتابعة.';

  @override
  String get updateButton => 'تحديث التطبيق';

  @override
  String get openMap => 'افتحي المكان في الخريطة';

  @override
  String get deleteAccount => 'طلب حذف الحساب';

  @override
  String get deleteConfirm =>
      'سنحذف بياناتك وفق سياسة الاحتفاظ. هل أنتِ متأكدة؟';

  @override
  String get deleteYes => 'حذف حسابي';

  @override
  String get deleteNo => 'تراجع';

  @override
  String get brand => 'HerZone';

  @override
  String get staging => 'نسخة تجريبية';

  @override
  String get back => 'رجوع';

  @override
  String get retry => 'حاولي مرة أخرى';

  @override
  String get nextEvent => 'لقاؤك القادم';

  @override
  String get loading => 'جارٍ التحميل…';

  @override
  String get signOut => 'تسجيل الخروج';

  @override
  String get phoneTitle => 'رقم جوالك';

  @override
  String get phoneHelp => 'نرسل لكِ رمزًا من 6 أرقام.';

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
  String get themeToDark => 'الوضع الداكن';

  @override
  String get themeToLight => 'الوضع العادي';

  @override
  String get sounds => 'الأصوات';

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
  String get notifyMe => 'أعلميني عند توفر موعد';

  @override
  String get notifyMeOn => 'سنُعلمكِ عند توفر موعد بلغتك.';

  @override
  String get filterDay => 'اليوم';

  @override
  String get filterAll => 'الكل';

  @override
  String get noFilterMatch => 'لا مواعيد بهذا الاختيار.';

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
  String get welcomeHeroEm => 'تفهمك';

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
  String get timeLeftOne => 'بقي نحو دقيقة واحدة';

  @override
  String get timeLeftTwo => 'بقي نحو دقيقتين';

  @override
  String get timeLeftFew => 'بقي نحو بضعة دقائق';

  @override
  String get timeLeftUnder => 'بقيت أقل من دقيقة';

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
  String get nameLabel => 'اسمك الأول كما في بطاقة الدفع';

  @override
  String get nameHelp =>
      'يظهر لزميلات الطاولة يوم اللقاء. ونطابقه مع الاسم على بطاقة الدفع لحماية اللقاءات.';

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
  String get contactRequest => 'طلب تواصل';

  @override
  String get csPhone => 'اتصال هاتفي';

  @override
  String get csChat => 'محادثة واتساب';

  @override
  String get csRequest => 'طلب تواصل';

  @override
  String get csRequestSub => 'شرح بسيط للمشكلة/الطلب قبل التواصل';

  @override
  String get csCallNow => 'اتصل بنا الان';

  @override
  String get csCallNowSub => 'سوف تتصل بنا هاتفيا فوراً';

  @override
  String get csMessageLabel => 'اشرحي المشكلة أو الطلب';

  @override
  String get csPhoneLabel => 'تأكيد هاتف التواصل';

  @override
  String get csWhenLabel => 'الوقت المناسب للاتصال';

  @override
  String get csWhenNow => 'الان';

  @override
  String get csWhen10 => 'بعد 10 دقايق';

  @override
  String get csWhen60 => 'بعد ساعة';

  @override
  String get csWhenTomorrow => 'غدا';

  @override
  String get csSend => 'إرسال الطلب';

  @override
  String get csMessageNeeded => 'اكتبي المشكلة أو الطلب أولاً.';

  @override
  String get csPhoneBad => 'رقم الهاتف غير صحيح.';

  @override
  String waHello(Object who) {
    return 'مرحباً ، انا $who ، لدي مشكلة/طلب';
  }

  @override
  String get waHelloAnon => 'مرحباً ، لدي مشكلة/طلب';

  @override
  String get callRequested => 'وصلنا طلبك. سيتم الاتصال بكِ من قبلنا.';

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
  String get occasionLegend => 'هل تحتفلين بمناسبة في هذا الموعد؟';

  @override
  String get occasionBirthday => 'عيد ميلادي';

  @override
  String get occasionOther => 'مناسبة أخرى';

  @override
  String get occasionNo => 'لا';

  @override
  String occasionNotice(int days) {
    return 'الاحتفال بمناسبة يحتاج إلى حجز قبل $days أيام على الأقل.';
  }

  @override
  String get celebrationBirthday => 'إحدى الضيفات تحتفل بعيد ميلادها';

  @override
  String get celebrationOther => 'إحدى الضيفات تحتفل بمناسبة خاصة';

  @override
  String get errGenericNext => 'إن تكرّر الخطأ، تواصلي معنا.';

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
  String get feeLaunchFree => 'مجاني لفترة محدودة';

  @override
  String get feeLaunchNote =>
      'يُخصم المبلغ للتحقق من البطاقة ويُرد إليكِ كاملًا.';

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
  String get fbReasonsLegend => 'ما الذي لم يعجبكِ؟ (اختياري)';

  @override
  String get fbReasonTable => 'الانسجام مع الطاولة';

  @override
  String get fbReasonVenue => 'المكان';

  @override
  String get fbReasonFood => 'الطعام أو الخدمة';

  @override
  String get fbReasonOrg => 'التنظيم والمواعيد';

  @override
  String get fbReasonNoShows => 'غياب بعض الحاضرات';

  @override
  String get commentLabel => 'تعليق خاص (اختياري)';

  @override
  String get send => 'إرسال';

  @override
  String get wouldBookAgain => 'سأحجز مرة أخرى';

  @override
  String get commentHelp => 'لن يراه أحد من الطاولة';

  @override
  String get alternateTag => 'من بدائلك';

  @override
  String get chooseNow => 'اختاري الآن';

  @override
  String get confirmChoice => 'تأكيد اختياري';

  @override
  String defaultRefund(String deadline) {
    return 'إن لم تختاري قبل $deadline سنرد المبلغ كاملًا تلقائيًا.';
  }

  @override
  String get optRebook => 'موعد آخر';

  @override
  String get optRebookHelp => 'ننقل رسمك كما هو.';

  @override
  String get optRefund => 'استرداد كامل';

  @override
  String optRefundHelp(String fee, int days) {
    return '$fee إلى وسيلة الدفع الأصلية خلال $days أيام عمل.';
  }

  @override
  String get orgBody =>
      'لم يكتمل الحد الأدنى (4 سيدات) لهذا الموعد، لذلك ألغينا الطاولة. لا تتحملين أي رسوم.';

  @override
  String get orgTitle => 'نعتذر، لم تكتمل طاولتك';

  @override
  String get stOrganizer => 'ألغينا هذه الطاولة. اختاري: استرداد أو موعد آخر.';

  @override
  String rebookedInto(String ref) {
    return 'نقلناك إلى الحجز $ref.';
  }
}
