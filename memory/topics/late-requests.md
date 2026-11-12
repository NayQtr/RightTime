# الطلبات المتأخرة / المؤجلة (late / deferred requests)

When the owner says «الطلبات المتأخرة» or «الطلبات المؤجلة» (same list, 5 Nov), list these items, with what is done and what is still open.
Claude's own open questions to the owner go here too (owner's rule of 5 Nov).

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
20. Celebration meetups (owner, 7 Nov): a member (example "Sara") books a dinner to celebrate her birthday with women she does not know; HerZone arranges small preparations with the venue. Owner asked for Claude's wording and suggestions; the owner's message ended mid-sentence ("ولكن…"), so the rest is awaited. Claude proposed (not built): (A) a questionnaire question on how she feels about joining another member's celebration, used by matching so a celebration table only gets women who are happy with it; (B) an optional question at booking, "is this date for an occasion?", which alerts the coordinator. Open for the owner: the rest of the message, the Arabic and English wording, who pays for the preparations, the minimum notice, and what the other women are told beforehand.
20a. Built (7 Nov, owner: "موافق على الصياغة، نفّذ"): migration 018 (bookings.occasion birthday|other, support case type occasion_celebration, matching_input from 016 plus occasion), questionnaire QA-2026-05 = v4 + Q25 with the owner's wording (purpose line reuses the approved «لنعرف الأجواء التي ترتاحين فيها.»), booking question on the site and in the app, coordinator case in the admin console (Support requests), engine rule in JS and Python (a celebrant and a woman whose Q25 is not love_to_join/dont_mind, unanswered included, never share a table; parity test covers it). Owner chose a cake icon instead of the 🎂 emoji (site design bans emoji): Lucide "cake" on the site, Icons.cake_outlined in the app. Tests: API/DB/browser 146/146, app 52/52, Python 46/46, real-font layout 360/390/402/430 ar/en light/dark clean. Not yet on the test site or production: needs 018 + seed v5 applied to the database and the API deployed. Open for the owner: minimum notice and what the other women are told (not built), who pays for preparations, whether a celebrant should get priority when the rule leaves someone out, and whether the privacy notice should mention the occasion.

