-- Privacy notice privacy-qa-2 (staging draft for counsel, open item F8): lists the QA-2026-02 data and the
-- auto-save / resume behaviour. Every statement describes what the code does today; retention periods are the
-- proposed RET values from the Phase 3 legal memo and stay marked as proposed. Re-running is a no-op.
SET search_path = app, public;

INSERT INTO legal_documents (version, type, text_ar, text_en, published_at) VALUES ('privacy-qa-2', 'privacy',
$ar$إشعار الخصوصية — Rightime (مسودة نسخة الاختبار، بانتظار مراجعة المستشار القانوني)

1. من نحن
Rightime تنظّم لقاءات عشاء وقهوة في الدوحة لمجموعات من 4 إلى 6 أشخاص لا يعرفون بعضهم.

2. ما الذي نجمعه
- رقم جوالك: لإرسال رمز التحقق وتسجيل الدخول. نحفظه مشفّرًا.
- اسمك الأول كما تكتبه.
- إجاباتك على الاستبيان: ما تبحث عنه، الجنس (رجل أو امرأة)، الفئة العمرية، أسلوبك في اللقاءات وصفاتك، مجال عملك، أذواقك واهتماماتك، أهمية العائلة والنجاح الأكاديمي، هل لديك أطفال، حالتك الاجتماعية، لغة المحادثة، حد ميزانية الطعام، تفضيل التواصل بعد اللقاء، وطلب ترتيب عملي إن اخترته. الأسئلة المطلوبة أربعة فقط: اللغة، والميزانية، والجنس، والفئة العمرية. بقية الأسئلة اختيارية، ومنها أسئلة قد تُعدّ حساسة مثل الحالة الاجتماعية والأطفال، فأجب عنها فقط إن رغبت.
- موافقاتك ونسخة كل وثيقة وافقت عليها.
- حجوزاتك وحالة الدفع. يتم الدفع في صفحة مزوّد الدفع؛ لا نحفظ رقم بطاقتك، ونحفظ نوع البطاقة وآخر 4 أرقام منها فقط.
- الحضور، وتقييماتك الخاصة، والبلاغات إن قدّمت بلاغًا أو قُدّم بلاغ بشأنك.
- جزء مختصر من عنوان IP (بدون الجزء الأخير): لمنع إساءة استخدام رموز التحقق ولتوثيق موافقاتك. لا نستخدمه لتتبعك أو للتعرف عليك.

3. الحفظ التلقائي وإكمال الطلب
- قبل التسجيل: تُحفظ إجاباتك والخطوة التي وصلت إليها واسمك الأول ورقم جوالك في متصفحك على جهازك فقط، لتكمل من حيث توقفت. لا يصلنا شيء من ذلك قبل أن تتحقق من رقمك وتوافق على هذا الإشعار.
- تُحذف هذه النسخة من جهازك عند إرسال إجاباتك، أو عند اختيار «ابدأ من جديد»، أو عند تسجيل الخروج.
- بعد التسجيل: نحفظ إجاباتك كمسودة في حسابك المرتبط برقم جوالك، فتكمل من أي جهاز بعد الدخول برمز التحقق.
- لا نستخدم عنوان IP ولا بصمة الجهاز ولا ملفات تعريف ارتباط للتتبع للتعرف عليك أو لاسترجاع بياناتك.

4. لماذا نستخدمها
- تكوين الطاولات: نستخدم حاليًا لغة المحادثة والميزانية والاهتمامات. إن بدأنا استخدام إجابات أخرى في تكوين الطاولات فسنحدّث هذا الإشعار.
- إدارة الحجز والدفع والاسترداد، والتواصل معك بشأن لقائك.
- السلامة: التعامل مع البلاغات ومنع جلوس من حظر بعضهم على طاولة واحدة.
- الرسائل التسويقية فقط إن وافقت عليها، ويمكنك الحجز دون هذه الموافقة.

5. من يرى بياناتك
- من على طاولتك يرون اسمك الأول فقط في يوم اللقاء، ولا يرون رقمك ولا إجاباتك.
- فريق Rightime المخوّل حسب دوره، بدخول محمي بخطوتين، وكل اطلاع على البلاغات يُسجَّل مع سببه.
- مزوّد الدفع لتنفيذ الدفع والاسترداد.

6. مدة الاحتفاظ (مقترحة، بانتظار المراجعة القانونية)
- إجاباتك السابقة بعد تحديثها: 30 يومًا.
- عند طلب حذف الحساب: مهلة 14 يومًا يمكنك خلالها التراجع، ثم إزالة رقمك واسمك خلال 30 يومًا.

7. حقوقك
- تعديل إجاباتك من «حسابي» ثم «إجاباتي».
- حذف حسابك من «حسابي».
- سحب موافقتك على الرسائل التسويقية، أو الاستفسار عن بياناتك، عبر المنسق المناوب من قسم المساعدة في التطبيق.$ar$,
$en$Privacy notice — Rightime (staging draft, pending legal counsel review)

1. Who we are
Rightime organises dinners and coffees in Doha for groups of 4 to 6 people who do not know each other.

2. What we collect
- Your mobile number: to send the verification code and sign you in. It is stored encrypted.
- Your first name as you type it.
- Your questionnaire answers: what you are looking for, gender (man or woman), age range, how you are at a table and your qualities, your field of work, your tastes and interests, how much family and academic success matter to you, whether you have children, your marital status, conversation language, food budget limit, contact preference after the event, and a practical-arrangement request if you choose one. Only four questions are required: language, budget, gender and age range. All others are optional; some, such as marital status and children, may be sensitive, so answer them only if you want to.
- Your consents and the version of each document you accepted.
- Your bookings and payment status. Payment happens on the payment provider's page; we never store your card number, only the card brand and its last 4 digits.
- Attendance, your private ratings, and safety reports you make or that are made about you.
- A shortened part of your IP address (without the last part): to stop misuse of verification codes and to record your consents. We do not use it to track or identify you.

3. Auto-save and finishing later
- Before you sign up: your answers, the step you reached, your first name and your mobile number are kept in your browser on your device only, so you can continue where you left off. None of it reaches us until you verify your number and accept this notice.
- That copy is deleted from your device when your answers are sent, when you choose "Start over", or when you sign out.
- After you sign up: we save your answers as a draft in your account, linked to your mobile number, so you can continue on any device after signing in with a verification code.
- We do not use your IP address, a device fingerprint or tracking cookies to recognise you or to restore your data.

4. Why we use it
- Forming tables: today we use conversation language, budget and interests. If we start using other answers to form tables, we will update this notice.
- Managing bookings, payments and refunds, and contacting you about your event.
- Safety: handling reports and never seating people who blocked each other at the same table.
- Marketing messages only if you agree to them; you can book without that consent.

5. Who sees your data
- People at your table see only your first name, on the day of the event. They do not see your number or your answers.
- Authorised Rightime staff, by role, with two-step sign-in; every access to a safety report is logged with its reason.
- The payment provider, to process payments and refunds.

6. How long we keep it (proposed, pending legal review)
- Your earlier answers after you update them: 30 days.
- When you ask to delete your account: a 14-day period in which you can change your mind, then your number and name are removed within 30 days.

7. Your rights
- Edit your answers in Profile, then My answers.
- Delete your account in Profile.
- Withdraw marketing consent or ask about your data through the coordinator on duty, from the Help section of the app.$en$,
-- strictly after the version it replaces, even when both seeds run in one transaction
GREATEST(now(), (SELECT max(published_at) + interval '1 millisecond' FROM legal_documents WHERE type = 'privacy')))
ON CONFLICT (version) DO NOTHING;
