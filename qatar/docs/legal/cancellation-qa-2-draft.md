مسودة للمالكة والمحامي — لم تُنشر

# سياسة الإلغاء والاسترداد cancellation-qa-2 — مسودة (NMX-26)

**تحلّ محل:** النص المختصر لسياسة `cxl-1` في قاعدة البيانات: «استرداد كامل حتى 48 ساعة قبل موعد اللقاء، ولا استرداد بعد ذلك.»
**الوثائق المرتبطة:** شروط الاستخدام (`terms-qa-2-draft.md`)، وقواعد السلوك (`conduct-qa-2-draft.md`).
**قاعدة الكتابة:** الجمل بين «» نصوص المنتج كما هي. المهلة في التطبيق تظهر تاريخًا ووقتًا ({deadline})، وتُحسب من إعداد السياسة. مصدر كل بند في الجدول آخر الملف.

## أسئلة للمحامي والمالكة

1. **[للمحامي]** مهلة الاسترداد الكامل: 48 ساعة قبل بدء اللقاء، ولا استرداد بعدها (`cxl-1`). القيمة موصوفة في المستودع بأنها «بانتظار الموافقة القانونية (O04)». هل هي مقبولة نظامًا لخدمة استهلاكية في قطر؟
2. **[للمالكة]** مبلغ رسم التنظيم (المضبوط اليوم 59 ر.ق لكل مقعد، قابل للتغيير). النص لا يذكر رقمًا.
3. **[للمالكة والمحامي]** **فترة الإطلاق.** الشاشة تقول «يُخصم المبلغ للتحقق من البطاقة ويُرد إليكِ كاملًا.» لكن:
   - لا يوجد في الكود ما يرد المبلغ تلقائيًا. لا يُعرف متى يُرد، ولا من يرده.
   - في الوقت نفسه تقول الشاشة «إلغاء مجاني حتى {deadline}. بعده لا يُرد رسم التنظيم.» والكود يطبّق ذلك: الإلغاء بعد المهلة لا يرد شيئًا، ورفض مراجعة الاسم لا يرد شيئًا.
   - الجملتان متعارضتان أثناء العرض. أيهما تُقدَّم، ومتى يُرد مبلغ العرض؟ القسم 10 أدناه تُرك فراغًا.
4. **[للمالكة]** بعد إلغاء الطاولة لعدم اكتمالها، الاسترداد الذي تختاره العضوة، والاسترداد التلقائي بعد انتهاء مهلة الاختيار، **ينتظران موافقة المالية** في لوحة الإدارة قبل إرسالهما. لا توجد مدة محددة لهذه الموافقة. النص يقول للعضوة «خلال 10 أيام عمل». هل تُلتزم هذه المدة من وقت اختيارها؟
5. **[للمحامي]** الاسترداد إلى وسيلة الدفع الأصلية «خلال 10 أيام عمل»: الرقم مكتوب في الواجهة والإشعار، ويعتمد فعليًا على البنك ومزوّد الدفع (لم يُختر بعد، NMX-24). هل يُكتب كحد أقصى أم كتقدير؟
6. **[للمحامي]** عدم الحضور: لا رسم إضافي، ولا استرداد. هل يلزم نص صريح؟ (مكتوب أدناه.)
7. **[للمالكة]** حجز مدفوع لم يُوضع على أي طاولة حتى موعد اللقاء: لا قاعدة في الكود، فيبقى «قيد التجهيز» (قرار مفتوح في `provisional-2026-11-10.md`). لم يُذكر أدناه.
8. **[للمالكة]** الإيقاف المؤقت أو الدائم بعد بلاغ يلغي الحجوزات القادمة **مع استرداد كامل**، بينما مسودة بند «للنساء فقط» تقول «لا استرداد عند المخالفة المثبتة». النص يصف الكود. (السؤال 8 في الشروط.)
9. **[للمالكة]** النسخة الإنجليزية من نص «لم تكتمل طاولتك» تقول «You won't pay anything»، والعربية «لا تتحملين أي رسوم». المعنى واحد، لكن العضوة تكون قد دفعت فعلًا. هل تُعدَّل الصياغة إلى «نرد لكِ المبلغ كاملًا أو ننقلك»؟ لم يُعدَّل شيء.
10. **[للمالكة]** يوجد نص «انقلني لموعد آخر بدلًا من الإلغاء» في `strings.js`، لكنه غير مستعمل: لا تستطيع العضوة نقل حجزها بنفسها. النقل متاح فقط بعد إلغاء الطاولة من HerZone. لم يُذكر النقل الذاتي أدناه.
11. **[للمالكة]** صفحة الاشتراكات (للعرض فقط) فيها «ضمان استرداد كامل خلال {d} يومًا». لا اشتراك يُباع اليوم، فلم يُذكر. يلزم نص قبل بيع أي اشتراك.

