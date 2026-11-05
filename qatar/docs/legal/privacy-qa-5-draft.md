# إشعار الخصوصية privacy-qa-5 — مسودة للمحامي (NMX-25)

**الحالة:** مسودة. لم تُنشر لأي مستخدمة. تُنشر فقط بعد مراجعة المحامي (NMX-26).
**تحلّ محل:** privacy-qa-4.
**ملف التحميل:** `qatar/ops/seed_privacy_v5.sql` يُدخل النص في قاعدة البيانات **دون نشر** (`published_at` فارغ). النشر بعد الموافقة بأمر واحد مذكور في آخر الملف.

## ما الذي تغيّر عن privacy-qa-4 ولماذا

| # | التغيير | السبب (ما يفعله الكود اليوم) |
|---|---|---|
| 1 | تكوين الطاولات يستخدم **كل الإجابات المجاب عنها**، لا اللغة والميزانية والاهتمامات فقط | محرّك المطابقة r2-personality هو الافتراضي (`api/src/routes/admin.js`)، ويستخدم Q05، Q06، Q09، Q11، Q13 إلى Q24 (`api/src/matching/personality.js`) |
| 2 | إفصاح عن سطر «يجمعكن» الذي تراه زميلات الطاولة | يُعرض ما تشترك فيه نصف الطاولة على الأقل (اثنتان كحد أدنى)، من أسئلة غير حساسة فقط، ولا يُنسب لأي عضوة |
| 3 | ما يُحفظ على الجهاز بعد التسجيل | تفاصيل اللقاءات القادمة (NMX-16)، ورقم المنسق، ووقت آخر فتح للإشعارات (NMX-18). تُحذف عند تسجيل الخروج |
| 4 | إشعارات الجوال | عنوان الجهاز للإشعارات (endpoint) ومفاتيحه. نص شاشة القفل عام بلا تفاصيل (NMX-21) |
| 5 | تقارير الأعطال | Sentry (ألمانيا)، تُحذف منها الأرقام والرموز قبل الإرسال |
| 6 | أماكن التخزين خارج قطر | قاعدة البيانات في الهند (مومباي)، الموقع عبر شبكة Vercel العالمية، تقارير الأعطال في ألمانيا |
| 7 | جلسة الدخول | رمز تجديد على الجهاز، وتسجيل الخروج ينهي الجلسة على الخادم فورًا (NMX-17) |

## أسئلة للمحامي

1. **البيانات ذات الطبيعة الخاصة (المادة 16 من القانون 13 لسنة 2016):** الحالة الاجتماعية ووجود أطفال اختيارية ولها خيار «أفضّل عدم الإجابة». هل تُعدّ من البيانات ذات الطبيعة الخاصة؟ وهل يلزم تصريح مسبق من إدارة حماية البيانات قبل معالجتها؟ إن لزم ولم يتيسّر، يمكن إخراج Q23 وQ24 من المطابقة بتغيير واحد في الكود قبل الإطلاق.
2. **النقل عبر الحدود (المادة 15):** هل يكفي الإفصاح والموافقة لتخزين البيانات في الهند وتقارير الأعطال في ألمانيا؟
3. **قصر الخدمة على النساء:** صياغة البند في الشروط أدناه، وهل يكفي الإقرار الذاتي.
4. **مدد الاحتفاظ:** ما زالت مقترحة (RET من مذكرة المرحلة 3).

---

## النص العربي المقترح

إشعار الخصوصية — HerZone (مسودة بانتظار مراجعة المستشار القانوني)

**1. من نحن**
HerZone تنظّم لقاءات عشاء وقهوة في الدوحة للنساء فقط، لمجموعات من 4 إلى 6 سيدات لا يعرفن بعضهن.

