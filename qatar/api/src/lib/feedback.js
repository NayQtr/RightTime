// The reasons a member can pick with a low rating (migration 023). The list is here, not in a route file, because the
// member API validates against it and the admin console returns it, and neither route should have to import the other.
//
// The same six keys are repeated in three clients, because each shows its own words for them:
//   web/app.js (pairs each key with a strings.js key), web/admin/admin.js (English labels for coordinators),
//   app/lib/ui/meetups/feedback_screen.dart (pairs each key with an .arb getter).
// The threshold is repeated beside them in the same way. Nothing can be generated away without taking each client's
// wording with it, so api/test/feedback-vocabulary.test.mjs reads all four files and fails if the keys or the
// threshold drift apart.
export const LOW_RATING_REASONS = ["table_fit", "venue", "food_service", "organisation", "no_shows", "other"];
