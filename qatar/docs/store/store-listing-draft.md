# بيانات المتجرين لتطبيق HerZone: مسودة للمراجعة (NMX-58)

**الحالة:** مسودة تراجعينها قبل الرفع. لم يُرفع شيء بعد، لأن حسابي المتجرين لم يُفتحا (NMX-45 و NMX-46).
**التاريخ:** 4 نوفمبر 2026.
**المصدر:** ما يفعله الكود اليوم: التطبيق `qatar/app`، والخادم، والاستبيان المنشور على البيئة التجريبية (21 سؤالًا). أي تغيير في الأسئلة أو المزوّدين يلزمه تحديث هذه البطاقات.

## 1. ما يجمعه التطبيق (الجرد)

| البيان | مطلوب؟ | لماذا | مرتبط بالحساب؟ |
|---|---|---|---|
| رقم الجوال | نعم | الدخول برمز SMS، والتواصل يوم اللقاء | نعم |
| الاسم الأول | لا | يظهر لزميلات الطاولة يوم اللقاء | نعم |
| تأكيد «امرأة» و«18 عامًا أو أكثر» | نعم | شرط الخدمة | نعم |
| إجابات الاستبيان: اللغة، الميزانية، الفئة العمرية (مطلوبة)، والباقي اختياري: الشخصية، الاهتمامات، مجال العمل، الأطفال (Q23)، الحالة الاجتماعية (Q24) | جزئيًا | تكوين الطاولات | نعم |
| الحجوزات وحالتها، وتسجيل الحضور «أنا هنا» | عند الحجز | تنظيم اللقاء | نعم |
| الدفع: نوع البطاقة وآخر 4 أرقام فقط، من بوابة الدفع | عند الدفع | الإيصال والاسترداد | نعم |
| التقييم الخاص بعد اللقاء، والبلاغات، والاعتراضات (نص حر) | اختياري | السلامة والجودة | نعم |
| طلبات التواصل بين الزميلات | اختياري | رقم واتساب يظهر فقط بموافقة الطرفين | نعم |
| تقارير الأعطال وجلسات الاستخدام (Sentry) | تلقائي | اكتشاف الأعطال | **لا:** بلا مستخدم، وبلا IP، ومنقّاة من الأرقام والرموز |

**ما لا يجمعه التطبيق:**
- الموقع الجغرافي
- جهات الاتصال
- الصور
- الصحة
- معرّف الإعلانات
- أي تتبّع بين التطبيقات
- أي مكتبة إعلانات أو تحليلات تسويقية

## 2. Apple: App Privacy

**Data used to track you:** لا شيء (No).

**Data linked to you** (كلها لغرض واحد: App Functionality):

| الفئة في App Store Connect | النوع | ملاحظة |
|---|---|---|
| Contact Info | Phone Number | |
| Contact Info | Name | اختياري |
| Purchases | Purchase History | الحجوزات |
| Financial Info | Payment Info | نوع البطاقة وآخر 4 أرقام. **قرار:** Apple لا تطلب ذكره إن لم نجمعه داخل التطبيق، وصفحة الدفع خارجه. المقترح ذكره احتياطًا |
| User Content | Other User Content | التقييمات والبلاغات والاعتراضات |
| Identifiers | User ID | رقم الحساب الداخلي |
| Other Data | Other Data Types | إجابات الاستبيان، والتأكيدات (امرأة، 18+) |

**Data not linked to you:**

| الفئة | النوع | الغرض |
|---|---|---|
| Diagnostics | Crash Data | App Functionality |
| Diagnostics | Performance Data | App Functionality (نسبة الجلسات بلا أعطال) |

**ملاحظة:** Apple لا تضع الحالة الاجتماعية والأطفال ضمن «Sensitive Info». القرار القانوني فيهما عند المحامي (المادة 16)، وليس عند المتجر.

## 3. Google Play: Data safety

**الأسئلة العامة:**

| السؤال | الإجابة |
|---|---|
| هل يجمع التطبيق أو يشارك بيانات المستخدم؟ | نعم |
| هل كل البيانات مشفّرة أثناء النقل؟ | نعم (HTTPS فقط) |
| هل يمكن طلب حذف البيانات؟ | نعم، من داخل التطبيق (حسابي ← طلب حذف الحساب)، ومن الموقع |
| رابط حذف الحساب (إلزامي في Google Play) | https://herzone.app (حسابي ← طلب حذف الحساب). **المقترح:** صفحة عامة تشرح الطريقة دون دخول. أجهّزها عند موافقتك |
| مشاركة مع أطراف ثالثة | لا. مزوّدو الخدمة (Supabase و Vercel و Sentry وبوابة الدفع ومزوّد SMS) يعالجون البيانات نيابة عنا، وهذا لا يُعدّ مشاركة في تعريف Google. ورقم واتساب يظهر لزميلة بطلب المستخدمة وموافقة الطرفين، وهذا مستثنى أيضًا |

**أنواع البيانات المجموعة:**

| الفئة | النوع | إلزامي أو اختياري | الغرض |
|---|---|---|---|
| Personal info | Phone number | إلزامي | App functionality, Account management |
| Personal info | Name | اختياري | App functionality |
| Personal info | Other info (الفئة العمرية، التأكيدات، إجابات الاستبيان) | الفئة العمرية إلزامية، والباقي اختياري | App functionality |
| Financial info | Purchase history | إلزامي عند الحجز | App functionality |
| Messages | Other in-app messages (البلاغات والاعتراضات) | اختياري | App functionality |
| App activity | Other user-generated content (التقييمات) | اختياري | App functionality |
| App info and performance | Crash logs، Diagnostics | تلقائي | App functionality |