**2. ما الذي نجمعه**
- رقم جوالكِ: لإرسال رمز التحقق وتسجيل الدخول. نحفظه مشفّرًا.
- اسمكِ الأول كما تكتبينه.
- تأكيدكِ أنكِ امرأة وأن عمركِ 18 عامًا أو أكثر، ووقت التأكيد.
- إجاباتكِ على الاستبيان: ما تبحثين عنه، الفئة العمرية، أسلوبكِ في اللقاءات وصفاتكِ، مجال عملكِ، أذواقكِ واهتماماتكِ، أهمية العائلة والنجاح الأكاديمي، هل لديكِ أطفال، حالتكِ الاجتماعية، لغة المحادثة، حد ميزانية الطعام، وطلب ترتيب عملي إن اخترتِه.
  - الأسئلة المطلوبة ثلاثة فقط: اللغة، والميزانية، والفئة العمرية. بقية الأسئلة اختيارية.
  - بعض الأسئلة قد تُعدّ حساسة، مثل الحالة الاجتماعية والأطفال. أجيبي عنها فقط إن رغبتِ، ولكلٍّ منها خيار «أفضّل عدم الإجابة».
- موافقاتكِ ونسخة كل وثيقة وافقتِ عليها.
- حجوزاتكِ وحالة الدفع. يتم الدفع في صفحة مزوّد الدفع. لا نحفظ رقم بطاقتكِ؛ نحفظ نوع البطاقة وآخر 4 أرقام منها فقط.
- طلبات التواصل بعد اللقاء: من أرسلتِ إليها طلبًا، ومن أرسلت إليكِ، وردّكِ.
- الحضور، وتقييماتكِ الخاصة، والبلاغات إن قدّمتِ بلاغًا أو قُدّم بلاغ بشأنكِ.
- جزء مختصر من عنوان IP (بدون الجزء الأخير): لمنع إساءة استخدام رموز التحقق ولتوثيق موافقاتكِ. لا نستخدمه لتتبعكِ أو للتعرف عليكِ.
- إن فعّلتِ إشعارات الجوال: عنوان جهازكِ لدى خدمة الإشعارات في متصفحكِ أو جوالكِ. لا يتضمن رقمكِ.
- تقارير الأعطال التقنية: نوع الخطأ ومكانه في الكود والصفحة. نحذف منها الأرقام ورموز الدخول قبل إرسالها، ولا نرسل إجاباتكِ ولا محتوى الطلبات.

**3. ما يُحفظ على جهازكِ**
- قبل التسجيل: تُحفظ إجاباتكِ والخطوة التي وصلتِ إليها واسمكِ الأول ورقم جوالكِ في متصفحكِ على جهازكِ فقط، لتكملي من حيث توقفتِ. لا يصلنا شيء من ذلك قبل أن تتحققي من رقمكِ وتوافقي على هذا الإشعار.
- تُحذف هذه النسخة من جهازكِ عند إرسال إجاباتكِ، أو عند اختيار «ابدئي من جديد»، أو عند تسجيل الخروج.
- بعد التسجيل:
  - رمز يُبقيكِ مسجّلة الدخول.
  - تفاصيل لقاءاتكِ القادمة (المكان، وتعليمات الوصول، ورمز الطاولة) لتفتحيها دون إنترنت. تُحذف بعد انتهاء اللقاء.
  - رقم المنسق المناوب، ووقت آخر فتح لصفحة الإشعارات.
  - يُحذف كل ذلك من جهازكِ عند تسجيل الخروج.
- نحفظ إجاباتكِ كمسودة في حسابكِ، فتكملين من أي جهاز بعد الدخول برمز التحقق.
- لا نستخدم عنوان IP ولا بصمة الجهاز ولا ملفات تعريف ارتباط للتتبع للتعرف عليكِ أو لاسترجاع بياناتكِ.

**4. لماذا نستخدمها**
- **تكوين الطاولات:**
  - تجلسين دائمًا مع من يتحدثن لغة المحادثة نفسها، وضمن حد ميزانيتكِ أو أقل.
  - ثم نقارن إجاباتكِ الأخرى التي أجبتِ عنها لنجمعكِ بمن يشبهنكِ: القيم، والشخصية، وما تبحثين عنه، والاهتمامات، ونمط الحياة. يشمل ذلك الفئة العمرية، ومجال العمل، والأطفال، والحالة الاجتماعية إن أجبتِ عنها.
  - نوازن أيضًا بين الهادئات والاجتماعيات على كل طاولة.
  - السؤال الذي لا تجيبين عنه، أو تختارين فيه «أفضّل عدم الإجابة»، لا يُستخدم.
  - المطابقة آلية، وتراجعها منسقة من HerZone قبل تأكيد الطاولات. لا يترتب عليها أي أثر قانوني عليكِ.
