// Localised messages for error codes (machine `code` is never localised — v0.3 §3.1) and notification templates.
export const ERRORS = {
  MALFORMED_REQUEST: ["الطلب غير صالح.", "The request is malformed."],
  NOT_FOUND: ["غير موجود.", "Not found."],
  METHOD_NOT_ALLOWED: ["الطريقة غير مسموحة.", "Method not allowed."],
  UNAUTHENTICATED: ["سجّل الدخول من جديد.", "Please sign in again."],
  FORBIDDEN: ["ليست لديك صلاحية لهذا الإجراء.", "You don't have permission for this action."],
  ACCOUNT_SUSPENDED: ["حسابك موقوف حاليًا. تواصل معنا إن كان لديك استفسار.", "Your account is currently suspended. Contact us if you have a question."],
  REGISTRATION_INCOMPLETE: ["أكمل التسجيل أولًا.", "Please complete registration first."],
  IDEMPOTENCY_KEY_REQUIRED: ["مفتاح منع التكرار مطلوب.", "An Idempotency-Key header is required."],
  IDEMPOTENCY_KEY_REUSED: ["استُخدم هذا المفتاح لطلب مختلف.", "This Idempotency-Key was used for a different request."],
  RATE_LIMITED: ["طلبات كثيرة. حاول بعد قليل.", "Too many requests. Please try again shortly."],
  INTERNAL: ["حدث خطأ. حاول مرة أخرى.", "Something went wrong. Please try again."],
  UNAVAILABLE: ["الخدمة غير متاحة مؤقتًا.", "The service is temporarily unavailable."],
  INVALID_PHONE: ["رقم الهاتف غير صحيح.", "That phone number isn't valid."],
  UNSUPPORTED_COUNTRY: ["نقبل حاليًا أرقام قطر فقط.", "We currently accept Qatar numbers only."],
  OTP_RATE_LIMITED: ["طلبت رموزًا كثيرة. انتظر قليلًا.", "Too many codes requested. Please wait a moment."],
  OTP_INVALID: ["الرمز غير صحيح.", "That code isn't correct."],
  CHALLENGE_NOT_FOUND: ["اطلب رمزًا جديدًا.", "Please request a new code."],
  OTP_EXPIRED: ["انتهت صلاحية الرمز. اطلب رمزًا جديدًا.", "The code has expired. Please request a new one."],
  OTP_LOCKED: ["محاولات كثيرة. اطلب رمزًا جديدًا.", "Too many attempts. Please request a new code."],
  ALREADY_REGISTERED: ["أكملت التسجيل من قبل.", "You have already registered."],
  VALIDATION_FAILED: ["راجع الإجابات المظللة.", "Please review the highlighted answers."],
  CONSENT_REQUIRED: ["يلزم الموافقة على الشروط وقواعد السلوك وإشعار الخصوصية.", "You need to accept the terms, the code of conduct and the privacy notice."],
  AGE_NOT_ELIGIBLE: ["الخدمة متاحة لمن هم 18 عامًا فأكثر.", "The service is for people aged 18 and over."],
  DOCUMENT_VERSION_OUTDATED: ["تحدّثت الوثيقة. راجع النسخة الحالية.", "The document has been updated. Please review the current version."],
  QUESTIONNAIRE_VERSION_NOT_FOUND: ["الاستبيان غير موجود.", "Questionnaire not found."],
  QUESTIONNAIRE_VERSION_RETIRED: ["تحدّث الاستبيان. حدّث الصفحة.", "The questionnaire was updated. Please refresh."],
  QUESTIONNAIRE_INCOMPLETE: ["أكمل إجاباتك قبل الحجز.", "Please complete your answers before booking."],
  SESSION_NOT_FOUND: ["الموعد غير موجود.", "Session not found."],
  SESSION_FULL: ["امتلأ هذا الموعد للتو.", "This session just filled up."],
  SESSION_NOT_ON_SALE: ["الحجز غير متاح لهذا الموعد.", "Booking isn't open for this session."],
  ALREADY_BOOKED: ["لديك حجز في هذا الموعد.", "You already have a booking for this session."],
  LANGUAGE_CONFLICT: ["هذا الموعد بلغة لم تخترها في إجاباتك.", "This session is in a language you didn't choose in your answers."],
  BUDGET_CONFLICT: ["لا يوجد مكان ضمن ميزانيتك لهذا الموعد.", "There's no venue within your budget for this session."],
  BLOCKED_FROM_BOOKING: ["لا يمكنك الحجز حاليًا.", "You can't book right now."],
  BOOKING_NOT_FOUND: ["الحجز غير موجود.", "Booking not found."],
  CANCEL_NOT_ALLOWED: ["لا يمكن إلغاء هذا الحجز الآن.", "This booking can't be cancelled now."],
  NOT_REBOOKABLE: ["لا يمكن نقل هذا الحجز.", "This booking can't be moved."],
  RESOLUTION_NOT_AVAILABLE: ["لا يوجد اختيار مطلوب لهذا الحجز.", "There's no choice to make for this booking."],
  CHECK_IN_NOT_OPEN: ["تسجيل الوصول غير متاح الآن.", "Check-in isn't open right now."],
  FEEDBACK_NOT_OPEN: ["التقييم غير متاح الآن.", "Feedback isn't open right now."],
  ALREADY_SUBMITTED: ["أرسلت هذا من قبل.", "You've already sent this."],
  PAYMENT_NOT_PENDING: ["لا يوجد دفع معلّق لهذا الحجز.", "There's no pending payment for this booking."],
  HOLD_EXPIRED: ["انتهت مدة حجز المقعد. المقاعد قد تكون تغيّرت.", "Your seat hold expired. Availability may have changed."],
  SIGNATURE_INVALID: ["توقيع غير صالح.", "Invalid signature."],
  MOCK_PSP_DISABLED: ["بوابة الدفع التجريبية متوقفة.", "The test payment page is disabled."],
  CASE_NOT_FOUND: ["البلاغ غير موجود.", "Case not found."],
  APPEAL_NOT_ALLOWED: ["لا يمكن الاعتراض على هذا القرار.", "This decision can't be appealed."],
  REASON_REQUIRED: ["اذكر سبب الاطلاع على هذه البيانات.", "A reason is required to view this data."],
  APPROVAL_REQUIRED: ["يتطلب هذا الإجراء موافقة شخص آخر.", "This action needs approval by a second person."],
  APPROVAL_NOT_ALLOWED: ["لا يمكنك اعتماد هذا الطلب.", "You can't approve this request."],
  TABLE_NOT_LOCKABLE: ["لا يمكن تثبيت الطاولة.", "The table can't be locked."],
  REVEAL_TOO_EARLY: ["لم يحن موعد كشف المكان.", "It's not time to reveal the venue yet."],
  MATCHING_LOCKED: ["لا يمكن إعادة المطابقة بعد موعد التثبيت.", "Matching can't be re-published after lock time."],
  CONFLICT: ["تعارض مع حالة البيانات الحالية.", "This conflicts with the current state."],
  ENROLLMENT_INVALID: ["رمز التسجيل غير صالح أو منتهي.", "The enrolment token is invalid or expired."],
  LOGIN_FAILED: ["البريد أو الرمز غير صحيح.", "Email or code is incorrect."],
  ADMIN_LOGIN_LOCKED: ["محاولات دخول كثيرة. انتظر قليلًا ثم حاول مجددًا.", "Too many sign-in attempts. Please wait and try again."],
  LATE_ACK_REQUIRED: ["أكّد أنك تفهم أن رسم التنظيم لهذا الموعد لا يُسترد عند الإلغاء.", "Please confirm you understand the organising fee for this session isn't refunded if you cancel."],
};