**Content rating و Target audience:** 18 عامًا فأكثر فقط، مطابقًا للشروط.

## 4. نص الصفحة في المتجر

### العربية

- **الاسم (30 حرفًا كحد أقصى):** HerZone
- **العنوان الفرعي، Apple (30):** لقاءات نسائية صغيرة في الدوحة
- **الوصف المختصر، Google (80):** طاولات عشاء وقهوة لـ 4 إلى 6 نساء في الدوحة، نختارها حسب توافقكن.
- **الوصف:**

> HerZone يجمعكِ مع نساء يشبهنكِ على طاولة عشاء أو قهوة في الدوحة.
>
> **كيف يعمل**
> • أجيبي عن أسئلة قصيرة عن نفسكِ: اللغة، والميزانية، وما تحبينه. معظمها اختياري.
> • احجزي موعدًا وادفعي رسم التنظيم. الطعام والشراب تدفعينهما في المكان.
> • نكوّن طاولة من 4 إلى 6 نساء حسب التوافق، وتراجعها منسقة قبل التأكيد.
> • قبل الموعد نكشف لكِ المكان ورمز الطاولة.
>
> **خصوصيتكِ وأمانكِ أولًا**
> • HerZone للنساء فقط، من 18 عامًا فأكثر.
> • رقم جوالكِ لا يظهر لزميلاتكِ. واتساب لا يظهر إلا إذا وافقتما معًا بعد اللقاء.
> • الإشعارات على شاشة القفل عامة، والتفاصيل داخل التطبيق بعد البصمة أو Face ID.
> • بلاغ خاص في أي وقت، وزر «أنا في خطر الآن» يفتح الاتصال بـ 999 فورًا.
> • تفاصيل لقائكِ محفوظة على جهازكِ، فتفتح حتى دون إنترنت.
>
> **الإلغاء والاسترداد**
> تعرفين نتيجة الاسترداد قبل أن تؤكدي الإلغاء. وإذا ألغينا نحن الطاولة، تختارين موعدًا آخر أو استردادًا كاملًا.

**تنبيه:** سطر «الإشعارات على شاشة القفل عامة» يبقى فقط إذا صدرت إشعارات الجوال الأصلية (NMX-52) قبل الرفع. وإلا يُحذف من النصين.

- **الكلمات المفتاحية، Apple (100 حرف):** لقاءات,نساء,صديقات,الدوحة,قطر,عشاء,قهوة,تعارف,مجموعة,women,doha,friends

### English

- **Subtitle (30):** Small meetups for women, Doha
- **Short description, Google (80):** Dinner and coffee tables for 4 to 6 women in Doha, matched by what you share.
- **Description:**

> HerZone brings you together with like-minded women over dinner or coffee in Doha.
>
> **How it works**
> • Answer a few short questions about yourself: language, budget and what you enjoy. Most are optional.
> • Book a session and pay the organising fee. You pay for your own food and drinks at the venue.
> • We form a table of 4 to 6 women who match, and a coordinator reviews it before it is confirmed.
> • Before the meetup, we reveal the venue and your table code.
>
> **Your privacy and safety come first**
> • HerZone is for women only, aged 18 or over.
> • Your phone number is never shown to other members. WhatsApp appears only if you both agree after the meetup.
> • Lock-screen notifications are generic. Details open in the app after Face ID or fingerprint.
> • Report privately at any time. "I'm in danger right now" opens a call to 999 at once.
> • Your meetup details are saved on your phone, so they open even offline.
>
> **Cancelling and refunds**
> You see the refund result before you confirm. If we cancel your table, you choose another session or a full refund.

- **Keywords, Apple (100):** meetups,women,friends,doha,qatar,dinner,coffee,social,group,ladies

**الفئة:** Social Networking (أو Lifestyle). **التسعير:** مجاني، والدفع لخدمة تُقدَّم خارج التطبيق (قاعدة Apple 3.1.3(e) و 3.1.5)، ويُحسم في NMX-59.

## 5. لقطات الشاشة

- **المطلوب:**
  - iPhone 6.9 بوصة (1320×2868): من 3 إلى 10 لقطات.
  - Android هاتف: لقطتان على الأقل.
- **المقترح، 5 لقطات بالعربية من البيئة التجريبية:**
  1. الترحيب
  2. سؤال من الاستبيان
  3. قائمة المواعيد
  4. تفاصيل اللقاء مع المكان ورمز الطاولة (بيانات تجريبية)
  5. شاشة البلاغ و 999
- **الأداة:** اختبار اللقطات الموجود (`HZ_SCREENSHOTS=1`) يولّدها بالمقاس المطلوب. أجهزها عند فتح الحسابين.

## 6. مطلوب قبل الرفع (قرارات وأشياء خارج الكود)

1. **حساب لمراجع Apple:** الدخول برمز SMS، والمراجع لا يملك رقمًا قطريًا. المعتاد رقم مراجعة واحد برمز ثابت، مفعّل في الإنتاج لذلك الرقم فقط. **يحتاج قرارك.** أنفذه بحدود صارمة: رقم واحد، ولا يستطيع الحجز الحقيقي.
2. **رابط سياسة الخصوصية العام:** إلزامي في المتجرين. يلزم نشر privacy-qa-5 بعد المحامي (NMX-26) على رابط ثابت، مثل `https://herzone.app/privacy`.
3. **رابط الدعم:** صفحة أو بريد. البريد مؤجل بطلبك (NMX-20).
4. **صفحة حذف الحساب العامة** لـ Google (البند 3 أعلاه).
5. **فئة Payment Info** في Apple: نذكرها احتياطًا أو لا (البند 2).