- **قصر الخدمة على النساء:** نطلب تأكيدكِ أنكِ امرأة عند التسجيل وقبل الحجز.
- إدارة الحجز والدفع والاسترداد، والتواصل معكِ بشأن لقائكِ.
- **إشعارات الجوال:** لإبلاغكِ بتحديثات لقائكِ. يظهر على شاشة القفل نص عام فقط، والتفاصيل داخل التطبيق.
- **طلبات التواصل:** لإيصال طلبكِ إلى زميلة طاولتكِ، وإظهار زر واتساب لكما بعد موافقتكما فقط. لا نخبر المرسلة إن لم يُقبل طلبها، ولا نوصل طلبًا بين من حظرت إحداهما الأخرى.
- **السلامة:** التعامل مع البلاغات، ومنع جلوس من حظرت إحداهن الأخرى على طاولة واحدة.
- **إصلاح الأعطال:** تقارير الأعطال أعلاه.
- الرسائل التسويقية فقط إن وافقتِ عليها، ويمكنكِ الحجز دون هذه الموافقة.

**5. من يرى بياناتكِ**
- من على طاولتكِ يرين اسمكِ الأول فقط في يوم اللقاء. لا يرين رقمكِ ولا إجاباتكِ.
- قد تظهر للطاولة جملة عامة عمّا تشترك فيه نصف الطاولة على الأقل، مثل «يجمعكن: السفر، الحوارات العميقة».
  - لا تُنسب لأي واحدة منكن.
  - لا تُؤخذ أبدًا من الفئة العمرية أو الأطفال أو الحالة الاجتماعية أو مجال العمل.
- إذا قبلتِ طلب تواصل من زميلة، أو قبلت هي طلبكِ، يظهر لكل منكما زر واتساب برقم الأخرى. لا نشارك رقمكِ بغير ذلك.
- فريق HerZone المخوّل حسب دوره، بدخول محمي بخطوتين. كل اطلاع على البلاغات يُسجَّل مع سببه.
- مزوّدو الخدمة الذين يعملون لصالحنا فقط:
  - مزوّد الدفع: للدفع والاسترداد.
  - مزوّد الرسائل النصية: لرمز التحقق.
  - الاستضافة: Supabase لقاعدة البيانات، وVercel للموقع.
  - Sentry: لتقارير الأعطال.

**6. أين تُحفظ بياناتكِ**
- قاعدة البيانات في مركز بيانات في الهند (مومباي).
- يُقدَّم الموقع عبر شبكة Vercel العالمية.
- تقارير الأعطال في ألمانيا.
- البيانات مشفّرة أثناء النقل وأثناء الحفظ، ورقم جوالكِ مشفّر بمفتاح منفصل.

**7. مدة الاحتفاظ (مقترحة، بانتظار المراجعة القانونية)**
- إجاباتكِ السابقة بعد تحديثها: 30 يومًا.
- رموز التحقق: 24 ساعة على الأكثر.
- عند طلب حذف الحساب: مهلة 14 يومًا يمكنكِ خلالها التراجع، ثم إزالة رقمكِ واسمكِ خلال 30 يومًا.

**8. حقوقكِ**
- تعديل إجاباتكِ من «حسابي» ثم «إجاباتي»، وترك أي سؤال اختياري دون إجابة.
- إيقاف إشعارات الجوال من «حسابي».
- حذف حسابكِ من «حسابي».
- سحب موافقتكِ على الرسائل التسويقية، أو طلب نسخة من بياناتكِ، أو الاعتراض على استخدامها، عبر المنسق المناوب من قسم المساعدة في التطبيق.

---

## English text

Privacy notice — HerZone (draft, pending legal counsel review)

**1. Who we are**
HerZone organises dinners and coffees in Doha for women only, in groups of 4 to 6 women who do not know each other.

**2. What we collect**
- Your mobile number: to send the verification code and sign you in. It is stored encrypted.
- Your first name as you type it.
- Your confirmation that you are a woman and 18 or older, and when you confirmed it.
- Your questionnaire answers: what you are looking for, age range, how you are at a table and your qualities, your field of work, your tastes and interests, how much family and academic success matter to you, whether you have children, your marital status, conversation language, food budget limit, and a practical-arrangement request if you choose one.
  - Only three questions are required: language, budget and age range. All others are optional.
  - Some questions may be sensitive, such as marital status and children. Answer them only if you want to; each has "I prefer not to say".
