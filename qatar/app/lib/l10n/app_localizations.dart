import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  /// No description provided for @idCheckPending.
  ///
  /// In ar, this message translates to:
  /// **'نراجع بيانات الدفع لحجزك. سنكشف لكِ المكان ورمز الطاولة بعد المراجعة.'**
  String get idCheckPending;

  /// No description provided for @cIdentity.
  ///
  /// In ar, this message translates to:
  /// **'اسم بطاقة الدفع لا يطابق اسم الحساب'**
  String get cIdentity;

  /// No description provided for @casesTitle.
  ///
  /// In ar, this message translates to:
  /// **'قرارات تخصّك'**
  String get casesTitle;

  /// No description provided for @noCases.
  ///
  /// In ar, this message translates to:
  /// **'لا توجد قرارات تخصّك.'**
  String get noCases;

  /// No description provided for @appealUntil.
  ///
  /// In ar, this message translates to:
  /// **'يمكنكِ الاعتراض حتى {date}'**
  String appealUntil(String date);

  /// No description provided for @appeal.
  ///
  /// In ar, this message translates to:
  /// **'اعتراض'**
  String get appeal;

  /// No description provided for @appealSent.
  ///
  /// In ar, this message translates to:
  /// **'استلمنا اعتراضكِ. سيراجعه شخص لم يتخذ القرار الأصلي.'**
  String get appealSent;

  /// No description provided for @docsTitle.
  ///
  /// In ar, this message translates to:
  /// **'الشروط والخصوصية'**
  String get docsTitle;

  /// No description provided for @docTerms.
  ///
  /// In ar, this message translates to:
  /// **'الشروط'**
  String get docTerms;

  /// No description provided for @docConduct.
  ///
  /// In ar, this message translates to:
  /// **'قواعد السلوك'**
  String get docConduct;

  /// No description provided for @docPrivacy.
  ///
  /// In ar, this message translates to:
  /// **'إشعار الخصوصية'**
  String get docPrivacy;

  /// No description provided for @updateTitle.
  ///
  /// In ar, this message translates to:
  /// **'حدّثي HerZone'**
  String get updateTitle;

  /// No description provided for @updateBody.
  ///
  /// In ar, this message translates to:
  /// **'يتوفر إصدار أحدث من HerZone. حدّثي التطبيق للمتابعة.'**
  String get updateBody;

  /// No description provided for @updateButton.
  ///
  /// In ar, this message translates to:
  /// **'تحديث التطبيق'**
  String get updateButton;

  /// No description provided for @openMap.
  ///
  /// In ar, this message translates to:
  /// **'افتحي المكان في الخريطة'**
  String get openMap;

  /// No description provided for @deleteAccount.
  ///
  /// In ar, this message translates to:
  /// **'طلب حذف الحساب'**
  String get deleteAccount;

  /// No description provided for @deleteConfirm.
  ///
  /// In ar, this message translates to:
  /// **'سنحذف بياناتك وفق سياسة الاحتفاظ. هل أنتِ متأكدة؟'**
  String get deleteConfirm;

  /// No description provided for @deleteYes.
  ///
  /// In ar, this message translates to:
  /// **'حذف حسابي'**
  String get deleteYes;

  /// No description provided for @deleteNo.
  ///
  /// In ar, this message translates to:
  /// **'تراجع'**
  String get deleteNo;

  /// No description provided for @brand.
  ///
  /// In ar, this message translates to:
  /// **'HerZone'**
  String get brand;

  /// No description provided for @staging.
  ///
  /// In ar, this message translates to:
  /// **'نسخة تجريبية'**
  String get staging;

  /// No description provided for @back.
  ///
  /// In ar, this message translates to:
  /// **'رجوع'**
  String get back;

  /// No description provided for @retry.
  ///
  /// In ar, this message translates to:
  /// **'حاولي مرة أخرى'**
  String get retry;

  /// No description provided for @nextEvent.
  ///
  /// In ar, this message translates to:
  /// **'لقاؤك القادم'**
  String get nextEvent;

  /// No description provided for @loading.
  ///
  /// In ar, this message translates to:
  /// **'جارٍ التحميل…'**
  String get loading;

  /// No description provided for @signOut.
  ///
  /// In ar, this message translates to:
  /// **'تسجيل الخروج'**
  String get signOut;

  /// No description provided for @phoneTitle.
  ///
  /// In ar, this message translates to:
  /// **'رقم جوالك'**
  String get phoneTitle;

  /// No description provided for @phoneHelp.
  ///
  /// In ar, this message translates to:
  /// **'نرسل لكِ رمزًا من 6 أرقام.'**
  String get phoneHelp;

  /// No description provided for @phoneLabel.
  ///
  /// In ar, this message translates to:
  /// **'رقم الجوال'**
  String get phoneLabel;

  /// No description provided for @phoneInvalid.
  ///
  /// In ar, this message translates to:
  /// **'أدخلي 8 أرقام تبدأ بأحد الأرقام من 3 إلى 7.'**
  String get phoneInvalid;

  /// No description provided for @sendCode.
  ///
  /// In ar, this message translates to:
  /// **'أرسلي الرمز'**
  String get sendCode;

  /// No description provided for @otpTitle.
  ///
  /// In ar, this message translates to:
  /// **'أدخلي الرمز'**
  String get otpTitle;

  /// No description provided for @otpHelp.
  ///
  /// In ar, this message translates to:
  /// **'أرسلنا رمزًا إلى'**
  String get otpHelp;

  /// No description provided for @otpLabel.
  ///
  /// In ar, this message translates to:
  /// **'رمز التحقق'**
  String get otpLabel;

  /// No description provided for @verify.
  ///
  /// In ar, this message translates to:
  /// **'تحقّقي'**
  String get verify;

  /// No description provided for @resend.
  ///
  /// In ar, this message translates to:
  /// **'إعادة الإرسال'**
  String get resend;

  /// No description provided for @resendIn.
  ///
  /// In ar, this message translates to:
  /// **'إعادة الإرسال بعد {s} ث'**
  String resendIn(int s);

  /// No description provided for @devCode.
  ///
  /// In ar, this message translates to:
  /// **'بيئة تجريبية: الرمز هو'**
  String get devCode;

  /// No description provided for @tabHome.
  ///
  /// In ar, this message translates to:
  /// **'الرئيسية'**
  String get tabHome;

  /// No description provided for @tabEvents.
  ///
  /// In ar, this message translates to:
  /// **'لقاءاتي'**
  String get tabEvents;

  /// No description provided for @tabInbox.
  ///
  /// In ar, this message translates to:
  /// **'الإشعارات'**
  String get tabInbox;

  /// No description provided for @tabProfile.
  ///
  /// In ar, this message translates to:
  /// **'حسابي'**
  String get tabProfile;

  /// No description provided for @errGeneric.
  ///
  /// In ar, this message translates to:
  /// **'حدث خطأ. حاولي مرة أخرى.'**
  String get errGeneric;

  /// No description provided for @offline.
  ///
  /// In ar, this message translates to:
  /// **'لا يوجد اتصال بالإنترنت.'**
  String get offline;

  /// No description provided for @comingSoon.
  ///
  /// In ar, this message translates to:
  /// **'هذه الشاشة قيد البناء في التطبيق. كل شيء متاح الآن على herzone.app.'**
  String get comingSoon;

  /// No description provided for @language.
  ///
  /// In ar, this message translates to:
  /// **'English'**
  String get language;

  /// No description provided for @themeToDark.
  ///
  /// In ar, this message translates to:
  /// **'الوضع الداكن'**
  String get themeToDark;

  /// No description provided for @themeToLight.
  ///
  /// In ar, this message translates to:
  /// **'الوضع العادي'**
  String get themeToLight;

  /// PROVISIONAL (10 Nov, item 26): the switch for interface sounds in the account tab
  ///
  /// In ar, this message translates to:
  /// **'الأصوات'**
  String get sounds;

  /// No description provided for @dinner.
  ///
  /// In ar, this message translates to:
  /// **'عشاء'**
  String get dinner;

  /// No description provided for @coffee.
  ///
  /// In ar, this message translates to:
  /// **'قهوة'**
  String get coffee;

  /// No description provided for @seatsLeft.
  ///
  /// In ar, this message translates to:
  /// **'{n} مقاعد متبقية'**
  String seatsLeft(int n);

  /// No description provided for @full.
  ///
  /// In ar, this message translates to:
  /// **'ممتلئ'**
  String get full;

  /// No description provided for @alreadyBooked.
  ///
  /// In ar, this message translates to:
  /// **'محجوز'**
  String get alreadyBooked;

  /// No description provided for @langAr.
  ///
  /// In ar, this message translates to:
  /// **'طاولة بالعربية'**
  String get langAr;

  /// No description provided for @langEn.
  ///
  /// In ar, this message translates to:
  /// **'طاولة بالإنجليزية'**
  String get langEn;

  /// No description provided for @noSessions.
  ///
  /// In ar, this message translates to:
  /// **'لا توجد حاليًا مواعيد بلغة تختارينها. نُنظّم طاولات بالعربية والإنجليزية فقط.'**
  String get noSessions;

  /// No description provided for @notifyMe.
  ///
  /// In ar, this message translates to:
  /// **'أعلميني عند توفر موعد'**
  String get notifyMe;

  /// No description provided for @notifyMeOn.
  ///
  /// In ar, this message translates to:
  /// **'سنُعلمكِ عند توفر موعد بلغتك.'**
  String get notifyMeOn;

  /// No description provided for @filterDay.
  ///
  /// In ar, this message translates to:
  /// **'اليوم'**
  String get filterDay;

  /// No description provided for @filterAll.
  ///
  /// In ar, this message translates to:
  /// **'الكل'**
  String get filterAll;

  /// No description provided for @noFilterMatch.
  ///
  /// In ar, this message translates to:
  /// **'لا مواعيد بهذا الاختيار.'**
  String get noFilterMatch;

  /// No description provided for @cityFull.
  ///
  /// In ar, this message translates to:
  /// **'الدوحة، قطر'**
  String get cityFull;

  /// No description provided for @dateTime.
  ///
  /// In ar, this message translates to:
  /// **'الموعد'**
  String get dateTime;

  /// No description provided for @district.
  ///
  /// In ar, this message translates to:
  /// **'المنطقة'**
  String get district;

  /// No description provided for @tableLanguage.
  ///
  /// In ar, this message translates to:
  /// **'لغة الطاولة'**
  String get tableLanguage;

  /// No description provided for @bookingRef.
  ///
  /// In ar, this message translates to:
  /// **'رقم الحجز'**
  String get bookingRef;

  /// No description provided for @viewDetails.
  ///
  /// In ar, this message translates to:
  /// **'عرض التفاصيل'**
  String get viewDetails;

  /// No description provided for @detailsTitle.
  ///
  /// In ar, this message translates to:
  /// **'تفاصيل اللقاء'**
  String get detailsTitle;

  /// No description provided for @yourTable.
  ///
  /// In ar, this message translates to:
  /// **'طاولتك'**
  String get yourTable;

  /// No description provided for @confirmedCount.
  ///
  /// In ar, this message translates to:
  /// **'{n} سيدات مؤكدات'**
  String confirmedCount(int n);

  /// No description provided for @arrival.
  ///
  /// In ar, this message translates to:
  /// **'تعليمات الوصول'**
  String get arrival;

  /// No description provided for @tableCode.
  ///
  /// In ar, this message translates to:
  /// **'رمز طاولتك'**
  String get tableCode;

  /// No description provided for @mentionCode.
  ///
  /// In ar, this message translates to:
  /// **'اذكري \"HerZone\" ورمز الطاولة لموظف الاستقبال.'**
  String get mentionCode;

  /// No description provided for @venueHidden.
  ///
  /// In ar, this message translates to:
  /// **'نكشف اسم المكان وعنوانه بعد تأكيد الطاولة، في {revealAt}.'**
  String venueHidden(String revealAt);

  /// No description provided for @foodBandLabel.
  ///
  /// In ar, this message translates to:
  /// **'ميزانية الطعام'**
  String get foodBandLabel;

  /// No description provided for @noNotifications.
  ///
  /// In ar, this message translates to:
  /// **'لا إشعارات بعد.'**
  String get noNotifications;

  /// No description provided for @inboxEmptyBody.
  ///
  /// In ar, this message translates to:
  /// **'ستجدين هنا تحديثات لقاءاتك.'**
  String get inboxEmptyBody;

  /// No description provided for @noBookings.
  ///
  /// In ar, this message translates to:
  /// **'لم تحجزي أي لقاء بعد.'**
  String get noBookings;

  /// No description provided for @bookOnWeb.
  ///
  /// In ar, this message translates to:
  /// **'الحجز والدفع متاحان الآن على herzone.app، ويصلان إلى التطبيق قريبًا.'**
  String get bookOnWeb;

  /// No description provided for @offlineCopy.
  ///
  /// In ar, this message translates to:
  /// **'أنتِ غير متصلة. هذه آخر نسخة محفوظة على جهازكِ ({at}).'**
  String offlineCopy(String at);

  /// No description provided for @step1.
  ///
  /// In ar, this message translates to:
  /// **'تم الدفع'**
  String get step1;

  /// No description provided for @step2.
  ///
  /// In ar, this message translates to:
  /// **'تكوين الطاولة'**
  String get step2;

  /// No description provided for @step3.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد الطاولة'**
  String get step3;

  /// No description provided for @step4.
  ///
  /// In ar, this message translates to:
  /// **'كشف المكان'**
  String get step4;

  /// No description provided for @tablemates.
  ///
  /// In ar, this message translates to:
  /// **'زميلات الطاولة'**
  String get tablemates;

  /// No description provided for @welcomeHero.
  ///
  /// In ar, this message translates to:
  /// **'تعرّفي على ناس.. تفهمك'**
  String get welcomeHero;

  /// No description provided for @welcomeHeroEm.
  ///
  /// In ar, this message translates to:
  /// **'تفهمك'**
  String get welcomeHeroEm;

  /// No description provided for @welcomeSub.
  ///
  /// In ar, this message translates to:
  /// **'طاولة من 4 إلى 6 سيدات، بلغتك وضمن ميزانيتك، في الدوحة.'**
  String get welcomeSub;

  /// No description provided for @getStarted.
  ///
  /// In ar, this message translates to:
  /// **'ابدئي'**
  String get getStarted;

  /// No description provided for @quizLength.
  ///
  /// In ar, this message translates to:
  /// **'أسئلة قصيرة تأخذ دقائق قليلة.'**
  String get quizLength;

  /// No description provided for @haveAccount.
  ///
  /// In ar, this message translates to:
  /// **'لديّ حساب'**
  String get haveAccount;

  /// No description provided for @deviceNote.
  ///
  /// In ar, this message translates to:
  /// **'نحفظ تقدّمك على هذا الجهاز فقط حتى تسجّلي، لتكملي لاحقًا من حيث توقفتِ.'**
  String get deviceNote;

  /// No description provided for @qOf.
  ///
  /// In ar, this message translates to:
  /// **'{i} من {n}'**
  String qOf(int i, int n);

  /// No description provided for @timeLeftOne.
  ///
  /// In ar, this message translates to:
  /// **'بقي نحو دقيقة واحدة'**
  String get timeLeftOne;

  /// No description provided for @timeLeftTwo.
  ///
  /// In ar, this message translates to:
  /// **'بقي نحو دقيقتين'**
  String get timeLeftTwo;

  /// No description provided for @timeLeftFew.
  ///
  /// In ar, this message translates to:
  /// **'بقي نحو بضعة دقائق'**
  String get timeLeftFew;

  /// No description provided for @timeLeftUnder.
  ///
  /// In ar, this message translates to:
  /// **'بقيت أقل من دقيقة'**
  String get timeLeftUnder;

  /// No description provided for @chooseUpTo.
  ///
  /// In ar, this message translates to:
  /// **'اختاري حتى {n}'**
  String chooseUpTo(int n);

  /// No description provided for @next.
  ///
  /// In ar, this message translates to:
  /// **'التالي'**
  String get next;

  /// No description provided for @skipQ.
  ///
  /// In ar, this message translates to:
  /// **'تخطَّي'**
  String get skipQ;

  /// No description provided for @continueLabel.
  ///
  /// In ar, this message translates to:
  /// **'متابعة'**
  String get continueLabel;

  /// No description provided for @quizDoneTitle.
  ///
  /// In ar, this message translates to:
  /// **'شكرًا لكِ'**
  String get quizDoneTitle;

  /// No description provided for @quizDoneBody.
  ///
  /// In ar, this message translates to:
  /// **'خطوة أخيرة: رقم جوالك لنحفظ إجاباتك في حسابك.'**
  String get quizDoneBody;

  /// No description provided for @saveAnswers.
  ///
  /// In ar, this message translates to:
  /// **'احفظي إجاباتي'**
  String get saveAnswers;

  /// No description provided for @regTitle.
  ///
  /// In ar, this message translates to:
  /// **'قبل أن نبدأ'**
  String get regTitle;

  /// No description provided for @nameLabel.
  ///
  /// In ar, this message translates to:
  /// **'اسمك الأول كما في بطاقة الدفع'**
  String get nameLabel;

  /// No description provided for @nameHelp.
  ///
  /// In ar, this message translates to:
  /// **'يظهر لزميلات الطاولة يوم اللقاء. ونطابقه مع الاسم على بطاقة الدفع لحماية اللقاءات.'**
  String get nameHelp;

  /// No description provided for @womenOnly.
  ///
  /// In ar, this message translates to:
  /// **'HerZone للنساء فقط.'**
  String get womenOnly;

  /// No description provided for @womanLabel.
  ///
  /// In ar, this message translates to:
  /// **'أؤكد أنني امرأة'**
  String get womanLabel;

  /// No description provided for @ageLabel.
  ///
  /// In ar, this message translates to:
  /// **'أؤكد أن عمري 18 عامًا أو أكثر'**
  String get ageLabel;

  /// No description provided for @termsLabel.
  ///
  /// In ar, this message translates to:
  /// **'أوافق على الشروط'**
  String get termsLabel;

  /// No description provided for @conductLabel.
  ///
  /// In ar, this message translates to:
  /// **'أوافق على قواعد السلوك'**
  String get conductLabel;

  /// No description provided for @privacyLabel.
  ///
  /// In ar, this message translates to:
  /// **'قرأت إشعار الخصوصية'**
  String get privacyLabel;

  /// No description provided for @marketingLabel.
  ///
  /// In ar, this message translates to:
  /// **'أرغب في رسائل تسويقية (اختياري)'**
  String get marketingLabel;

  /// No description provided for @readDoc.
  ///
  /// In ar, this message translates to:
  /// **'اقرئي'**
  String get readDoc;

  /// No description provided for @required.
  ///
  /// In ar, this message translates to:
  /// **'مطلوب'**
  String get required;

  /// No description provided for @close.
  ///
  /// In ar, this message translates to:
  /// **'إغلاق'**
  String get close;

  /// No description provided for @myAnswers.
  ///
  /// In ar, this message translates to:
  /// **'إجاباتي'**
  String get myAnswers;

  /// No description provided for @cancelBooking.
  ///
  /// In ar, this message translates to:
  /// **'إلغاء الحجز'**
  String get cancelBooking;

  /// No description provided for @confirmCancel.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد الإلغاء'**
  String get confirmCancel;

  /// No description provided for @cancelled.
  ///
  /// In ar, this message translates to:
  /// **'تم إلغاء حجزك.'**
  String get cancelled;

  /// No description provided for @refundFull.
  ///
  /// In ar, this message translates to:
  /// **'ستستردين {fee} كاملة إلى بطاقتك خلال {days} أيام عمل.'**
  String refundFull(String fee, int days);

  /// No description provided for @refundNone.
  ///
  /// In ar, this message translates to:
  /// **'انتهت مهلة الاسترداد ({deadline}). لن يُرد رسم التنظيم.'**
  String refundNone(String deadline);

  /// No description provided for @refundNoPayment.
  ///
  /// In ar, this message translates to:
  /// **'لم يتم الدفع بعد، فلا يوجد مبلغ للاسترداد.'**
  String get refundNoPayment;

  /// No description provided for @reasonLegend.
  ///
  /// In ar, this message translates to:
  /// **'السبب (اختياري)'**
  String get reasonLegend;

  /// No description provided for @reasonSchedule.
  ///
  /// In ar, this message translates to:
  /// **'تغيّر موعدي'**
  String get reasonSchedule;

  /// No description provided for @reasonIllness.
  ///
  /// In ar, this message translates to:
  /// **'مرض'**
  String get reasonIllness;

  /// No description provided for @reasonOther.
  ///
  /// In ar, this message translates to:
  /// **'سبب آخر'**
  String get reasonOther;

  /// No description provided for @contactLegend.
  ///
  /// In ar, this message translates to:
  /// **'التواصل بعد اللقاء'**
  String get contactLegend;

  /// No description provided for @contactHelp.
  ///
  /// In ar, this message translates to:
  /// **'أرسلي طلب تواصل لمن ترغبين بلقائها مجددًا. إن قبلت، يظهر لكما زر واتساب. لا نخبر أحدًا إن لم يُقبل الطلب.'**
  String get contactHelp;

  /// No description provided for @contactSend.
  ///
  /// In ar, this message translates to:
  /// **'طلب تواصل'**
  String get contactSend;

  /// No description provided for @contactSent.
  ///
  /// In ar, this message translates to:
  /// **'أُرسل الطلب'**
  String get contactSent;

  /// No description provided for @contactIncoming.
  ///
  /// In ar, this message translates to:
  /// **'ترغب بالتواصل معكِ'**
  String get contactIncoming;

  /// No description provided for @contactAccept.
  ///
  /// In ar, this message translates to:
  /// **'قبول'**
  String get contactAccept;

  /// No description provided for @contactDecline.
  ///
  /// In ar, this message translates to:
  /// **'اعتذار'**
  String get contactDecline;

  /// No description provided for @contactWhatsapp.
  ///
  /// In ar, this message translates to:
  /// **'واتساب'**
  String get contactWhatsapp;

  /// No description provided for @contactUntil.
  ///
  /// In ar, this message translates to:
  /// **'متاح حتى {date}'**
  String contactUntil(String date);

  /// No description provided for @contactClosed.
  ///
  /// In ar, this message translates to:
  /// **'انتهت مدة طلبات التواصل لهذا اللقاء.'**
  String get contactClosed;

  /// No description provided for @contactDeclined.
  ///
  /// In ar, this message translates to:
  /// **'تم. لن نخبرها باعتذاركِ.'**
  String get contactDeclined;

  /// No description provided for @contactAccepted.
  ///
  /// In ar, this message translates to:
  /// **'تم. يظهر لكما الآن زر واتساب.'**
  String get contactAccepted;

  /// No description provided for @unnamed.
  ///
  /// In ar, this message translates to:
  /// **'ضيفة'**
  String get unnamed;

  /// No description provided for @privateReport.
  ///
  /// In ar, this message translates to:
  /// **'إبلاغ خاص'**
  String get privateReport;

  /// No description provided for @reportIntro.
  ///
  /// In ar, this message translates to:
  /// **'بلاغك سري. لن نكشف هويتك للشخص المُبلَّغ عنه.'**
  String get reportIntro;

  /// No description provided for @category.
  ///
  /// In ar, this message translates to:
  /// **'نوع المشكلة'**
  String get category;

  /// No description provided for @cHarassment.
  ///
  /// In ar, this message translates to:
  /// **'تحرش أو إزعاج'**
  String get cHarassment;

  /// No description provided for @cThreat.
  ///
  /// In ar, this message translates to:
  /// **'تهديد أو عنف'**
  String get cThreat;

  /// No description provided for @cPhoto.
  ///
  /// In ar, this message translates to:
  /// **'تصوير دون إذن'**
  String get cPhoto;

  /// No description provided for @cStalking.
  ///
  /// In ar, this message translates to:
  /// **'ملاحقة أو تواصل غير مرغوب'**
  String get cStalking;

  /// No description provided for @cFraud.
  ///
  /// In ar, this message translates to:
  /// **'احتيال'**
  String get cFraud;

  /// No description provided for @cDisruptive.
  ///
  /// In ar, this message translates to:
  /// **'سلوك مزعج أو غير محترم'**
  String get cDisruptive;

  /// No description provided for @whenLegend.
  ///
  /// In ar, this message translates to:
  /// **'متى حدث ذلك؟'**
  String get whenLegend;

  /// No description provided for @during.
  ///
  /// In ar, this message translates to:
  /// **'أثناء اللقاء'**
  String get during;

  /// No description provided for @afterEv.
  ///
  /// In ar, this message translates to:
  /// **'بعد اللقاء'**
  String get afterEv;

  /// No description provided for @whoLegend.
  ///
  /// In ar, this message translates to:
  /// **'من الشخص؟ (اختياري)'**
  String get whoLegend;

  /// No description provided for @notSure.
  ///
  /// In ar, this message translates to:
  /// **'لا أعرف / لا أريد التحديد'**
  String get notSure;

  /// No description provided for @describe.
  ///
  /// In ar, this message translates to:
  /// **'ماذا حدث؟ (اختياري)'**
  String get describe;

  /// No description provided for @dangerLabel.
  ///
  /// In ar, this message translates to:
  /// **'أنا في خطر الآن'**
  String get dangerLabel;

  /// No description provided for @submitReport.
  ///
  /// In ar, this message translates to:
  /// **'إرسال البلاغ'**
  String get submitReport;

  /// No description provided for @reportSent.
  ///
  /// In ar, this message translates to:
  /// **'وصلنا بلاغك ({caseRef}). لن نكشف هويتك للشخص المُبلَّغ عنه.'**
  String reportSent(String caseRef);

  /// No description provided for @emTitle.
  ///
  /// In ar, this message translates to:
  /// **'اتصلي بالطوارئ 999 فورًا'**
  String get emTitle;

  /// No description provided for @emCall.
  ///
  /// In ar, this message translates to:
  /// **'اتصال 999'**
  String get emCall;

  /// No description provided for @emBody.
  ///
  /// In ar, this message translates to:
  /// **'سلامتكِ أولًا. اتصلي بالطوارئ، واطلبي مساعدة موظفي المكان. أبلغنا منسّقنا المناوب.'**
  String get emBody;

  /// No description provided for @contactRequest.
  ///
  /// In ar, this message translates to:
  /// **'طلب تواصل'**
  String get contactRequest;

  /// No description provided for @csPhone.
  ///
  /// In ar, this message translates to:
  /// **'اتصال هاتفي'**
  String get csPhone;

  /// No description provided for @csChat.
  ///
  /// In ar, this message translates to:
  /// **'محادثة واتساب'**
  String get csChat;

  /// No description provided for @csRequest.
  ///
  /// In ar, this message translates to:
  /// **'طلب تواصل'**
  String get csRequest;

  /// No description provided for @csRequestSub.
  ///
  /// In ar, this message translates to:
  /// **'شرح بسيط للمشكلة/الطلب قبل التواصل'**
  String get csRequestSub;

  /// No description provided for @csCallNow.
  ///
  /// In ar, this message translates to:
  /// **'اتصل بنا الان'**
  String get csCallNow;

  /// No description provided for @csCallNowSub.
  ///
  /// In ar, this message translates to:
  /// **'سوف تتصل بنا هاتفيا فوراً'**
  String get csCallNowSub;

  /// No description provided for @csMessageLabel.
  ///
  /// In ar, this message translates to:
  /// **'اشرحي المشكلة أو الطلب'**
  String get csMessageLabel;

  /// No description provided for @csPhoneLabel.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد هاتف التواصل'**
  String get csPhoneLabel;

  /// No description provided for @csWhenLabel.
  ///
  /// In ar, this message translates to:
  /// **'الوقت المناسب للاتصال'**
  String get csWhenLabel;

  /// No description provided for @csWhenNow.
  ///
  /// In ar, this message translates to:
  /// **'الان'**
  String get csWhenNow;

  /// No description provided for @csWhen10.
  ///
  /// In ar, this message translates to:
  /// **'بعد 10 دقايق'**
  String get csWhen10;

  /// No description provided for @csWhen60.
  ///
  /// In ar, this message translates to:
  /// **'بعد ساعة'**
  String get csWhen60;

  /// No description provided for @csWhenTomorrow.
  ///
  /// In ar, this message translates to:
  /// **'غدا'**
  String get csWhenTomorrow;

  /// No description provided for @csSend.
  ///
  /// In ar, this message translates to:
  /// **'إرسال الطلب'**
  String get csSend;

  /// No description provided for @csMessageNeeded.
  ///
  /// In ar, this message translates to:
  /// **'اكتبي المشكلة أو الطلب أولاً.'**
  String get csMessageNeeded;

  /// No description provided for @csPhoneBad.
  ///
  /// In ar, this message translates to:
  /// **'رقم الهاتف غير صحيح.'**
  String get csPhoneBad;

  /// No description provided for @waHello.
  ///
  /// In ar, this message translates to:
  /// **'مرحباً ، انا {who} ، لدي مشكلة/طلب'**
  String waHello(Object who);

  /// No description provided for @waHelloAnon.
  ///
  /// In ar, this message translates to:
  /// **'مرحباً ، لدي مشكلة/طلب'**
  String get waHelloAnon;

  /// No description provided for @callRequested.
  ///
  /// In ar, this message translates to:
  /// **'وصلنا طلبك. سيتم الاتصال بكِ من قبلنا.'**
  String get callRequested;

  /// No description provided for @backHome.
  ///
  /// In ar, this message translates to:
  /// **'العودة إلى الرئيسية'**
  String get backHome;

  /// No description provided for @inboxLocked.
  ///
  /// In ar, this message translates to:
  /// **'إشعاراتك محمية. افتحيها بالبصمة أو بوجهك أو برمز جوالك.'**
  String get inboxLocked;

  /// No description provided for @unlock.
  ///
  /// In ar, this message translates to:
  /// **'افتحي'**
  String get unlock;

  /// No description provided for @unlockReason.
  ///
  /// In ar, this message translates to:
  /// **'لعرض إشعاراتك في HerZone'**
  String get unlockReason;

  /// No description provided for @bookSeat.
  ///
  /// In ar, this message translates to:
  /// **'احجزي مقعدك'**
  String get bookSeat;

  /// No description provided for @occasionLegend.
  ///
  /// In ar, this message translates to:
  /// **'هل تحتفلين بمناسبة في هذا الموعد؟'**
  String get occasionLegend;

  /// No description provided for @occasionBirthday.
  ///
  /// In ar, this message translates to:
  /// **'عيد ميلادي'**
  String get occasionBirthday;

  /// No description provided for @occasionOther.
  ///
  /// In ar, this message translates to:
  /// **'مناسبة أخرى'**
  String get occasionOther;

  /// No description provided for @occasionNo.
  ///
  /// In ar, this message translates to:
  /// **'لا'**
  String get occasionNo;

  /// Provisional (10 Nov, item 32): shown instead of the occasion question when the session is too close
  ///
  /// In ar, this message translates to:
  /// **'الاحتفال بمناسبة يحتاج إلى حجز قبل {days} أيام على الأقل.'**
  String occasionNotice(int days);

  /// No description provided for @celebrationBirthday.
  ///
  /// In ar, this message translates to:
  /// **'إحدى الضيفات تحتفل بعيد ميلادها'**
  String get celebrationBirthday;

  /// No description provided for @celebrationOther.
  ///
  /// In ar, this message translates to:
  /// **'إحدى الضيفات تحتفل بمناسبة خاصة'**
  String get celebrationOther;

  /// No description provided for @errGenericNext.
  ///
  /// In ar, this message translates to:
  /// **'إن تكرّر الخطأ، تواصلي معنا.'**
  String get errGenericNext;

  /// No description provided for @reviewTitle.
  ///
  /// In ar, this message translates to:
  /// **'راجعي حجزك'**
  String get reviewTitle;

  /// No description provided for @payNow.
  ///
  /// In ar, this message translates to:
  /// **'ادفعي الآن'**
  String get payNow;

  /// No description provided for @lateAck.
  ///
  /// In ar, this message translates to:
  /// **'أفهم وأوافق على أن رسم التنظيم لا يُسترد إذا ألغيت هذا الحجز.'**
  String get lateAck;

  /// No description provided for @policyBox.
  ///
  /// In ar, this message translates to:
  /// **'يمكنك الإلغاء مع استرداد كامل حتى {deadline}. إذا لم تكتمل الطاولة نُلغيها ونرد المبلغ كاملًا أو ننقلك لموعد آخر باختيارك.'**
  String policyBox(String deadline);

  /// No description provided for @lateWarning.
  ///
  /// In ar, this message translates to:
  /// **'موعد هذا اللقاء قريب: إذا ألغيتِ بعد الدفع فلن يُسترد رسم التنظيم.'**
  String get lateWarning;

  /// No description provided for @serviceFee.
  ///
  /// In ar, this message translates to:
  /// **'رسم التنظيم'**
  String get serviceFee;

  /// No description provided for @feeLaunchFree.
  ///
  /// In ar, this message translates to:
  /// **'مجاني لفترة محدودة'**
  String get feeLaunchFree;

  /// No description provided for @feeLaunchNote.
  ///
  /// In ar, this message translates to:
  /// **'يُخصم المبلغ للتحقق من البطاقة ويُرد إليكِ كاملًا.'**
  String get feeLaunchNote;

  /// No description provided for @holdUntil.
  ///
  /// In ar, this message translates to:
  /// **'مقعدك محجوز لكِ حتى {time}.'**
  String holdUntil(String time);

  /// No description provided for @waitingPayment.
  ///
  /// In ar, this message translates to:
  /// **'أكملي الدفع في الصفحة التي فُتحت، ثم عودي إلى هنا.'**
  String get waitingPayment;

  /// No description provided for @checkPayment.
  ///
  /// In ar, this message translates to:
  /// **'تحققي من الدفع'**
  String get checkPayment;

  /// No description provided for @paidTitle.
  ///
  /// In ar, this message translates to:
  /// **'تم الدفع. نجمع طاولتك الآن.'**
  String get paidTitle;

  /// No description provided for @payFailed.
  ///
  /// In ar, this message translates to:
  /// **'لم يكتمل الدفع. يمكنكِ المحاولة مرة أخرى ما دام المقعد محجوزًا.'**
  String get payFailed;

  /// No description provided for @holdExpired.
  ///
  /// In ar, this message translates to:
  /// **'انتهت مدة حجز المقعد. اختاري الموعد مرة أخرى.'**
  String get holdExpired;

  /// No description provided for @foodNote.
  ///
  /// In ar, this message translates to:
  /// **'طعامكِ وشرابكِ تدفعينه للمكان مباشرة.'**
  String get foodNote;

  /// No description provided for @imHere.
  ///
  /// In ar, this message translates to:
  /// **'أنا هنا'**
  String get imHere;

  /// No description provided for @checkedIn.
  ///
  /// In ar, this message translates to:
  /// **'تم تسجيل وصولك'**
  String get checkedIn;

  /// No description provided for @rateIt.
  ///
  /// In ar, this message translates to:
  /// **'قيّمي اللقاء'**
  String get rateIt;

  /// No description provided for @fbThanks.
  ///
  /// In ar, this message translates to:
  /// **'شكرًا! وصلنا تقييمك.'**
  String get fbThanks;

  /// No description provided for @fbTitle.
  ///
  /// In ar, this message translates to:
  /// **'كيف كانت التجربة؟'**
  String get fbTitle;

  /// No description provided for @overall.
  ///
  /// In ar, this message translates to:
  /// **'التقييم العام'**
  String get overall;

  /// No description provided for @comfort.
  ///
  /// In ar, this message translates to:
  /// **'هل شعرتِ بالراحة في الحوار؟'**
  String get comfort;

  /// No description provided for @venueRating.
  ///
  /// In ar, this message translates to:
  /// **'تقييم المكان (اختياري)'**
  String get venueRating;

  /// No description provided for @fbReasonsLegend.
  ///
  /// In ar, this message translates to:
  /// **'ما الذي لم يعجبكِ؟ (اختياري)'**
  String get fbReasonsLegend;

  /// No description provided for @fbReasonTable.
  ///
  /// In ar, this message translates to:
  /// **'الانسجام مع الطاولة'**
  String get fbReasonTable;

  /// No description provided for @fbReasonVenue.
  ///
  /// In ar, this message translates to:
  /// **'المكان'**
  String get fbReasonVenue;

  /// No description provided for @fbReasonFood.
  ///
  /// In ar, this message translates to:
  /// **'الطعام أو الخدمة'**
  String get fbReasonFood;

  /// No description provided for @fbReasonOrg.
  ///
  /// In ar, this message translates to:
  /// **'التنظيم والمواعيد'**
  String get fbReasonOrg;

  /// No description provided for @fbReasonNoShows.
  ///
  /// In ar, this message translates to:
  /// **'غياب بعض الحاضرات'**
  String get fbReasonNoShows;

  /// No description provided for @commentLabel.
  ///
  /// In ar, this message translates to:
  /// **'تعليق خاص (اختياري)'**
  String get commentLabel;

  /// No description provided for @send.
  ///
  /// In ar, this message translates to:
  /// **'إرسال'**
  String get send;

  /// No description provided for @wouldBookAgain.
  ///
  /// In ar, this message translates to:
  /// **'سأحجز مرة أخرى'**
  String get wouldBookAgain;

  /// No description provided for @commentHelp.
  ///
  /// In ar, this message translates to:
  /// **'لن يراه أحد من الطاولة'**
  String get commentHelp;

  /// No description provided for @alternateTag.
  ///
  /// In ar, this message translates to:
  /// **'من بدائلك'**
  String get alternateTag;

  /// No description provided for @chooseNow.
  ///
  /// In ar, this message translates to:
  /// **'اختاري الآن'**
  String get chooseNow;

  /// No description provided for @confirmChoice.
  ///
  /// In ar, this message translates to:
  /// **'تأكيد اختياري'**
  String get confirmChoice;

  /// No description provided for @defaultRefund.
  ///
  /// In ar, this message translates to:
  /// **'إن لم تختاري قبل {deadline} سنرد المبلغ كاملًا تلقائيًا.'**
  String defaultRefund(String deadline);

  /// No description provided for @optRebook.
  ///
  /// In ar, this message translates to:
  /// **'موعد آخر'**
  String get optRebook;

  /// No description provided for @optRebookHelp.
  ///
  /// In ar, this message translates to:
  /// **'ننقل رسمك كما هو.'**
  String get optRebookHelp;

  /// No description provided for @optRefund.
  ///
  /// In ar, this message translates to:
  /// **'استرداد كامل'**
  String get optRefund;

  /// No description provided for @optRefundHelp.
  ///
  /// In ar, this message translates to:
  /// **'{fee} إلى وسيلة الدفع الأصلية خلال {days} أيام عمل.'**
  String optRefundHelp(String fee, int days);

  /// No description provided for @orgBody.
  ///
  /// In ar, this message translates to:
  /// **'لم يكتمل الحد الأدنى (4 سيدات) لهذا الموعد، لذلك ألغينا الطاولة. لا تتحملين أي رسوم.'**
  String get orgBody;

  /// No description provided for @orgTitle.
  ///
  /// In ar, this message translates to:
  /// **'نعتذر، لم تكتمل طاولتك'**
  String get orgTitle;

  /// No description provided for @stOrganizer.
  ///
  /// In ar, this message translates to:
  /// **'ألغينا هذه الطاولة. اختاري: استرداد أو موعد آخر.'**
  String get stOrganizer;

  /// No description provided for @rebookedInto.
  ///
  /// In ar, this message translates to:
  /// **'نقلناك إلى الحجز {ref}.'**
  String rebookedInto(String ref);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
