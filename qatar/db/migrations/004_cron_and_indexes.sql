-- 004: scheduled jobs (pg_cron) and covering indexes for foreign keys.
-- The API keeps its on-request fallbacks (release_expired_holds on session/booking paths, the
-- refunds:auto-unresolved admin action), so nothing breaks where pg_cron is unavailable (local PostgreSQL).
SET search_path = app, pg_temp;

-- ---------------------------------------------------------------- foreign-key indexes (Supabase advisor 0001)
CREATE INDEX IF NOT EXISTS admin_approvals_approved_by_fk_idx ON app.admin_approvals (approved_by);
CREATE INDEX IF NOT EXISTS admin_approvals_proposed_by_fk_idx ON app.admin_approvals (proposed_by);
CREATE INDEX IF NOT EXISTS answers_option_id_fk_idx ON app.answers (option_id);
CREATE INDEX IF NOT EXISTS answers_question_id_fk_idx ON app.answers (question_id);
CREATE INDEX IF NOT EXISTS app_config_updated_by_fk_idx ON app.app_config (updated_by);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_fk_idx ON app.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS bookings_budget_tier_id_fk_idx ON app.bookings (budget_tier_id);
CREATE INDEX IF NOT EXISTS bookings_cancellation_policy_version_fk_idx ON app.bookings (cancellation_policy_version);
CREATE INDEX IF NOT EXISTS bookings_questionnaire_response_id_fk_idx ON app.bookings (questionnaire_response_id);
CREATE INDEX IF NOT EXISTS connection_consents_from_user_id_fk_idx ON app.connection_consents (from_user_id);
CREATE INDEX IF NOT EXISTS connection_consents_to_user_id_fk_idx ON app.connection_consents (to_user_id);
CREATE INDEX IF NOT EXISTS event_feedback_table_id_fk_idx ON app.event_feedback (table_id);
CREATE INDEX IF NOT EXISTS event_feedback_user_id_fk_idx ON app.event_feedback (user_id);
CREATE INDEX IF NOT EXISTS event_feedback_venue_id_fk_idx ON app.event_feedback (venue_id);
CREATE INDEX IF NOT EXISTS event_sessions_cancellation_policy_id_fk_idx ON app.event_sessions (cancellation_policy_id);
CREATE INDEX IF NOT EXISTS event_sessions_price_plan_id_fk_idx ON app.event_sessions (price_plan_id);
CREATE INDEX IF NOT EXISTS event_tables_venue_id_fk_idx ON app.event_tables (venue_id);
CREATE INDEX IF NOT EXISTS matching_runs_questionnaire_version_id_fk_idx ON app.matching_runs (questionnaire_version_id);
CREATE INDEX IF NOT EXISTS matching_runs_run_by_fk_idx ON app.matching_runs (run_by);
CREATE INDEX IF NOT EXISTS matching_runs_session_id_fk_idx ON app.matching_runs (session_id);
CREATE INDEX IF NOT EXISTS notifications_outbox_user_id_fk_idx ON app.notifications_outbox (user_id);
CREATE INDEX IF NOT EXISTS payments_user_id_fk_idx ON app.payments (user_id);
CREATE INDEX IF NOT EXISTS price_plans_city_id_fk_idx ON app.price_plans (city_id);
CREATE INDEX IF NOT EXISTS questionnaire_responses_questionnaire_version_id_fk_idx ON app.questionnaire_responses (questionnaire_version_id);
CREATE INDEX IF NOT EXISTS questionnaire_versions_approved_by_fk_idx ON app.questionnaire_versions (approved_by);
CREATE INDEX IF NOT EXISTS refresh_tokens_replaced_by_fk_idx ON app.refresh_tokens (replaced_by);
CREATE INDEX IF NOT EXISTS refunds_approved_by_fk_idx ON app.refunds (approved_by);
CREATE INDEX IF NOT EXISTS refunds_booking_id_fk_idx ON app.refunds (booking_id);
CREATE INDEX IF NOT EXISTS refunds_initiated_by_fk_idx ON app.refunds (initiated_by);
CREATE INDEX IF NOT EXISTS report_actions_actor_id_fk_idx ON app.report_actions (actor_id);
CREATE INDEX IF NOT EXISTS report_actions_report_id_fk_idx ON app.report_actions (report_id);
CREATE INDEX IF NOT EXISTS report_actions_second_approver_fk_idx ON app.report_actions (second_approver);
CREATE INDEX IF NOT EXISTS safety_reports_assigned_to_fk_idx ON app.safety_reports (assigned_to);
CREATE INDEX IF NOT EXISTS safety_reports_booking_id_fk_idx ON app.safety_reports (booking_id);
CREATE INDEX IF NOT EXISTS safety_reports_reported_user_id_fk_idx ON app.safety_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS safety_reports_reporter_user_id_fk_idx ON app.safety_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS safety_reports_table_id_fk_idx ON app.safety_reports (table_id);
CREATE INDEX IF NOT EXISTS support_cases_assigned_to_fk_idx ON app.support_cases (assigned_to);
CREATE INDEX IF NOT EXISTS support_cases_booking_id_fk_idx ON app.support_cases (booking_id);
CREATE INDEX IF NOT EXISTS support_cases_user_id_fk_idx ON app.support_cases (user_id);
CREATE INDEX IF NOT EXISTS table_assignments_matching_run_id_fk_idx ON app.table_assignments (matching_run_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_user_id_fk_idx ON app.user_blocks (blocked_user_id);
CREATE INDEX IF NOT EXISTS user_blocks_report_id_fk_idx ON app.user_blocks (report_id);
CREATE INDEX IF NOT EXISTS user_consents_document_version_fk_idx ON app.user_consents (document_version);
CREATE INDEX IF NOT EXISTS venue_contacts_venue_id_fk_idx ON app.venue_contacts (venue_id);
CREATE INDEX IF NOT EXISTS venues_budget_tier_id_fk_idx ON app.venues (budget_tier_id);
CREATE INDEX IF NOT EXISTS waitlist_entries_session_id_fk_idx ON app.waitlist_entries (session_id);

-- ---------------------------------------------------------------- scheduled jobs
-- Every minute: release seat holds whose payment window passed.
-- Every 15 minutes: create full-refund requests for organizer-cancelled bookings whose rebook/refund
-- choice window (REBOOK_CHOICE_HOURS, 48 by default) has passed. Refunds are created as 'requested';
-- finance sends them with the existing batch approval, exactly like the refunds:auto-unresolved action.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available: scheduled jobs skipped (API on-request fallbacks remain)';
    RETURN;
  END IF;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron could not be enabled here (%): scheduled jobs skipped', SQLERRM;
    RETURN;
  END;
  EXECUTE $q$SELECT cron.schedule('app_release_expired_holds', '* * * * *', 'SELECT app.release_expired_holds()')$q$;
  EXECUTE $q$SELECT cron.schedule('app_refund_unresolved_organizer_cancels', '*/15 * * * *',
    $j$SELECT app.refund_unresolved_organizer_cancels(now() - make_interval(hours => COALESCE(
         (SELECT value::int FROM app.app_config WHERE key = 'REBOOK_CHOICE_HOURS'), 48)))$j$)$q$;
END $$;
