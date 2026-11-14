# الطلبات المتأخرة / المؤجلة (late / deferred requests)

When the owner says «الطلبات المتأخرة» or «الطلبات المؤجلة» (same list, 5 Nov), list these items, with what is done and what is still open.
Claude's own open questions to the owner go here too (owner's rule of 5 Nov).

## Production release of e41e896 [2026-11-14] — DONE

Owner's approval: «نعم، أنزلها الآن» (14 Nov). Baseline checks recorded (b87e7ce). CI on b87e7ce failed on two admin-console
browser tests (alerts screen h1 timeout; low-match marker count) that pass locally alone and in full runs and had passed
CI on the same code one commit earlier; root cause NOT found (suspected timing under load). While looking, found Claude's
own slip: the identity step's .btn/.input sizes also reached the admin console and the venue page (shared styles.css);
both now keep their previous sizes (e41e896, CSS only, made after the recorded baseline run). CI green on e41e896 →
`release` fast-forwarded f3adf75 → e41e896 → production dpl_Do4JpBRjdyrjLkqtrNHq5E6CNgxQ and staging
dpl_GEziAnLnS6EaMJV7eVBeXaJskDA2 (the owner allowed both). After: both serve herzone-web@e41e896355fd; smoke checks pass
on both; live herzone.app phone field shows the flag picture, 227 countries, no page error; questionnaire 200.
Open: watch the two admin tests; if either fails in CI again, treat it as real and find the cause.

