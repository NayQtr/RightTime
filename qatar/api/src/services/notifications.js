// What a member is told, and when. Both pieces are here rather than in routes/user.js because routes/admin.js opens a
// session for sale and routes/push.js sends the phone notification, so each would otherwise have to import a route file.
import { qa } from "../lib/http.js";
import { decisionLabel, durationText, renderTemplate } from "../lib/i18n.js";
import { notify } from "./common.js";

/** One notification, in her language. Date-valued payload keys are rendered as dates, not as raw ISO strings. */
export function notificationText(n, locale) {
  const fmt = (p) => Object.fromEntries(Object.entries(p || {}).map(([k, v]) =>
    [k, ["date", "deadline", "reveal_at", "appeal_until"].includes(k) && v ? qa(v) : k === "decision" ? decisionLabel(v, locale)
      : k === "name" && !v ? (locale === "en" ? "A tablemate" : "زميلة طاولتك") : k === "window" ? durationText(v, locale) : v]));
  return renderTemplate(n.template_key, locale, fmt(n.payload));
}

// A session went on sale: every open alert of an active member whose current Q01 languages include the session's language
// is closed and answered with one notification (inbox, and her phone if she turned notifications on). Returns how many.
// Only while she can still book it: before booking closes, and with a venue within her Q04 budget (as createBooking's
// BUDGET_CONFLICT); otherwise her alert stays open for the next session.
export async function notifySessionAlerts(tx, sessionId) {
  const due = await tx`
    UPDATE app.session_alerts a SET notified_at = now(), session_id = ${sessionId}
      FROM app.event_sessions s
     WHERE s.id = ${sessionId} AND a.notified_at IS NULL AND now() < s.booking_closes_at
       AND EXISTS (SELECT 1 FROM app.users u WHERE u.id = a.user_id AND u.status = 'active')
       AND EXISTS (SELECT 1 FROM app.questionnaire_responses r JOIN app.answers x ON x.response_id = r.id
                     JOIN app.questions q ON q.id = x.question_id AND q.key = 'Q01' JOIN app.question_options o ON o.id = x.option_id
                    WHERE r.user_id = a.user_id AND r.status = 'submitted' AND o.maps_to->>'language' = trim(s.conversation_language))
       AND EXISTS (SELECT 1 FROM app.questionnaire_responses r JOIN app.answers x ON x.response_id = r.id
                     JOIN app.questions q ON q.id = x.question_id AND q.key = 'Q04' JOIN app.question_options o ON o.id = x.option_id
                     JOIN app.budget_tiers mine ON mine.id = (o.maps_to->>'budget_tier_id')::uuid
                     JOIN app.venues v ON v.city_id = s.city_id AND v.is_active AND s.experience = ANY (v.supported_experiences)
                     JOIN app.budget_tiers bt ON bt.id = v.budget_tier_id AND bt.rank <= mine.rank
                    WHERE r.user_id = a.user_id AND r.status = 'submitted')
    RETURNING a.user_id`;
  for (const d of due) await notify(tx, d.user_id, "SESSION_AVAILABLE", { session_id: sessionId });
  return due.length;
}
