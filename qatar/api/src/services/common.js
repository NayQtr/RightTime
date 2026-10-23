// Shared service helpers: notifications outbox, audit log, seat tokens, phase computation.
import { hmacB64 } from "../lib/crypto.js";

export async function notify(tx, userId, templateKey, payload = {}, channel = "push") {
  await tx`
    INSERT INTO app.notifications_outbox (user_id, channel, template_key, locale, payload)
    SELECT id, ${channel}, ${templateKey}, locale, ${tx.json(payload)} FROM app.users WHERE id = ${userId}`;
}

export async function audit(tx, actorId, action, entity, entityId, reasonCode = null, ipTrunc = null) {
  await tx`
    INSERT INTO app.audit_logs (actor_id, action, entity, entity_id, reason_code, ip_trunc)
    VALUES (${actorId}, ${action}, ${entity}, ${entityId}, ${reasonCode}, ${ipTrunc})`;
}

// Opaque, per-viewer seat token for a tablemate (never a user or booking id) — used by the
// connection picker (SCR-09) and the private report (SCR-10).
export const seatToken = (keys, viewerBookingId, otherBookingId) =>
  "s_" + hmacB64(keys.seatTokenKey, `${viewerBookingId}:${otherBookingId}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

export async function currentTable(tx, bookingId) {
  const [row] = await tx`
    SELECT t.* FROM app.table_assignments a JOIN app.event_tables t ON t.id = a.table_id
     WHERE a.booking_id = ${bookingId} AND a.is_current`;
  return row || null;
}

// v0.3 §3.4 visibility phases, computed server-side.
export function computePhase(booking, session, table, now = new Date()) {
  const s = booking.status;
  if (s === "payment_pending") return "pending_payment";
  if (["cancelled_by_user", "cancelled_by_organizer", "expired", "payment_failed"].includes(s)) return "cancelled";
  if (s === "waitlisted") return "forming";
  const locked = table && ["locked", "completed"].includes(table.status);
  if (s === "completed" || (locked && now >= new Date(session.ends_at))) return "completed";
  if (!locked) return "forming";
  if (now >= new Date(session.check_in_opens_at)) return "day_of";
  if (now >= new Date(session.reveal_at)) return "revealed";
  return "locked";
}


// Captured payment for a booking, following rebooked_from_booking_id (v0.4 C10: the fee moves with a rebook).
export async function capturedPayment(tx, bookingId) {
  const [row] = await tx`SELECT app.captured_payment_for(${bookingId}) AS id`;
  if (!row || !row.id) return null;
  const [p] = await tx`SELECT * FROM app.payments WHERE id = ${row.id} FOR UPDATE`;
  return p;
}
