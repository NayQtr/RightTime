# herzone.app: design audit (5 Nov 2026)

Method: the taste pipeline (DOM extraction + screenshots) on the live site at 1440×900 and 390×844, plus the 30
screenshots of the full member journey from `api/test/ui.test.mjs` (360 px, Arabic). Values below come from
`web/tokens.css` (generated from `design/tokens.json`) and `web/styles.css`.
Screens captured mid-transition (the 150–300 ms page entrance, and the 0.6 opacity while a request runs) were
excluded: their washed-out look is timing, not design.

## Design Map

| Token | Value | Use |
|---|---|---|
| Background | `#FAF4EC` | page |
| Surface sunken | `#F3EAE1` | cards, notices |
| Surface | `#FFFCF9` | inputs, tab bar |
| Text / muted | `#251615` / `#60514F` | body / secondary (muted text: 6.9:1 on the page, 6.3:1 in cards; button text on primary 9.4:1, all above WCAG AA) |
| Primary (CTA) | `#7E1E35`, hover `#671027`, subtle `#FBE0E2` | buttons, selected states, headline accent |
| Seat | `#DA915F` | the table illustration |
| Border | `#D6CCC4` | dividers, outline buttons |
| Type | Alexandria (display), IBM Plex Sans Arabic (text) | headings balanced (`text-wrap: balance`) |
| Spacing | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 | gutter 16–20 px; touch target 48 px |
| Radius | 10 / 16 / 24 / pill | cards 16, buttons 16, chips pill |
| Column | `main` max 560 px, 20 px padding | one column on every screen size |
| Motion | 120 / 200 / 320 ms, ease `cubic-bezier(0.2,0,0,1)` | reduced-motion respected |

## Taste DNA

1. **Warm paper, one accent.** Trigger: a women-only social product that must feel safe and calm, not like a dating
   app. Decision: beige `#FAF4EC` ground and a single wine accent `#7E1E35`, used for the CTA, the selected state and
   one word of the headline. Reason: one accent makes the next action obvious on every screen. Evidence: every screen
   has one filled button; everything else is outline, link or sunken card.
2. **The table is the picture.** Trigger: no photos of members may be shown. Decision: an abstract table with filled
   and dashed seats (`#DA915F`) stands in for imagery on welcome, quiz interstitials and the booking card.
   Reason: it shows "4–6 women, some seats still open" without a single face. Evidence: the same drawing appears on
   welcome, quiz results and "your table".
3. **Restraint: one column everywhere.** Trigger: most members book from a phone. Decision: a 560 px column on
   every screen size, rejecting a desktop layout. Reason: one layout to build, test and translate (RTL and LTR).
   Cost: on a 1440 px screen the page is 39% of the width. Exception since 5 Nov: the welcome screen uses two
   columns from 1024 px, and the header follows the content column (see below).
4. **Facts as rows, not prose.** Trigger: dates, places and refund rules decide whether she pays. Decision:
   label/value rows (`dl.facts`, `.facts-list`) with icons and muted labels. Reason: scannable before payment.

## Problems found and status

| # | Problem (evidence) | Status |
|---|---|---|
| 1 | Cards and notices that follow each other touched (≈0–4 px apart) and read as one block: "what you get" card + refund notice; review summary, fee card, late-cancel warning and agreement box. | **Fixed:** 12 px between consecutive cards/notices/lists in `main`. |
| 2 | Desktop: logo pinned 24 px from the right window edge and "English" from the left, about 450 px away from the 560 px content. | **Fixed:** top bar aligned to the content column; tab bar kept within the column from 640 px. |
| 3 | Phone headline broke as «تعرّفي على / ناس.. تفهمك», splitting the phrase. | **Fixed:** «تعرّفي على ناس..» never wraps (Arabic only); now «تعرّفي على ناس.. / تفهمك». |
| 4 | Welcome: the hint «أسئلة قصيرة…» sat 8 px under «ابدئي» and close to «لديّ حساب», so it was unclear which button it described. | **Fixed:** 20 px before «لديّ حساب»; the hint stays with «ابدئي». |
| 5 | Desktop welcome uses a phone layout centred in a wide window (large empty sides). | **Fixed:** two columns from 1024 px (headline, text and buttons on one side; the table drawing on the other, vertically centred). |
| 6 | Review: two-column rows wrap awkwardly («رسم التنظيم (يُدفع الآن)» / «الطعام والمشروبات (تُدفع للمكان): ضمن ميزانيتك متوسط»), and the 10-minute hold timer floats between the agreement box and the pay button. | **Fixed:** label above value under 400 px; the timer is a pill just above the pay button; 12 px between the warning and the agreement box. |
| 7 | Booking details: the 5-step progress labels are small and grey; the current step is told by colour alone. | **Fixed:** done steps carry a ✓ (current stays bold), step labels 13 px instead of 12 px. Also: «إلغاء الحجز» now stands 24 px apart from the help buttons. |
| 8 | The Flutter app was not part of this pass (web only). | Next: same audit on the app's store screenshots. |

Checks after the fixes: 14 browser tests pass (they also check one h1 per screen and no horizontal scroll at 360 px,
under the real Content-Security-Policy).
