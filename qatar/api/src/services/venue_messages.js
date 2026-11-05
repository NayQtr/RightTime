// The words of the messages to venues and to the coordinator (016). The request follows the owner's wording of 5 Nov:
// "مرحبا مطعم Nobu ، لديكم حجز لعدد 6 أشخاص (سيدات) عبر تطبيق HerZone ، الموعد هو الخميس ١٢ نوفمبر 2026 الساعة ٧م
//  يرجى زيارة الرابط التالي للقبول او الرفض (رابط إلى صفحتهم الخاص)".
// They go out by WhatsApp once it is connected; until then the coordinator copies them from the admin console.

const day = (iso) => new Intl.DateTimeFormat("ar-QA-u-nu-latn", { timeZone: "Asia/Qatar", weekday: "long", day: "numeric", month: "long", year: "numeric" })
  .format(new Date(iso)).replace("،", "");
const time = (iso) => new Intl.DateTimeFormat("ar-QA-u-nu-latn", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit" })
  .format(new Date(iso)).replace(":00", "").replace(/\s/g, "");

/** kind: request | reminder | coordinator_overdue | coordinator_declined */
export function venueMessage(kind, { venue, startsAt, women, link, reason }) {
  const when = `${day(startsAt)} الساعة ${time(startsAt)}`;
  switch (kind) {
    case "request":
      return `مرحبا مطعم ${venue}، لديكم حجز لعدد ${women} أشخاص (سيدات) عبر تطبيق HerZone، الموعد هو ${when}. يرجى زيارة الرابط التالي للقبول أو الرفض: ${link}`;
    case "reminder":
      return `تذكير: مرحبا مطعم ${venue}، لم يصلنا ردّكم على حجز ${women} أشخاص (سيدات) عبر HerZone يوم ${when}. يرجى القبول أو الرفض من الرابط: ${link}`;
    case "coordinator_overdue":
      return `تنبيه للمنسق: مطعم ${venue} لم يرد على طلب استضافة ${women} سيدات يوم ${when} رغم التذكير. يلزم التواصل معه أو نقل الحجز إلى مطعم آخر من المطاعم المتعاقدة.`;
    case "coordinator_declined":
      return `تنبيه للمنسق: مطعم ${venue} اعتذر عن استضافة ${women} سيدات يوم ${when}${reason ? ` (السبب: ${reason})` : ""}. يلزم نقل الحجز إلى مطعم آخر من المطاعم المتعاقدة.`;
    default:
      return "";
  }
}

export const isForCoordinator = (kind) => kind.startsWith("coordinator_");