- Your consents and the version of each document you accepted.
- Your bookings and payment status. Payment happens on the payment provider's page. We never store your card number, only the card brand and its last 4 digits.
- Contact requests after the meetup: whom you sent a request to, who sent you one, and your answer.
- Attendance, your private ratings, and safety reports you make or that are made about you.
- A shortened part of your IP address (without the last part): to stop misuse of verification codes and to record your consents. We do not use it to track or identify you.
- If you turn on phone notifications: your device's address with your browser's or phone's notification service. It does not include your number.
- Technical error reports: the error type, where it happened in the code, and the page. Numbers and sign-in tokens are removed before sending; your answers and request contents are never sent.

**3. What is kept on your device**
- Before you sign up: your answers, the step you reached, your first name and your mobile number are kept in your browser on your device only, so you can continue where you left off. None of it reaches us until you verify your number and accept this notice.
- That copy is deleted from your device when your answers are sent, when you choose "Start over", or when you sign out.
- After you sign up:
  - A token that keeps you signed in.
  - The details of your upcoming meetups (venue, arrival notes, table code), so you can open them offline. They are deleted after the meetup.
  - The coordinator's number, and when you last opened your notifications.
  - All of this is deleted from your device when you sign out.
- We save your answers as a draft in your account, so you can continue on any device after signing in with a verification code.
- We do not use your IP address, a device fingerprint or tracking cookies to recognise you or to restore your data.

**4. Why we use it**
- **Forming tables:**
  - You are always seated with women who share your conversation language, at or below your budget limit.
  - We then compare the other answers you gave, to seat you with women like you: values, personality, what you are looking for, interests and lifestyle. This includes age range, field of work, children and marital status if you answered them.
  - We also balance quieter and more outgoing women at each table.
  - A question you skip, or answer "I prefer not to say", is not used.
  - Matching is automated and is reviewed by a HerZone coordinator before tables are confirmed. It has no legal effect on you.
- **Keeping the service for women only:** we ask you to confirm you are a woman at sign-up and before booking.
- Managing bookings, payments and refunds, and contacting you about your event.
- **Phone notifications:** to tell you about updates to your meetup. Only a generic text shows on the lock screen; the details are inside the app.
- **Contact requests:** to deliver your request to a tablemate and to show both of you a WhatsApp button only after you both agree. We never tell the sender if a request was not accepted, and we never deliver a request between people who blocked each other.
- **Safety:** handling reports, and never seating people who blocked each other at the same table.
- **Fixing faults:** the error reports above.
- Marketing messages only if you agree to them; you can book without that consent.

**5. Who sees your data**
- People at your table see only your first name, on the day of the event. They do not see your number or your answers.
- The table may see a general line about what at least half of it has in common, for example "What you share: travel, deep conversations".
  - It is never attributed to any one of you.
  - It is never drawn from age range, children, marital status or field of work.
- If you accept a tablemate's contact request, or she accepts yours, each of you sees a WhatsApp button with the other's number. We never share your number otherwise.
- Authorised HerZone staff, by role, with two-step sign-in. Every access to a safety report is logged with its reason.
- Service providers working only for us:
  - The payment provider: payments and refunds.
  - The SMS provider: verification codes.
  - Hosting: Supabase for the database, Vercel for the website.
  - Sentry: error reports.

**6. Where your data is kept**
- The database is in a data centre in India (Mumbai).
- The website is served through Vercel's global network.
- Error reports are kept in Germany.
- Data is encrypted in transit and at rest, and your mobile number is encrypted with a separate key.

**7. How long we keep it (proposed, pending legal review)**
- Your earlier answers after you update them: 30 days.
- Verification codes: 24 hours at most.
- When you ask to delete your account: a 14-day period in which you can change your mind, then your number and name are removed within 30 days.

**8. Your rights**
- Edit your answers in Profile, then My answers, and leave any optional question unanswered.
- Turn phone notifications off in Profile.
- Delete your account in Profile.
- Withdraw marketing consent, ask for a copy of your data, or object to its use, through the coordinator on duty, from the Help section of the app.
