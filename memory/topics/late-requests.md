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
13a. Backups (6 Nov, Claude's recommendation, owner said do it): daily age-encrypted pg_dump by GitHub Actions now (.github/workflows/db-backup.yml, qatar/ops/db-backup.sh, steps in qatar/docs/ops/backup-restore.md; round trip tested locally), Supabase Pro at launch. Owner: make age key, add secrets SUPABASE_DB_URL (session pooler) + BACKUP_AGE_RECIPIENT, run once, test restore on staging.
13i. (7 Nov) Fixes agenda: 19 items in the Notion database «إصلاحات هيرزون» (https://app.notion.com/p/b020674ff9434e2a98ae8de7ab7b1d4e); the owner marks decisions there, then Claude implements the approved ones in priority order.
13j. (7 Nov) Design phases (Figma -> Higgsfield -> Adobe -> Canva -> code). Phase 1 done in Figma file https://www.figma.com/design/qCSzd7AhxvqSqYYl2TV5M2 (variables Light/Dark as two collections, 12 text styles, Button/Chip/Icons/Logo/Top bar/Tab bar/Session card/Contact sheet). Figma Starter MCP limit (20 calls/month, View seat) reached on 7 Nov: Figma phases 2-3 wait for the monthly reset or a plan change (owner's decision; no purchase). State ledger: scratchpad figma-ds-state.json (copy below in this note if lost: fileKey qCSzd7AhxvqSqYYl2TV5M2, pages Cover 0:1 / Foundations 2:14 / Components 2:15).
13g. GitHub default branch is the stale `add-rea-mcp-permissions`: scheduled/manual workflows (db-backup, Maestro app-e2e) only run from the default branch (dispatch returned 404). Owner: set default branch to `rightime-app`.
13h. (done 6 Nov, 2ee806b) Light/dark switch in the Flutter app (profile), remembered on the device.
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
17. Design phase 4, round 2 (7 Nov): the owner said the round-1 images were pink and violet like the site and app, so the page looked one-colour. Cause: Claude had put #F2D9ED and #3A2C39 in the image prompts. Regenerated 8 images in warm sand, cream, coffee and saffron tones (Qatari café: americano, iced latte, Spanish latte, saffron cake, tiramisu, cheesecake; no kunafa), plus 11 synthesised UI sounds and a Qatari-style instrumental. Credits used so far 185.33 of the owner's 300. Open: (a) which images to approve for the site and app; (b) whether the site and app palette should also move warmer, or keep the 6 Nov identity and let the photos bring the warmth; (c) approve the UI sounds and music.
17a. Round 3 (7 Nov): owner said round-2 images looked like a home, not a café or restaurant, and asked for GPT Image 2.6 in Higgsfield for images and GIFs (round 2 already used gpt_image_2_6; the prompts lacked venue cues). Regenerated 8 venue images (barista bar, cake display, wide café, restaurant table, waiter tray, café terrace, reserved seat, toast in café) and 3 GIFs (steam, iced latte swirl, candle). Three first takes rejected by Claude (men in the background, a bottle wall) and redone. Flagged for the owner: image 4 shows a male waiter and chefs from behind; image 6 has bottles on a shelf behind the glass (likely syrups). Credits used 220.08 of the owner's 300. Open: approve images and GIFs; palette question in item 17 still open.
18. Design phase 5 (Adobe), started 7 Nov on the owner's "move to Adobe". 5.1 done: the 8 round-3 photos uploaded to Creative Cloud (herzone/photos/), toned in Photoshop (day set: saturation -6, highlights -10, contrast +5; evening set 4/6/7: saturation -12, highlights -20, darks +10, contrast +3), then cut to card 1080x1350 + 720x900, hero 1920x1080 + 1280x720, app 1080x1920 + 720x1280 (WebP, JPEG fallback). 5.3 fonts: Adobe font lookup refused ("account type doesn't allow access"); not needed, the site and app load Alexandria and IBM Plex Sans Arabic from Google Fonts. 5.2 store screenshots wait for the owner's caption wording (Arabic and English). 5.4 deck PDF/Express next.
18a. Phase 5 finished (7 Nov). Owner answered "All": captions approved as proposed, deck as PDF and Express. 5.2: store test gains 06_book and 07_account; framed sets in qatar/docs/store/framed/ (ios-6.9 1320x2868, android-phone 1080x1920), commit 71c6986. Before upload: the booking shot shows the tests' sample fee "59 ر.ق" (owner must give the real fee), and the app's meetup details still shows "Asia/Qatar" (removed on the website in 0ddd837; app not changed without the owner's word). English store set waits for English captions. 5.4: deck PDF made from the Slides artifact (13 slides, real fonts, no overflow). Express export refused by Adobe ("account type doesn't allow access"), not worked around; the deck HTML is in Creative Cloud at herzone/deck/.
19. Design phase 6 (Canva), 7 Nov: marketing kit of 4 Instagram posts (1080x1350) and 2 stories (1080x1920), Adobe-toned photos, only the owner's approved lines, logo geometry unchanged in the dark-theme colour #F2D9ED. Image 4 (male waiter) left out pending the owner. Uploaded to Canva as two PDFs (file ids oAHaQUDt4Dg posts, oAHaQergBms stories); they sit in Canva Uploads (open there to edit). Folder "HerZone — حزمة التسويق" created (FAHaQbFSkog) but moving the files into it failed with a Canva server error. Phase 7 (put approved assets in the site and app, then publish) waits for the owner: which images, the palette question (item 17), sounds and music, and publish approval.