---

## النص العربي المقترح

سياسة الإلغاء والاسترداد — HerZone (مسودة بانتظار مراجعة المستشار القانوني)

**1. باختصار**
1. «إلغاء مجاني حتى {deadline}. بعده لا يُرد رسم التنظيم.»
2. {deadline} هو 48 ساعة قبل بدء اللقاء. يظهر لكِ تاريخًا ووقتًا قبل الدفع وفي تفاصيل الحجز. [للمحامي: السؤال 1.]
3. «إذا لم تكتمل الطاولة نُلغيها ونرد المبلغ كاملًا أو ننقلك لموعد آخر باختيارك.»
4. الطعام والمشروبات تدفعينها للمكان، فلا تدخل في هذه السياسة.

**2. قبل الدفع**
1. عند اختيار الموعد نحجز مقعدكِ لمدة قصيرة يظهر عدّادها. إن لم يتم الدفع خلالها: «انتهت مدة حجز المقعد. المقاعد قد تكون تغيّرت.»
2. إذا فشل الدفع: «يمكنكِ المحاولة مرة أخرى ما دام المقعد محجوزًا.»
3. إذا ألغيتِ قبل الدفع: «لم يتم الدفع بعد، فلا يوجد مبلغ للاسترداد.»

**3. إذا حجزتِ بعد انتهاء مهلة الاسترداد**
إذا كان الموعد يبدأ خلال أقل من 48 ساعة، نخبركِ قبل الدفع:
1. «يبدأ هذا الموعد خلال أقل من {hours} ساعة»
2. «إذا ألغيتِ بعد الدفع فلن يُسترد رسم التنظيم ({fee}).»
3. ولا يمكنكِ الدفع حتى تضعي علامة على: «أفهم وأوافق على أن رسم التنظيم لا يُسترد إذا ألغيت هذا الحجز.»

**4. إذا ألغيتِ بعد الدفع**
1. يمكنكِ الإلغاء من تفاصيل الحجز حتى بدء اللقاء. ذكر السبب اختياري.
2. **قبل المهلة:** «ستستردين {fee} كاملة إلى بطاقتك خلال {days} أيام عمل.» (10 أيام عمل.)
3. **بعد المهلة:** «انتهت مهلة الاسترداد ({deadline}). لن يُرد رسم التنظيم.»
4. بعد بدء اللقاء لا يمكن الإلغاء.
5. عند الإلغاء يُعرض مقعدكِ على قائمة الانتظار.

**5. الحضور برفقة «+1»**
1. «الإلغاء يشمل مقعدك ومقعد مرافقتك.» لا يمكن إلغاء مقعد واحد منهما بعد الدفع.
2. المهلة نفسها تنطبق على المبلغ كله: قبلها يُرد الرسمان كاملين، وبعدها لا يُرد أي منهما.
3. قبل الدفع يمكنكِ حذف المرافقة، فيعود المبلغ لمقعد واحد.

**6. إذا لم تحضري**
إذا لم تحضري ولم تلغي حجزكِ، لا نأخذ منكِ أي رسم إضافي، ولا يُرد رسم التنظيم.

**7. إذا لم تكتمل الطاولة**
1. «لم يكتمل الحد الأدنى (4 سيدات) لهذا الموعد، لذلك ألغينا الطاولة. لا تتحملين أي رسوم.»
2. تختارين واحدًا من اثنين:
   - **موعد آخر:** «ننقل رسمك كما هو.» نعرض مواعيد بلغة طاولتكِ نفسها فيها مقاعد كافية، وتظهر بدائلكِ أولًا. ينتقل حجز مرافقتكِ معكِ.
   - **استرداد كامل:** «{fee} إلى وسيلة الدفع الأصلية خلال {days} أيام عمل.» [للمالكة: السؤال 4.]
3. «إن لم تختاري قبل {deadline} سنرد المبلغ كاملًا تلقائيًا.» مهلة الاختيار 48 ساعة من إلغاء الطاولة.

