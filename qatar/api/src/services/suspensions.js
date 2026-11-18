// A suspension that has run out lifts itself (gap found 15 Nov while drafting the conduct rules: the decision records
// an end date in report_actions.effective_to, but nothing reactivated the account when it passed).
// Runs every minute with the push dispatcher (routes/push.js), like the coordinator-alert and refund ticks.
//
// An account is reactivated only when EVERY suspension recorded against her has ended:
//  - 'suspension' (a decision): effective_to holds the end date the member was told.
//  - 'temporary_suspension' (interim, while an S1 report is reviewed): effective_to is NULL until the decision closes
//    it (liftInterimSuspension), so an open review always keeps the account suspended.
// A ban sets status 'banned', never 'suspended', so it is not touched here. The member was told the end date in the
// decision notice, so no new notification is sent; the audit log records the reactivation with no actor.
import { audit } from "./common.js";

export async function suspensionsTick(sql) {
  const lifted = await sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE app.users u SET status = 'active'
       WHERE u.status = 'suspended'
         AND EXISTS (SELECT 1 FROM app.report_actions a JOIN app.safety_reports r ON r.id = a.report_id
                      WHERE r.reported_user_id = u.id AND a.action IN ('suspension','temporary_suspension')
                        AND a.effective_to <= now())
         AND NOT EXISTS (SELECT 1 FROM app.report_actions a JOIN app.safety_reports r ON r.id = a.report_id
                          WHERE r.reported_user_id = u.id AND a.action IN ('suspension','temporary_suspension')
                            AND (a.effective_to IS NULL OR a.effective_to > now()))
       RETURNING u.id`;
    for (const { id } of rows) await audit(tx, null, "suspension_expired", "users", id, "auto_reactivate");
    return rows.map((r) => r.id);
  });
  return { reactivated: lifted.length };
}