export function errorMessage(code, locale) {
  const m = ERRORS[code] || ERRORS.INTERNAL;
  return locale === "en" ? m[1] : m[0];
}

// v0.3 §4.3 + v0.4 additions. Placeholders {name} are filled from the notification payload.
export const TEMPLATES = {
  TABLE_LOCKED: ["طاولتك مؤكدة! سنكشف المكان في {reveal_at}.", "Your table is confirmed! We'll reveal the venue at {reveal_at}."],
  VENUE_REVEALED: ["المكان: {venue} في {district}. رمز طاولتك {code}.", "Venue: {venue}, {district}. Your table code is {code}."],
  QUORUM_FAIL_CHOICE: ["نعتذر، لم يكتمل الحد الأدنى لطاولتك يوم {date}. اختر موعدًا آخر أو استردادًا كاملًا قبل {deadline}.", "Sorry, your table on {date} didn't reach the minimum. Choose another date or a full refund before {deadline}."],
  MOVED_TABLE: ["غيّرنا طاولتك داخل الموعد نفسه لتكتمل المجموعة. الموعد واللغة والميزانية كما هي.", "We moved you to another table in the same session so it's complete. Time, language and budget are unchanged."],
  WAITLIST_OFFER: ["توفر مقعد في {date}! أكّد خلال {window} للحجز والدفع.", "A seat opened on {date}! Confirm within {window} to book and pay."],
  REFUND_DONE: ["تم رد {amount} إلى وسيلة دفعك. قد يستغرق ظهوره {days} أيام عمل.", "{amount} has been refunded to your payment method. It may take {days} business days to appear."],
  REPORT_RECEIVED: ["وصلنا بلاغك ({case}). لن نكشف هويتك للشخص المُبلَّغ عنه.", "We received your report ({case}). We won't reveal your identity to the person reported."],
  REPORT_OUTCOME: ["راجعنا بلاغك واتخذنا الإجراء المناسب وفق قواعد السلوك.", "We reviewed your report and took appropriate action under our conduct rules."],
  CONDUCT_DECISION: ["وصلنا بلاغ بشأن سلوكك في لقاء {date} (الفئة: {category}). بعد المراجعة قررنا: {decision}. يمكنك الاعتراض مرة واحدة قبل {appeal_until}.", "We received a report about your conduct at the event on {date} (category: {category}). After review, our decision is: {decision}. You may appeal once before {appeal_until}."],
  APPEAL_DECISION: ["راجع اعتراضَك شخصٌ لم يتخذ القرار الأصلي. القرار النهائي: {decision}.", "Your appeal was reviewed by someone who did not make the original decision. Final decision: {decision}."],
  PAYMENT_CONFIRMED: ["تم الدفع. نجمع طاولتك الآن. رقم الحجز {ref}.", "Payment confirmed. We're forming your table now. Booking ref {ref}."],
  BOOKING_CANCELLED: ["تم إلغاء حجزك {ref}.", "Your booking {ref} was cancelled."],
  PRIVATE_CONTACT: ["سيتواصل معك فريقنا بشكل خاص قبل اللقاء.", "Our team will contact you privately before the event."],
};

export function renderTemplate(key, locale, payload = {}) {
  const t = TEMPLATES[key];
  if (!t) return key;
  return (locale === "en" ? t[1] : t[0]).replace(/\{(\w+)\}/g, (_, k) => (payload[k] ?? `{${k}}`));
}

// Sanction decisions are stored as keys in notification payloads and rendered in the reader's language.
export const DECISIONS = {
  warning: ["تنبيه", "a warning"], suspension: ["إيقاف مؤقت", "a temporary suspension"], ban: ["إيقاف دائم", "a permanent ban"],
  appeal_upheld: ["قبول الاعتراض وإلغاء العقوبة", "appeal accepted; sanction lifted"],
  appeal_rejected: ["رفض الاعتراض؛ القرار الأصلي قائم", "appeal rejected; the original decision stands"],
};

export const decisionLabel = (key, locale) => (DECISIONS[key] ? DECISIONS[key][locale === "en" ? 1 : 0] : key);