**8. قائمة الانتظار**
1. «انضمّي لقائمة الانتظار.»
2. «إذا توفّر مقعد نحجزه لكِ ونرسل لكِ إشعارًا.»
3. «أكّدي وادفعي خلال المدة المذكورة في الإشعار، وإلا انتقل المقعد لمن بعدك.»
4. الانضمام مجاني. لا تدفعين إلا إذا حجزتِ المقعد المعروض.
5. المقعد المعروض واحد. إذا أردتِ «+1» يلزم مقعد ثانٍ متاح.

**9. استرداد تلقائي كامل**
نرد المبلغ كاملًا تلقائيًا في هذه الحالات:
1. نجح الدفع بعد انتهاء مدة حجز المقعد.
2. نجح الدفع بعد أن ألغيتِ الحجز (كانت صفحة الدفع ما زالت مفتوحة).
3. دُفع الحجز نفسه مرتين: تُرد الدفعة الثانية.
4. دُفع مبلغ غير المطلوب، مثلًا بعد إضافة المرافقة أو حذفها وصفحة دفع قديمة مفتوحة. لا يُؤكَّد الحجز بهذه الدفعة، ويمكنكِ دفع المبلغ الصحيح ما دام المقعد محجوزًا.

**10. فترة الإطلاق**
1. قد يظهر بجانب رسم التنظيم «مجاني لفترة محدودة»، وتحته «يُخصم المبلغ للتحقق من البطاقة ويُرد إليكِ كاملًا.»
2. [للمالكة والمحامي: متى يُرد المبلغ، وكيف يتفق ذلك مع القسمين 4 و11، السؤال 3.]

**11. إيقاف الحساب ومطابقة اسم البطاقة**
1. إذا أوقفنا حسابكِ مؤقتًا أو دائمًا بعد بلاغ، تُلغى حجوزاتكِ القادمة مع استرداد كامل.
2. إذا رُفضت مراجعة الاسم على بطاقة الدفع:
   - يُلغى ذلك الحجز دون استرداد رسم التنظيم.
   - تُلغى حجوزاتكِ القادمة الأخرى مع استرداد كامل.
   - إذا قُبل اعتراضكِ يُسترد رسم ذلك الحجز.
3. التفاصيل في شروط الاستخدام وقواعد السلوك.

**12. كيف يصلكِ الاسترداد**
1. يُرد المبلغ إلى وسيلة الدفع الأصلية.
2. عند إتمامه نرسل لكِ: «تم رد {amount} إلى وسيلة دفعك. قد يستغرق ظهوره {days} أيام عمل.» (10 أيام عمل.) [للمحامي: السؤال 5.]
3. تتابعين حالة الاسترداد في تفاصيل الحجز: «تم طلب الاسترداد»، «قيد المعالجة»، «تم الاسترداد».
4. إذا ظهر «تعذّر الاسترداد»: «سيتواصل معكِ فريقنا خلال يوم عمل.»
5. للمساعدة: تواصلي مع المنسق المناوب من قسم المساعدة في التطبيق.

---

## English text

Cancellation & refund policy — HerZone (draft, pending legal counsel review)

**1. In short**
1. "Free cancellation until {deadline}. After that, the organising fee is not refunded."
2. {deadline} is 48 hours before the meetup starts. You see it as a date and time before you pay and in your booking details. [Lawyer: question 1.]
3. "If the table doesn't fill, we cancel it and refund you in full or move you to another session — your choice."
4. You pay the venue for food and drinks, so they are outside this policy.

**2. Before payment**
1. When you choose a session we hold your seat for a short time, with a timer. If payment is not made in that time: "Your seat hold expired. Availability may have changed."
2. If the payment fails: "You can try again while the seat is held."
3. If you cancel before paying: "You haven't paid yet, so there's nothing to refund."

**3. If you book after the refund deadline has passed**
If the session starts in less than 48 hours, we tell you before payment:
1. "This session starts in less than {hours} hours"
2. "If you cancel after paying, the organising fee ({fee}) isn't refunded."
3. You cannot pay until you tick: "I understand and agree that the organising fee isn't refunded if I cancel this booking."

**4. If you cancel after payment**
1. You can cancel from your booking details until the meetup starts. Giving a reason is optional.
2. **Before the deadline:** "You'll get {fee} back to your card within {days} business days." (10 business days.)
3. **After the deadline:** "The refund deadline has passed ({deadline}). The organising fee isn't refunded."
4. Once the meetup has started, you cannot cancel.
5. When you cancel, your seat is offered to the waitlist.

