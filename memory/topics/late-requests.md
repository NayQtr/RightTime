# الطلبات المتأخرة / المؤجلة (late / deferred requests)

When the owner says «الطلبات المتأخرة» or «الطلبات المؤجلة» (same list, 5 Nov), list these items, with what is done and what is still open.
Claude's own open questions to the owner go here too (owner's rule of 5 Nov).

## The list [2026-11-05]

Waiting on the owner (actions):
1. (done 5 Nov) Migration 016 applied in both Supabase projects (verified: 5 tables with RLS, cron, matching); herzone.app promoted to 10ffd65 with the venue page and the design changes.
2. Delete the OLD Gemini API key (it still answers).
3. Restrict the new Gemini key to "Generative Language API" only (Google Cloud Console → Credentials). No website/IP restriction (Supabase has no fixed IP).
4. Rotate keys regularly (Gemini, Supabase token), e.g. every 3 months.
5. Enable Gemini billing before the app is published (owner's decision of 5 Nov: "التحويل المفوتر لاحقا قبل نشر التطبيق").
6. Confirm the admin enrolment for herzone.app/admin was done (token given on 5 Nov, 24 h expiry).
7. The owner's real email for the production admin account (NMX-20).

Waiting on the owner (decisions, explained on 4 Nov):
8. Don't pin the server certificate now.
9. Should the biometric lock also protect the meetup details?
10. Block screenshots or not (recommendation: don't block).
11. A phone number with a fixed code for the Apple reviewer.
12. An admin tool to delete the account of a member who lost her number (after launch, two-person approval).

From the launch checklist (5 Nov):
12a. Backups: Supabase is on the Free plan (no automatic backups). Choose: Pro plan (automatic daily backups) or a daily
     encrypted dump by GitHub Actions (the repo is public, so the dump must be encrypted; the database connection
     string goes in as a GitHub secret by the owner, never through Claude). Then test one restore on staging.
12b. Gemini spend limit: when billing is enabled, set a budget alert and a daily request quota in Google Cloud.
12c. Real payment gateway: test cards / test mode only until launch.

Claude's open questions (waiting for the owner's answer):
13. (done, eab2e63) Secret scan in the build gate: CI fails when a server key format appears in the shipped web files.
13a. Backups: Supabase Pro or a daily encrypted dump by GitHub Actions? (see 12a)
13b. Cadence of the baseline checks: proposed before every production release + monthly; confirm or change.
13c. (done 5 Nov) Design proposals for the website and the app were approved and applied; see qatar/docs/design/herzone.app.md.
13d. Copy proposals from the design pass of 5 Nov (qatar/docs/design/handoff.md section 8), each needs the owner's wording:
     (1) one spelling of the coordinator: «المنسق» or «منسّق»; (2) a next-step line for «لم يكتمل الدفع.», the generic error
     and «تعذّر الاسترداد»; (3) venue decline: replace the browser's OK/Cancel dialog with an in-page confirmation
     (buttons named for the action); (4) screen-reader announcement text for the venue page after accept/decline/arrival.
13e. Contact flow v2 (5 Nov, built to the owner's design). Owner's answers (5 Nov): the word «المنسق» is dropped from the confirmation, which now reads
     «وصلنا طلبك. سيتم الاتصال بكِ من قبلنا.» / "We got your request. We will call you."; WhatsApp message = first name + booking number (confirmed);
     requests only in the admin console (confirmed); NO deletion of handled requests: every completed booking is archived (so closed requests stay as archive;
     account deletion by the member still erases her data, per the privacy policy). Still Claude's wording, awaiting the owner's: «اشرحي المشكلة أو الطلب»,
     «إرسال الطلب», «اكتبي المشكلة أو الطلب أولاً.», «رقم الهاتف غير صحيح.», «الوقت المناسب للاتصال», and ALL English texts (translations).
     Open question: «المنسق» still appears elsewhere (help line «تواصلي مع المنسق المناوب», etc.): remove there too? Not changed.
     Alert to the owner by WhatsApp/push waits for the WhatsApp link. «اتصل بنا الان» restores phone access offline.
13f. (5 Nov) Migration 017 (call requests, amended for v2) must be pasted in BOTH Supabase projects before the contact flow and the production release
     (file: scratchpad herzone-017.sql = db/migrations/017_call_requests.sql + a check; the earlier file sent is OUTDATED; MCP apply_migration times out).
     Then Claude verifies, re-runs the baseline checks, and releases (merge release, CI green, production build, smoke checks, Sentry).

Identity (6 Nov, owner's image, replaces the butter palette): light = almond blossom «زهر اللوز» #F2D9ED with enchanting violet «البنفسجي الساحر» #3A2C39 ink; dark = #3A2C39 with #F2D9ED. Logo kept. Floating rounded top bar; details screen: report is a text link, cancel stands apart, no duplicate status pill. 52/52 contrast pairs pass.
Motion (6 Nov, owner's list): ease-out in, ease-in out 20% shorter, press 0.97, stagger 30 ms, popovers from 0.95 out of their trigger, success pulse, theme circle reveal; tokens stagger/easingIn/easingInOut. Published 54af301. App press 0.97: owner said yes; every button wrapped in `Press` (lib/ui/common/press.dart, 56 buttons + 2 icon buttons). Linear NMX-67/68/69, Notion rows added.
Older palette (5 Nov): light = soft butter «زبدة ناعمة» #EFDFCD with velvet-wine ink #65444E; dark = velvet wine «نبيذي مخملي» #65444E with butter #EFDFCD. Applied to design/tokens.json (web + app), icons, manifest; all 52 contrast pairs pass. Replaced on 6 Nov by the identity above (never published).
Still open in the plan:
14. (done 5 Nov, later) Production released again: herzone-production serves 9d72927 (deployment dpl_GCa4DZJJLFUfrQU3w4Z9tUhWU67k, READY). Checks: release tag herzone-web@9d729270e845, call-requests and admin routes 401 without login, venue page 200, Sentry no new production issues. Migration 017 pasted and verified in both projects. Previously: herzone-production served ca3b960 (PR #5 merged into release by the owner; build started by Claude with the owner's permission). Smoke checks and Sentry clean.
14a. Connect the Vercel project herzone-production to GitHub (Settings → Git, production branch `release`) so a merge into release deploys by itself.
14b. At launch: move the herzone.app domain to herzone-production (production WEB_BASE_URL already says https://herzone.app; until then links in production messages open the staging site). Owner's decision.
14c. Production venue page needs an email provider (no on-screen code in production).
15. Maestro full-journey run needs the branch merged (NMX-56).
16. Blockers NMX-22/23/24/26/28; the real payment gateway must send the cardholder name.