## Reference-sites study, round 2 [2026-11-14] — IN PROGRESS
Owner (14 Nov): browse the 10 sites for real, take an idea from EACH, no general verdicts; the current site is «خالي من
الحياة تقليدي». Never answer a repeated request with "already studied". Five research agents (2 sites each); then
before/after mockups, the owner's approval, then build. Aesop blocks automated browsers (403 on three pages, not bypassed).
All ten browsed 14 Nov (muji.com 502 → muji.eu used; Aesop blocked, memory only). One idea each, PROPOSED, nothing built:
Apple: sections and cards rise 16 px and fade in, 600 ms, 120 ms apart, once. Framer: answers dim on press, fill on release.
Duolingo: the questionnaire replies to each answer in one line (owner's wording) and the progress bar starts part-filled.
Stripe: one real number above the welcome headline + Start repeated lower (clashes with the owner's «لا شيء تحت ابدئي»).
Linear: the next-meetup card as a double-framed object, rows appearing one by one. Notion: tinted tiles above the list.
Pentagram: /about with a strict 4-size type scale and quote-then-photo rhythm. Aesop (memory): tone-matched photo hero on
welcome. MUJI: this week's meetups as a peek row of photo cards. Airbnb: week strip as the only filter, with a live count.
Mockups sent: welcome with a photo instead of the table diagram; home with a photo peek row (light and dark). The photos
are the round-3 atmosphere set already on /about; their use in the product still needs the owner's approval (item 21).

## Phone field redesign + identity proposals [2026-11-13]

Owner sent a reference image (one box: flag, chevron, +code, number; list with flags). Mockup approved («نعم، كما في
الصورة»), list alphabetical only (owner's choice), no search box (11 Nov rule kept). Built web + app (d9b5cf4).
OWNER'S CORRECTION (remember for every future output): «It's not emojis, it's flags» — flags are real round flag
PICTURES (circle-flags, MIT; ops/build-flags.mjs → web/flags/*.svg, app/assets/flags/*.png), never emoji (4ea2893).
Both on staging (4ea2893); NOT yet released (needs the owner's approval). Owner also approved «جهّز المقترحات»: before/after
proposal images for the other elements; the owner chose «All» → built on web and app (b0c03c7): fields/buttons 56 px with a
focus halo, the code in six boxes, answers as outlined cards, raised meetup cards, account sections as rounded cards.
306/306 + 138/138 tests, real-font check clean. Staging deploy of b0c03c7 needs the owner's «Allow» (the Vercel call now asks
for approval); production release needs the owner's explicit approval.

## Production release of f3adf75 [2026-11-13] — DONE

Owner's approval: «نعم، أنزلها الآن» (13 Nov), then «Go» for the deployment. Baseline checks recorded; CI green on f3adf75;
`release` fast-forwarded d3b171c → f3adf75. Vercel did not build on the push (production branch still not `release` in the
project settings), so Claude created the production deployment (dpl_J2HRpSYvUu4nR8xQQYjvmnhzfx6a) with the owner's Allow.
After: web tag herzone-web@f3adf75a8313; smoke checks all pass; new admin routes live (today 401 without sign-in);
welcome hint gone; ابدئي opens the questionnaire; Sentry: no unresolved production issue in 24 h.
Staging brought to the same commit the same evening (owner: «كمل»; dpl_5tPyNjQsPwfFEoFvvy7kmBotFn5P, tag
herzone-web@f3adf75a8313, staging smoke checks pass); it had been on 7d42e0f since 12 Nov. Linear NMX-20 closed.
Live walk of herzone.app (13 Nov, after the release): welcome → 21 questions and every interstitial → «ما اسمك الأول؟» →
«رقم جوالك»; no page error. A real number there gets «الخدمة غير متاحة مؤقتًا.» (503, no SMS provider; read from the code,
not tried live). Claude's slip: the number field is not type=tel, so the walk script typed «تجربة» into it and pressed
Next once; the API answered 400 and nothing was stored (no otp_challenges row, no user, no audit row).
The Vercel MCP has no field for the production branch; it stays a dashboard setting (owner) or one "Allow" per release.
Open: the Vercel production branch setting (so a push to `release` builds by itself); «بقي نحو بضعة دقائق» → «بقي نحو بضع دقائق»: owner approved («صححها», 13 Nov), changed on web and app,
NOT yet released. Owner (13 Nov): SMS provider and payment gateway «still not ready». Owner wrote «Active» but the
admin account is NOT activated yet (no enrol attempt reached the server; the enrol page works, checked with the request
blocked before it left the browser).

## herzone.app: «الاستبيان غير موجود» after ابدئي [2026-11-13] — FIXED; owner's admin account ACTIVATED (checked 14 Nov)

Done 13 Nov with the owner's answers (email nayeffr@gmail.com, name «المالك», role owner): admin account created in
production (id 9290aa62…, audit rows admin_create and admin_enroll_token), one-use enrolment token valid 24 hours, given
to the owner in chat (not stored in the repository). QA-2026-05 published in production with the owner as approver
(audit questionnaire_publish, reason owner_approved_in_chat); its content hash matches staging's QA-2026-05. Checked on
herzone.app: ابدئي → «نبدأ في الدوحة» → «السؤال 1 من 21»; /api/v1/questionnaires/preview 200.
Still open: the owner enrols at herzone.app/admin/#/enroll before the token expires (if it lapses, Claude issues a new one);
what the number-check step shows until launch (owner decides later, owner's wording).

Before the fix:

The owner found it (screenshot). Cause: production has never had a published questionnaire (only QA-2026-04, draft);
staging has QA-2026-05 published. It showed once herzone.app moved to the production project. Claude's miss: after the
domain move only pages and API were smoke-checked, not the visitor flow. Publishing needs a real approving admin in
production (database rule: published needs approved_by + published_at, approved_by must be an admin), and production has
no admin. Owner's choice: publish the questionnaire now, decide later what the number-check step shows until launch.
Next: owner gives the email (and name) for her/his admin account (also NMX-20) → Claude creates it with a one-use
enrolment link (herzone.app/admin/#/enroll) → publishes QA-2026-05 with the owner as approver → checks ابدئي on herzone.app.
After that the flow still stops at the number check (no SMS provider in production) and at sign-up (no legal documents
in production): the owner decides later what to show there (Arabic wording from the owner).

## Production release of d3b171c, and two open items [2026-11-12]

Released with the owner's approval («اسمح لك»): the five untangle batches, refunds (one send per refund, an unknown outcome
never resent, a refusal recorded and reported), safety alerts (an unfinished page is sent again; "Not confirmed yet" /
"reached no one" in the admin console), identity errors logged. Baseline checks recorded; CI green; web tag
herzone-web@d3b171ce03d7; Edge Function `api` v17; smoke checks all pass.

Open:
- ~~Every-minute call not set up in production~~: done 13 Nov with the owner's approval («فعل»). `PUSH_DISPATCH_URL` in
  production now points at the production API (ap-south-1); pg_cron calls it every minute and the first runs answered 200
  with all three checks (member push, coordinator alerts, refunds). Undo: set the value back to ''.
- ~~Sentry after this release~~: checked 13 Nov after the owner allowed the call: no unresolved production issue in 24 h.
- Small untangle items after the release: done (bb050a2), released 13 Nov (f3adf75). The big split (web/app.js,
  the contact sheet in event_details_screen.dart) is deferred, approved by the owner («موافق», 12 Nov).
- The refund rules must be re-tested against the real PSP before it takes real money.

## Design study of 10 reference sites [2026-11-13] — DONE (809781e), released 13 Nov (f3adf75)

Owner: «كلها». Item 1 threshold = 3 (owner's choice). Item 3 cancelled («لا شيء تحت ابدئي»); the owner then confirmed
(«نعم») the hint line «أسئلة قصيرة تأخذ دقائق قليلة.» goes too: removed on web and app (3349073, released 13 Nov). Built 1, 2, 4, 5 on web and app (item 5 is
admin only); landing pages after sign-in unchanged (Today is first in the menu, the landing page only for researcher and
developer, who had none). Root fix found on the way: scroll-padding for the sticky bars (WCAG 2.4.11).
Goes out with the next release, with the owner's approval.

Original proposal:

Captured with Playwright at 390 and 1440: apple, duolingo, linear, pentagram, airbnb, notion, stripe, framer. muji.com was
in maintenance (security notice), aesop.com blocked automated browsers (403 challenge, not bypassed). Proposed, nothing built:
1 seats shown only when few are left (MUJI restraint; owner sets the threshold)  2 card -> meetup details continuity
transition (Apple)  3 three trust facts under the welcome button (Stripe; Arabic wording = owner's)  4 micro-interactions:
selection check, button loading state, desktop hover (Framer)  5 admin "Today" overview + Ctrl/Cmd-K jump (Notion, Linear).
Not now: search filters (Airbnb; too few sessions), points/streaks (Duolingo; wrong tone for trust), editorial photography
(Aesop; wait for real photos from the closed pilot, no faces), desktop typographic pass (Pentagram; later).

## ui-ux-pro-max review [2026-11-13]

Owner asked for "All" (site, consoles, app). Member site: 13 screens x 4 widths x ar/en x light/dark, no findings (contrast,
targets, names, headings, focus, overflow all clean). App: 9 screens, Flutter guidelines: labels all pass; one target
(table code, 42 px at 430 wide, copyable text) left as is; contrast flags were pixel-sampling misreads (all 60 token pairs
pass). Admin console: 5 findings fixed with the owner's approval (cb20865, released 13 Nov in f3adf75; was to go out with
the next release after the owner's approval): nav 44 px, table links 44 px, session-form heading 44 px, enrol link 44 px,
fields 16 px and inline fields 44 px. Pre-existing, left as is: "Open sale" sits a few px lower than its row on desktop.

## Country picker: every country except Israel [2026-11-11]

Owner's decision (11 Nov), built on `rightime-app`: sign-in takes numbers from EVERY country except Israel (+972).
The phone field is now two boxes — a clickable calling-code box starting on +974 that opens a searchable list of every
country, and the number box beside it — on the website and in the app. Qatar keeps its strict 8-digit pattern; any
other country takes any valid international number and the server decides. "Qatar numbers only" is gone everywhere
(`qatarOnly` deleted from web/strings.js and both .arb files and from both welcome screens; `phoneHelp` is now the
first sentence alone; the server's UNSUPPORTED_COUNTRY message no longer names Qatar). Decision page:
`qatar/docs/decisions/2026-11-11-phone-countries.md`.

OPEN FOR THE OWNER:
1. **Migration `024_phone_countries.sql` must be pasted into BOTH Supabase projects** (staging and production) before
   this reaches either; without it the stored `PHONE_ALLOWED_COUNTRY_CODES` row still says `974` and only Qatar is
   accepted. (+972 is refused by the code itself, whatever the row says.)
2. **Three new texts are Claude's wording and need the owner's own** (they are the only new member-facing copy):
   `countryLabel` «رمز الدولة» / "Country code", `countrySearch` «ابحثي عن دولة» / "Search for a country",
   `countryNone` «لا توجد دولة بهذا الاسم.» / "No country matches that."
3. **The server's UNSUPPORTED_COUNTRY message** was rewritten to be accurate: «لا نقبل الأرقام من هذه الدولة.» /
   "We don't accept numbers from this country." Owner's wording awaited.
4. The app shows the already-approved «رقم الهاتف غير صحيح.» / "That phone number isn't valid." (the `csPhoneBad`
   text, same as the server's INVALID_PHONE) when a non-Qatar number is clearly not a number. Confirm that reuse.
5. Country names in the list are factual data written by Claude (ISO 3166 short names, Arabic and English). One
   source: `qatar/api/src/lib/countries.js`; `node qatar/ops/build-countries.mjs` regenerates the website's and the
   app's copies. Tell us if any Arabic country name should read differently.

## Provisional decisions [2026-11-11]

Owner (10 Nov): handle every item, including those needing a decision, provisionally and set aside for review; skip what blocks.
Done: all 8 units built and merged into `rightime-app` (migrations 019, 020, 021, 023; nothing applied to production).
The register of every provisional choice, how to change it, the blocked items, owner actions and provisional texts:
`qatar/docs/decisions/provisional-2026-11-10.md` (Arabic). Items listed there as built are provisional, not final: the owner reviews them.
Still open from it: section 3 (blocked) and section 4 (owner actions), plus the two text questions at the end of section 5.

## Staging publish done [2026-11-11]

Migrations 018, 019, 020, 021, 023 and questionnaire QA-2026-05 applied to the staging database
(fvodcnqmxskgzziwuwmz), verified against the files (function bodies hash-identical).
The owner renewed SUPABASE_ACCESS_TOKEN in Vercel, and the staging web + API deployed from rightime-app
(commit 7093072). Smoke checks all pass: the four pages 200, API health 200, member and admin routes 401
without sign-in. /about and /about/en are live and the only indexable pages. The questionnaire served is
QA-2026-05 with Q25. Test paths (otp_dev_mode, mock_payments) are open on staging, as intended there.
Production is untouched and still needs the owner's approval.

Owner wording approved 11 Nov: the time left in the questionnaire (one minute / two minutes / a few minutes).

## Production release done [2026-11-11]

Owner approved. Released 5c46b68 (the 8 provisional units, the review fixes, the time-left wording).
Baseline checks recorded in qatar/docs/security/baseline-checks.md. CI green (one browser test flaked once;
it passed on re-run and 4 of 4 locally). Migrations 018-021 and 023 applied to the production database
(pwxxulqgdydrkowmtkia), all five new tables with deny-all RLS, 51 tables with RLS and none client-readable.
Pushed rightime-app to release, deployed herzone-production, smoke checks all pass (API 200, member and admin
401 without sign-in, TEST PATHS NOW REPORT NONE OPEN, mock checkout 404). Sentry: no issues in the hour after.

NOT done in this release, and production cannot serve a member until the owner settles them:
- Production has NO admin user (0 rows), so nobody can sign in to the admin console there.
- The questionnaire on production is still QA-2026-04 in DRAFT. The v5 seed signs off with the seeded owner
  admin id, which does not exist on production, so it was not run; no approver was invented.
- No published legal document (terms, conduct, privacy), so a member cannot complete sign-up.
- No venue and no session, so there is nothing to book.
- herzone.app still serves staging (item 14b); production is reachable only at herzone-production.vercel.app,
  behind Vercel SSO except on a custom domain.

## Production "no internet" error, fixed [2026-11-11]

The owner opened https://herzone-production.vercel.app on a phone and saw «حدث خطأ. حاولي مرة أخرى.»
with «لا يوجد اتصال بالإنترنت.». Root cause (traced, not guessed): the production API's CORS_ORIGINS was
`https://herzone.app` only, so a page served from herzone-production.vercel.app got NO
Access-Control-Allow-Origin header, the browser blocked the response, the fetch threw, and the app showed its
offline text. Verified by comparing: staging allows its own origin; production allowed only herzone.app.
Fix: CORS_ORIGINS on production is now `https://herzone.app,https://herzone-production.vercel.app`.
Verified after: the production origin is allowed, herzone.app still allowed, an unknown origin still gets no
header (no wildcard). The welcome page then loaded with no error banner and no failed request.
The real fix remains item 14b: point herzone.app at herzone-production. Then the vercel.app origin can be
dropped from the list again.

Still open on production: no admin user, questionnaire still draft, no published legal document, no venue,
no session. The owner chose the admin display name "HerZone Owner" but has not yet given the email address.

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

Waiting on the owner (decisions, 7 Nov: design phases and celebration meetups; details in items 17-20a below):
Design (photos, sound, store):
21. Which of the 8 round-3 photos go on the website, and which in the app (sheet sent 7 Nov; files in scratchpad adobe-5-1/out).
22. Redo photo 4 (male waiter and chefs seen from behind) and photo 6 (bottles on a shelf behind the glass, likely syrups)? Not used in the marketing kit until decided.
23. Approve the 3 GIFs (steam, iced latte, candle), or redo with stronger, longer motion (32 frames, 1.5 credits each).
24. The 8-second video is from round 1 (pink and violet): keep, or regenerate in the warm café style (about 128 credits)?
25. Website and app colours: keep the 6 Nov identity and let the warm photos bring the warmth (Claude's recommendation), or move the UI palette warmer too. The logo never changes.
26. Approve the 11 app sounds (tap, pull-to-refresh, success, notification, sheet, switch, error) and the Qatari-style music, or ask for changes.
27. The real service fee for the store screenshots: the booking shot shows the tests' sample "59 ر.ق".
28. Remove "Asia/Qatar" from the app's meetup details, as was done on the website (0ddd837)?
29. English captions for the English store screenshots (owner's wording).
30. Phase 7: approval to put the approved photos and sounds into the website and app, then to publish.
Higgsfield credits: 220.08 of the owner's 300 used; 79.92 left.
Celebration meetups:
31. Priority for the celebrant: when the rule leaves one woman out, should the celebrant keep her seat? (Claude recommends yes.)
32. Minimum notice before the date for a celebration booking (proposal: 3 days); needs the owner's wording for the message.
33. What the other women at the table are told beforehand, and whether her first name is shown or a general line such as "one of the guests is celebrating her birthday".
34. Who pays for the preparations (cake, candle, decoration): the celebrant, the organising fee, or the venue.
35. Should the privacy notice mention that the occasion is kept with the booking? Legal text not changed.
36. Publish to the test site: apply migration 018 and seed_questionnaire_v5.sql to the staging database and deploy the API (CI green on 11851dc). Production only with the owner's approval afterwards.
Development plan (10 Nov, qatar/docs/plans/2026-11-10-development-blueprint.md, section 14 has the full questions):
37. SMS provider for sign-in codes (T3, launch condition): production returns 503 today (api/src/routes/user.js line 108, no provider). International, Qatar-local, or WhatsApp with SMS fallback? Paid; the owner decides and adds the key as a Supabase secret.
38. Visitors' phone numbers (T12): ANSWERED 11 Nov — every country except Israel. Built, shipped to staging and production. The restricting sentence is deleted in both languages with no replacement, and guards.test.mjs now fails if it comes back in the website strings, either .arb file or the server's messages. Only the SMS-provider consequence is still open (a local provider may not reach foreign numbers).
39. Payment gateway (T4, launch condition), and whether it accepts cards from outside Qatar.
40. Coordinator alert for an S1/S2 report during a meetup (T13, launch condition): today it writes an audit row only (user.js line 1020), nothing is sent. Who is on duty each night, which channel (push, SMS, or both as spec v0.3 says), and after how many minutes it escalates, to whom.
41. Pricing: organising fee per booking, subscriptions (plans.js shows 51.99 / 119.99 / 223.99 QAR, display only), or both.
42. Devices: support iPad/tablet in the stores? Keep the one-column member layout on desktop (recommended)?
43. Sessions per week at launch and in which districts (decides when day/district filters appear; proposal: more than 8).
44. Step counting for sign-up and booking on our own server, without outside trackers (U2)? A privacy-notice line may be needed, in the owner's or counsel's wording.
45. Coordinators: how many per night, desktop or phone (decides A1/A3), and is an English-only admin console enough?
46. Encouragement in the questionnaire limited to progress and time left, no streaks, badges or points (U3)?
47. Real-font check rule: keep as is, with automatic screenshots only as an aid (recommended), or replace it with a permanent test?
48. Approve the plan's stages; target launch date in Q1 2027; length of the closed trial (proposal: two weeks); the postpone list if time is short.
49. Is spec v0.3 (docs/qatar-phase2/Qatar_Phase2_Completion_v0.3.md) still the reference for screens and texts? When the built product differs, which wins?
Done on 10 Nov without a decision (no new text): four website screens (home, my events, inbox, decisions) show the error and a retry on a failed load instead of an empty list; guard tests for Arabic/English text parity (site and app) and the offline file list; design docs aligned with the code (colours, press 0.97).

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
13k. (11 Nov, review fixes) Arabic plural in the questionnaire's time left: «بقي نحو {m} دقيقة» is wrong for 2 to 10 minutes
     (web/strings.js timeLeft, app_ar.arb timeLeft). Proposed, not changed until the owner gives the wording:
     1 «بقي نحو دقيقة واحدة», 2 «بقي نحو دقيقتين», 3-10 «بقي نحو {m} دقائق», 11 and more «بقي نحو {m} دقيقة»
     (in the .arb as an ICU plural: =1, =2, few, other).
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

Third release of 12 Nov, DONE: both sites serve herzone-web@7d42e0f698ed (production dpl_7XAJwZvgDoaDdziAgtXMJ7KerVmD, staging dpl_3Km4ifxSoRZR9VPdcv5K44UoyPFA). Smoke checks all passed on both and Sentry shows no production issue first seen in the hour. Verified on the live production stylesheet, not just by the build succeeding: it carries :root[lang="ar"] .hero-welcome h1, :root[lang="ar"] .about-hero h1 { font-size: min(calc(var(--u) * 1.9500), 7vw); }.
Welcome headline, one line in Arabic (12 Nov, owner: «صغر خط ... بقدر يسمح بأن يكون سطر واحد فقط»): at 32px the line needs 397px and the narrowest phone gives the heading 328, so the Arabic size follows the viewport — 7vw capped at 1.95u — on the website, on /about and in the app (where the Flutter welcome computes box.maxWidth * 0.07, clamped 18–31.2, for Arabic only). The cap is 1.95u not 2u because /about gives the line 397px where the full size wants 397.5. English is untouched and still two lines: a different sentence, and fitting it would have meant shrinking it much further. A new app test (booking_ui_test.dart) asserts one line at 320/360/390/402/430 with the real fonts.
Measurement lesson, cost me two wrong readings: counting lines with getClientRects().length on a block always returns 1, and grouping Range rects by top is fooled by the yellow highlight's padding offsetting its rect. The reliable test is element height divided by line-height. Also cloning the heading to measure its one-line width only works if the clone stays inside the same ancestor, or the selectors that set its size stop matching.
Also: invented a full commit SHA from the short one again and Vercel refused it with incorrect_git_source_info. Read it with git rev-parse. Second time this exact mistake has happened in this project.
Second release of 12 Nov, DONE: both sites serve herzone-web@9b6c631fb5dd (production dpl_HwMpKSBVm7EaQVme1hVK268Z3XCk, staging dpl_FfVA5FaWwkjBd3sqY6bovUGKxunK), each a production-target build so the API went with it. Production smoke checks all passed after the deploy and the live production strings.js no longer contains deviceNote. Correction worth remembering: telling the owner to press "Redeploy" on herzone-production would have re-shipped the OLD commit, because no deployment of the new one existed there to redeploy — with no git connection the only way to ship a new commit is the Vercel create_deployment call (or item 14a). Said so plainly.
Launch offer ON (12 Nov, owner: «شغّل العرض»): PRICING_LAUNCH_FREE = true on staging AND production. Undo is one statement: UPDATE app.app_config SET value = 'false' WHERE key = 'PRICING_LAUNCH_FREE';
Welcome screen, device note removed (12 Nov, owner: «يكفي أن يرى المستخدم الميزة لحاله»): «نحفظ تقدّمك على هذا الجهاز فقط...» and its English twin are gone from the website, the app, both .arb files, the CSS rule and the ui test (which now asserts the absence). Checked first that the privacy notice still discloses device storage — it does, section 3 in both languages — so nothing is left undisclosed.
Store caption for 06_book chosen by Claude under the owner's «افعل ما تراه مناسبًا»: «احجزي مقعدك — مجاني لفترة محدودة» / "Book your seat — free for a limited period". The offer inside the screenshot is one small line, so the caption is where it carries.
Release of 12 Nov, DONE. Production serves herzone-web@1c78a72fb1b3 (deployment dpl_2mLfKSzBaoNoKLg74HGDqZZ2pXa1) and staging the same commit (dpl_7paVo2rPS3YGWD9RrHsZTz31F6gd); both builds were production-target, so each deployed its own API as well as its website. Order kept: baseline checks run and recorded, CI green on f24c235, migrations 024 and 025 applied to both projects, `release` fast-forwarded to 1c78a72, staging built and smoke-checked, then production built, smoke-checked and Sentry checked. Smoke checks after the deploy: every line passed on both (pages 200, member and admin routes 401, no open test path on production, mock checkout 404). Sentry: no production issue first seen in the two hours around the release. "Sign-up for everyone" is now really live and was proved on production, not assumed: +447700900123 gets past the country check and stops only at "no SMS provider configured" (503), where the old code answered UNSUPPORTED_COUNTRY; +972501234567 is still refused with UNSUPPORTED_COUNTRY. Neither probe stores anything (both fail before a challenge is created). Note on the earlier hold-up: every Vercel call needed an approval, which arrived only when the owner asked where it was; and pushing `release` still does not build by itself, so item 14a (connect herzone-production to GitHub) is still worth doing.

Identity v0.5 (11 Nov, owner's palette image, «تصرف، تحل محلها» — it replaces the 6 Nov palette): mauve #913768 (primary), beige #C29A74 (the warm neutrals: bg #F7EDE3, surface #FFFAF4, surfaceSunken #EDDCC9, border #E0CBB4), yellow #FDD001 (accent). Yellow measured 10.7:1 as a fill with dark ink and 1.34:1 as text on light, so it is only ever a fill: the emphasised word in the welcome heading (owner, 11 Nov) and nothing else. The logo keeps its own colour through a new `brand` token (#3A2C39 light, #F2D9ED dark) — the palette must never recolour it. Seats around the table motif stay mauve, never yellow (owner: «النقط حول الدائرة لا تخليها صفره»). 60/60 contrast pairs pass; the badge in the filled next-meetup card was fixed at cause (mix 20%→14%, 4.41:1 → 5.05:1). Commit a545cd2.
Country picker, final shape (11 Nov, owner: «مب لازم تكتب شي لرمز الدولة، فقط دروب داون يختار رمز دولته والافتراضي قطر»): a plain native `<select>`, no visible label, no search box — on the website and in the app alike (the app sheet is now one plain list). Default Qatar, 227 countries, Israel absent from the list and refused by the code itself. The select is 9rem wide so «+974 قطر» and «+974 Qatar» are not cut off at 360 px; measured gap to the number box = 0 at 360/390/402/430, ar and en, light and dark, with the real fonts. `countryLabel` is deleted outright — the owner answered «احذف country label» on 11 Nov, so the text is gone from the website, the app and both .arb files, screen-reader name included; what a screen reader announces now is the chosen option itself, «+974 قطر».
The same yellow highlight is defined once in styles.css and shared with the public page /about, which had carried its own rule and so still showed the welcome word in mauve after identity v0.5. The app's welcome heading got the same highlight (TextSpan backgroundColor), leaving the headline text itself untouched so screen readers and tests still see the plain line.
"Sign-up for everyone" (11 Nov, owner approved for production): migration 024 applied to BOTH staging (fvodcnqmxskgzziwuwmz) and production (pwxxulqgdydrkowmtkia); PHONE_ALLOWED_COUNTRY_CODES is now "*" and PHONE_BLOCKED_COUNTRY_CODES exists and is empty in both. It does NOT take effect in production yet: the code on `release` parses the setting with countryCodes(), which keeps only 1-3 digit codes and falls back to ["974"] for anything else, so production still accepts Qatar numbers only and nothing broke. It opens the moment the new code is released. Told the owner.
Item 28 (11 Nov): the app's meetup details now name the zone the owner's way — "الموعد: 7:30 م · GMT+3". The IANA id "Asia/Qatar" stays in the code (it is the correct identifier) and is never shown. Checked with the real fonts at 360/390/402/430, ar and en, light and dark. The website still shows no zone at all (owner's earlier decision 0ddd837); whether it should mirror the app is open.
Identity defect found while regenerating the store screenshots: the app drew the refund note with `info` (a steel blue) at 12% alpha, which washes out grey over the warm v0.5 background. It now uses the sunken beige surface, as the same note does on the website; only the late/partial warning keeps a tint (book_screen.dart, cancel_screen.dart). Provisional — the owner can reverse it.
Item 41, the launch price (11 Nov, owner approved option (أ) with their own wording): a new setting PRICING_LAUNCH_FREE (migration 025, ships OFF) switches what the member is told. While it is on, the booking review — the last step — shows the amount struck through beside «مجاني لفترة محدودة», with «يُخصم المبلغ للتحقق من البطاقة ويُرد إليكِ كاملًا.» under it; and the earlier steps say nothing about money at all («ما نذكر الماديات في بداية التسجيل»): the What-you-get page and the session-choice strip carry no amount. The amount itself never changes, so the card-name check — the real women-only gate — keeps working and the price_minor > 0 constraint is untouched. Covered by qatar/api/test/launch-free.test.mjs (4 tests, including a browser pass that fails if an amount reappears before the last step) and two app tests. English wording is provisional.
Welcome screen (11 Nov, owner: «قصر المسافات لان الشاشة طويلة جدا», marked on a screenshot): the app's welcome had two free-growing Spacers that left a hole above and below the table motif on a tall phone. The gaps are now small and fixed and the whole block is centred in the height the phone gives it, with the language button pinned top-right in a Stack; on a short phone the block keeps its natural height and the page scrolls. First attempt used Expanded, which forced a height and cut the last line on the Android size — caught by looking at the regenerated screenshot, not by a test.
Store screenshots regenerated in identity v0.5 (ar and en, ios-6.9 and android-phone) and reframed. NOT ready to upload: 06_book still shows the tests' "59 ر.ق" while the owner's advertised price is "free for a limited period", so that caption and that screen need the owner's own wording.
Identity (6 Nov, owner's image, replaces the butter palette): light = almond blossom «زهر اللوز» #F2D9ED with enchanting violet «البنفسجي الساحر» #3A2C39 ink; dark = #3A2C39 with #F2D9ED. Logo kept. Floating rounded top bar; details screen: report is a text link, cancel stands apart, no duplicate status pill. 52/52 contrast pairs pass.
Motion (6 Nov, owner's list): ease-out in, ease-in out 20% shorter, press 0.97, stagger 30 ms, popovers from 0.95 out of their trigger, success pulse, theme circle reveal; tokens stagger/easingIn/easingInOut. Published 54af301. App press 0.97: owner said yes; every button wrapped in `Press` (lib/ui/common/press.dart, 56 buttons + 2 icon buttons). Linear NMX-67/68/69, Notion rows added.
Older palette (5 Nov): light = soft butter «زبدة ناعمة» #EFDFCD with velvet-wine ink #65444E; dark = velvet wine «نبيذي مخملي» #65444E with butter #EFDFCD. Applied to design/tokens.json (web + app), icons, manifest; all 52 contrast pairs pass. Replaced on 6 Nov by the identity above (never published).
Still open in the plan:
14. (done 5 Nov, later) Production released again: herzone-production serves 9d72927 (deployment dpl_GCa4DZJJLFUfrQU3w4Z9tUhWU67k, READY). Checks: release tag herzone-web@9d729270e845, call-requests and admin routes 401 without login, venue page 200, Sentry no new production issues. Migration 017 pasted and verified in both projects. Previously: herzone-production served ca3b960 (PR #5 merged into release by the owner; build started by Claude with the owner's permission). Smoke checks and Sentry clean.
14a. ✅ LINKED 13 Nov: herzone-production is now linked to NayQtr/RightTime (get_git_deployment_context), and the old
     project "rightime" was deleted by the owner (it served nothing: rightime.vercel.app answered 404, no env vars). Live
     checks after: herzone.app and herzone-production.vercel.app serve herzone-web@d3b171ce03d7 (staging:false), staging
     still serves its site. No deployment was triggered by the link. Production branch NOT confirmed (the owner could not
     find the setting; Vercel's default is the repo default branch add-rea-mcp-permissions). Safe either way: the Ignored
     Build Step builds only ref=release AND VERCEL_ENV=production. At the next release: push `release`, wait ~3 min; if no
     production build starts, create it as before (one owner "Allow") and set the branch then.
     Earlier: STATUS 13 Nov ~01:05 UTC: the owner tried but could not find where to set the production branch; Vercel still lists
     herzone-production as NOT linked (get_git_deployment_context lists only qatar-mvp-staging and an older project
     "rightime", both linked to NayQtr/RightTime and building previews of every push). Recommendation given: skip 14a for
     now; releases keep working through Claude's create_deployment call plus one owner "Allow". The production build guard
     (only release + production) stays and is harmless. Side note: the old "rightime" project builds a preview of every
     push for no known purpose; worth deleting later with the owner's approval.
     Original item: Connect the Vercel project herzone-production to GitHub (Settings → Git, production branch `release`) so a merge into release deploys by itself.
     Steps sent to the owner 13 Nov: https://vercel.com/rightime/herzone-production/settings/git → Connect Git Repository →
     GitHub → NayQtr/RightTime (install the Vercel app for that repo only if asked); production branch `release` (same page,
     or Settings → Environments → Production → Branch Tracking); Ignored Build Step = "Only build production"; leave Root
     Directory `qatar/web` and the build commands alone. Then Claude checks the link. Checked 13 Nov: preview builds never
     deploy the API (ops/deploy-api-from-vercel.mjs exits unless VERCEL_ENV=production).
14b. ✅ DONE 13 Nov 00:56 UTC: herzone.app serves production (owner removed both domains from staging; Claude added
     herzone.app and www.herzone.app → 308 to herzone.app on herzone-production; release tag herzone-web@d3b171ce03d7,
     staging:false, CORS 204 for https://herzone.app, every production smoke check passes; smoke default production web
     is now https://herzone.app). Original item: At launch: move the herzone.app domain to herzone-production (production WEB_BASE_URL already says https://herzone.app; until then links in production messages open the staging site). Owner's decision.
     Steps sent to the owner 13 Nov. Facts checked: herzone.app is registered at Vercel on Vercel nameservers (no DNS change);
     production CORS_ORIGINS already lists https://herzone.app; production WEB_BASE_URL is https://herzone.app.
     Prerequisite on Claude: staging WEB_BASE_URL is ALSO https://herzone.app, so before the move set it to
     https://qatar-mvp-staging.vercel.app (otherwise staging mock-checkout and message links open production).
     DONE 13 Nov by Claude (owner: «نفذ وقلل علي العمل»): staging WEB_BASE_URL is now https://qatar-mvp-staging.vercel.app
     (staging smoke checks pass); herzone-production Ignored Build Step = build only when VERCEL_GIT_COMMIT_REF=release AND
     VERCEL_ENV=production (the GitHub default branch is add-rea-mcp-permissions, which must never build production).
     Adding herzone.app to production failed 409 domain_already_in_use and no tool removes a project domain, so the owner's
     only steps are: Remove both domains from qatar-mvp-staging, and Connect Git + production branch `release`. A background
     watcher wakes Claude when herzone.app stops serving staging, to add both domains to production and smoke-check.
     Then the owner removes www.herzone.app and herzone.app from qatar-mvp-staging (Settings → Domains), adds herzone.app
     to herzone-production as Production with www.herzone.app redirecting to it (308), and Claude runs
     `SMOKE_PRODUCTION_WEB=https://herzone.app node qatar/ops/smoke.mjs production` and checks the release tag.
14c. Production venue page needs an email provider (no on-screen code in production).
15. Maestro full-journey run needs the branch merged (NMX-56).
16. Blockers NMX-22/23/24/26/28; the real payment gateway must send the cardholder name.
17. Design phase 4, round 2 (7 Nov): the owner said the round-1 images were pink and violet like the site and app, so the page looked one-colour. Cause: Claude had put #F2D9ED and #3A2C39 in the image prompts. Regenerated 8 images in warm sand, cream, coffee and saffron tones (Qatari café: americano, iced latte, Spanish latte, saffron cake, tiramisu, cheesecake; no kunafa), plus 11 synthesised UI sounds and a Qatari-style instrumental. Credits used so far 185.33 of the owner's 300. Open: (a) which images to approve for the site and app; (b) whether the site and app palette should also move warmer, or keep the 6 Nov identity and let the photos bring the warmth; (c) approve the UI sounds and music.
17a. Round 3 (7 Nov): owner said round-2 images looked like a home, not a café or restaurant, and asked for GPT Image 2.6 in Higgsfield for images and GIFs (round 2 already used gpt_image_2_6; the prompts lacked venue cues). Regenerated 8 venue images (barista bar, cake display, wide café, restaurant table, waiter tray, café terrace, reserved seat, toast in café) and 3 GIFs (steam, iced latte swirl, candle). Three first takes rejected by Claude (men in the background, a bottle wall) and redone. Flagged for the owner: image 4 shows a male waiter and chefs from behind; image 6 has bottles on a shelf behind the glass (likely syrups). Credits used 220.08 of the owner's 300. Open: approve images and GIFs; palette question in item 17 still open.
18. Design phase 5 (Adobe), started 7 Nov on the owner's "move to Adobe". 5.1 done: the 8 round-3 photos uploaded to Creative Cloud (herzone/photos/), toned in Photoshop (day set: saturation -6, highlights -10, contrast +5; evening set 4/6/7: saturation -12, highlights -20, darks +10, contrast +3), then cut to card 1080x1350 + 720x900, hero 1920x1080 + 1280x720, app 1080x1920 + 720x1280 (WebP, JPEG fallback). 5.3 fonts: Adobe font lookup refused ("account type doesn't allow access"); not needed, the site and app load Alexandria and IBM Plex Sans Arabic from Google Fonts. 5.2 store screenshots wait for the owner's caption wording (Arabic and English). 5.4 deck PDF/Express next.
18a. Phase 5 finished (7 Nov). Owner answered "All": captions approved as proposed, deck as PDF and Express. 5.2: store test gains 06_book and 07_account; framed sets in qatar/docs/store/framed/ (ios-6.9 1320x2868, android-phone 1080x1920), commit 71c6986. Before upload: the booking shot shows the tests' sample fee "59 ر.ق" (owner must give the real fee), and the app's meetup details still shows "Asia/Qatar" (removed on the website in 0ddd837; app not changed without the owner's word). English store set waits for English captions. 5.4: deck PDF made from the Slides artifact (13 slides, real fonts, no overflow). Express export refused by Adobe ("account type doesn't allow access"), not worked around; the deck HTML is in Creative Cloud at herzone/deck/.
19. Design phase 6 (Canva), 7 Nov: marketing kit of 4 Instagram posts (1080x1350) and 2 stories (1080x1920), Adobe-toned photos, only the owner's approved lines, logo geometry unchanged in the dark-theme colour #F2D9ED. Image 4 (male waiter) left out pending the owner. Uploaded to Canva as two PDFs (file ids oAHaQUDt4Dg posts, oAHaQergBms stories); they sit in Canva Uploads (open there to edit). Folder "HerZone — حزمة التسويق" created (FAHaQbFSkog) but moving the files into it failed with a Canva server error. Phase 7 (put approved assets in the site and app, then publish) waits for the owner: which images, the palette question (item 17), sounds and music, and publish approval.
20. Celebration meetups (owner, 7 Nov): a member (example "Sara") books a dinner to celebrate her birthday with women she does not know; HerZone arranges small preparations with the venue. Owner asked for Claude's wording and suggestions; the owner's message ended mid-sentence ("ولكن…"), so the rest is awaited. Claude proposed (not built): (A) a questionnaire question on how she feels about joining another member's celebration, used by matching so a celebration table only gets women who are happy with it; (B) an optional question at booking, "is this date for an occasion?", which alerts the coordinator. Open for the owner: the rest of the message, the Arabic and English wording, who pays for the preparations, the minimum notice, and what the other women are told beforehand.
20a. Built (7 Nov, owner: "موافق على الصياغة، نفّذ"): migration 018 (bookings.occasion birthday|other, support case type occasion_celebration, matching_input from 016 plus occasion), questionnaire QA-2026-05 = v4 + Q25 with the owner's wording (purpose line reuses the approved «لنعرف الأجواء التي ترتاحين فيها.»), booking question on the site and in the app, coordinator case in the admin console (Support requests), engine rule in JS and Python (a celebrant and a woman whose Q25 is not love_to_join/dont_mind, unanswered included, never share a table; parity test covers it). Owner chose a cake icon instead of the 🎂 emoji (site design bans emoji): Lucide "cake" on the site, Icons.cake_outlined in the app. Tests: API/DB/browser 146/146, app 52/52, Python 46/46, real-font layout 360/390/402/430 ar/en light/dark clean. Not yet on the test site or production: needs 018 + seed v5 applied to the database and the API deployed. Open for the owner: minimum notice and what the other women are told (not built), who pays for preparations, whether a celebrant should get priority when the rule leaves someone out, and whether the privacy notice should mention the occasion.