**5. Coming with a "+1"**
1. "Cancelling covers your seat and your companion's seat." After payment, one of the two seats cannot be cancelled on its own.
2. The same deadline applies to the whole amount: before it, both fees are refunded in full; after it, neither is.
3. Before payment you can remove your companion, and the amount goes back to one seat.

**6. If you do not come**
If you do not come and did not cancel, we charge you nothing extra, and the organising fee is not refunded.

**7. If the table doesn't fill**
1. "The minimum (4 women) wasn't reached for this session, so we cancelled the table. You won't pay anything."
2. You choose one of two options:
   - **Another session:** "We transfer your fee as it is." We show sessions in your table's language with enough seats, your alternates first. Your companion's seat moves with you.
   - **Full refund:** "{fee} to your original payment method within {days} business days." [Owner: question 4.]
3. "If you don't choose before {deadline}, we'll refund you in full automatically." You have 48 hours from the table's cancellation to choose.

**8. Waitlist**
1. "Join the waitlist."
2. "If a seat opens, we hold it for you and send you a notification."
3. "Confirm and pay within the time given in the notification, or the seat passes to the next person."
4. Joining is free. You pay only if you book the seat offered to you.
5. The seat offered is one seat. For a "+1" a second free seat is needed.

**9. Automatic full refunds**
We refund the full amount automatically when:
1. A payment succeeds after your seat hold has ended.
2. A payment succeeds after you cancelled the booking (the payment page was still open).
3. The same booking is paid twice: the second payment is refunded.
4. A different amount from the one due is paid, for example after adding or removing your companion while an older payment page was open. That payment does not confirm the booking, and you can pay the right amount while your seat is held.

**10. Launch period**
1. Next to the organising fee you may see "Free for a limited period", and below it "The amount is taken to verify your card and refunded to you in full."
2. [Owner and lawyer: when the amount is refunded, and how this fits with sections 4 and 11, question 3.]

**11. Account suspension and the card-name check**
1. If we suspend your account for a time or permanently after a report, your upcoming bookings are cancelled with a full refund.
2. If the review of the name on your payment card is rejected:
   - That booking is cancelled without refunding the organising fee.
   - Your other upcoming bookings are cancelled with a full refund.
   - If your appeal is accepted, the fee for that booking is refunded.
3. Details are in the Terms of use and the Code of conduct.

**12. How you receive a refund**
1. The money goes back to your original payment method.
2. When it is done we send you: "{amount} has been refunded to your payment method. It may take {days} business days to appear." (10 business days.) [Lawyer: question 5.]
3. You can follow the refund in your booking details: "Refund requested", "Processing", "Refunded".
4. If you see "Refund failed": "Our team will contact you within one business day."
5. For help: contact the coordinator on duty from the Help section of the app.

---

## Sources (not for publication)

| § | Rule | Source |
|---|---|---|
| 1.1 | Refund line (owner's text, 14 Nov) | `qatar/web/strings.js` `refundLine` |
| 1.2 | 48 h, no refund after (`cxl-1`); deadline = start − hours | `qatar/ops/production/setup.sql` and `ops/production/reference.sql` (`cxl-1`, 48, 0); `db/migrations/001_init.sql` `FULL_REFUND_UNTIL_HOURS` ("pending legal sign-off (O04)"); `api/src/routes/user.js` `refundTerms`, `hoursBefore` |
| 1.3 | Quorum line (quoted) | `web/strings.js` `policyBox`, `feeA2` |
| 1.4 | Food paid to the venue | `web/strings.js` `feeOut1` |
| 2.1 | Seat hold and expiry | `api/src/lib/config.js` `SEAT_HOLD_MINUTES` (10); `db/migrations/026_plus_one.sql` `hold_seat`, `release_expired_holds`; `web/strings.js` `holdExpired` |
| 2.2 | Retry after failed payment | `web/strings.js` `payFailedNext`; `api/src/services/payments.js` (`payment.failed`) |
| 2.3 | Cancel before payment: nothing to refund | `user.js` `cancelBooking` (`payment_pending`); `web/strings.js` `refundNoPayment` |
| 3 | Late booking warning and required acknowledgement | `user.js` `refundTerms`, `newCheckout` (`LATE_ACK_REQUIRED`); `db/migrations/005_late_ack_and_admin_throttle.sql`; `web/strings.js` `lateTitle`, `lateNone`, `lateAck` |
| 4.1–4.4 | Cancel until start; full before deadline, none after; reason optional | `user.js` `cancelBooking` (`CANCEL_NOT_ALLOWED`, `late_cancel_refund_pct`), `eventDetails` (`can_cancel`); `web/strings.js` `refundFull`, `refundNone`, `reasonLegend`; `web/app.js` (`days: 10`) |
| 4.5 | Freed seat offered to the waitlist | `db/migrations/021_reliability.sql` `offer_freed_seats`; `026_plus_one.sql` `release_seat_on_cancel` |
| 5 | "+1": one booking, cancel together, whole amount, remove before payment | `qatar/docs/decisions/2026-11-14-plus-one.md`; `026_plus_one.sql` (`set_booking_guest`, `guard_booking_seats`, `release_seat_on_cancel`); `web/strings.js` `plusOneCancel` |
| 6 | No-show: no extra fee, no refund | `db/migrations/001_init.sql` `no_show_fee_pct` (CHECK = 0); `api/src/routes/admin.js` `completeSession` |
| 7.1 | Quorum cancellation notice (quoted) | `web/strings.js` `orgBody`; `001_init.sql` `cancel_table_quorum`; `api/src/lib/i18n.js` `QUORUM_FAIL_CHOICE` |
| 7.2 | Rebook (same language, enough seats, alternates first, fee and companion move) or refund | `user.js` `resolutionOptions`, `chooseResolution`; `026_plus_one.sql` `rebook_booking`; `web/strings.js` `optRebookHelp`, `optRefundHelp` |
| 7.2 | Chosen and automatic refunds wait for finance approval | `api/src/services/payments.js` `WAITS_FOR_FINANCE`; `admin.js` refund batch approval |
| 7.3 | 48 h choice; automatic full refund after | `api/src/lib/config.js` `REBOOK_CHOICE_HOURS` (48); `001_init.sql` `refund_unresolved_organizer_cancels`; `db/migrations/004_cron_and_indexes.sql` (every 15 min); `web/strings.js` `defaultRefund` |
| 8.1–8.3 | Waitlist steps (owner's text, 14 Nov) | `web/strings.js` `waitStep1`–`waitStep3` |
| 8.3 | Offer window: `WAITLIST_OFFER_HOURS` (provisional 2 h), never past booking close | `db/migrations/021_reliability.sql`; `api/src/lib/i18n.js` `WAITLIST_OFFER` |
| 8.4 | Joining is free | `user.js` `joinWaitlist` (no payment) |
| 8.5 | One seat per offer; "+1" needs a second free seat | `026_plus_one.sql` header and `hold_seat` (`NOT_ENOUGH_SEATS`) |
| 9.1–9.4 | Automatic full refunds: late payment, paid after cancel, duplicate, wrong total | `api/src/services/payments.js` `applyPspEvent` (`seat_unavailable`, NMX-63, `duplicate_charge`, `payment_total_mismatch`) |
| 10 | Launch wording (quoted); no refund code found | `web/strings.js` `feeLaunchFree`, `feeLaunchNote`; `db/migrations/025_launch_free.sql`; `api/src/lib/config.js` `launchFree`; `docs/decisions/provisional-2026-11-10.md` §2ب item 41 |
| 11.1 | Suspension or ban: future bookings refunded in full | `api/src/routes/admin.js` `caseAction`, `banNow`, `cancelFutureBookings` |
| 11.2 | Card-name rejection: that booking not refunded; others refunded; upheld appeal refunds | `qatar/docs/legal/card-name-check-note.md` §4; `admin.js` `decideIdentityReview`, `appealDecision`; `db/migrations/015_card_name_check.sql` (excluded from the automatic refund) |
| 12.1–12.2 | Original payment method; refund notice, 10 business days | `api/src/lib/i18n.js` `REFUND_DONE`; `api/src/services/payments.js` (`days: 10`) |
| 12.3–12.4 | Refund status labels; failed refund next step | `web/strings.js` `rfRequested`, `rfProcessing`, `rfRefunded`, `rfFailed`, `rfFailedNext` |
| 12.5 | Help through the coordinator | `qatar/docs/legal/privacy-qa-5-draft.md` §8 |
