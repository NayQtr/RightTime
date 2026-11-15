# What HerZone missed: inspiration round 2 (15 Nov 2026)

Sources: cta.gallery, recent.design, framer.university, each run through the taste pipeline (single page, 1440x900).
Measurements are in `cta.gallery.md`, `recent.design.md` and `framer.university.md` in this folder.

Filter used: HerZone's identity stays fixed. That means mauve `primary` for actions and selection, warm beige neutrals
(`bg`, `surface`, `surfaceSunken`), yellow `accent` only as the one small highlight, the logo unchanged, the floating top
bar, the date leaf and the table motif. The items below take the principle from each site, never its look. All three
sites are dark or gray, and none of that is carried over.

Already planned, so left out: sticky bottom bar with her pick on session choice; key under the table motif; 3-step
progress row on review/pay; buttons naming action + amount; confirmation on the control; `role=switch` on account
toggles; notifications grouped by day; one gentle scroll highlight on details.

Already in HerZone, so not proposed again: recent.design's 120 ms `cubic-bezier(0.2,0,0,1)` feedback (HerZone's
`motion.fast` + `motion.easing` are the same values); `:focus-visible` rings; reduced-motion handling; FAQ hairline
accordion (framer.university); finite lists.

Ranked by value to her.

---

## 1. The coordinator is one tap away on meetup day
- **Principle seen**: framer.university keeps support fixed in one place. A 48px round help button sits bottom-end at
  the same spot (x 1392, y 812) in all three screenshots: hero, middle and footer. Help never scrolls away.
- **HerZone screen**: Meetup details (`scrDetails`), phase `day_of`, inside the slim pinned summary (`.pin-bar`) that
  appears under the top bar once the heading has scrolled away.
- **Smallest change**: when `ph === "day_of"` and a coordinator is configured, put a 44px `.icon-btn` with
  `data-contact-open data-booking="{id}"` at the end of `.pin-bar` (this is the existing contact sheet, nothing new). The
  phone icon is 22px in `--c-primary`, gap `var(--s-3)`. Move `aria-hidden="true"` from the bar onto its two text spans
  so the button stays reachable by screen readers. A floating button is not used, because the tab bar and sticky bars
  already own the bottom edge.
- **Value**: on the day she is late or can't find the venue, and the call button is otherwise at the bottom of a long
  page. This is the moment she most needs it.
- **New Arabic wording**: no. The `aria-label` reuses the existing `contactRequest` string.

## 2. The status sits on the photo of each "this week" card, with a visible way in
- **Principle seen**: recent.design puts the facts on the image. There is a "Sponsor" pill top-start, a 24px count badge
  top-end, and a 28px round ↗ button bottom-end on every card (`rgba(0,0,0,.447)` fill, inset 1px white 16% ring). She
  knows what a card is and that it opens without reading below it.
- **HerZone screen**: Home, the swiped peek row (`.photo-card`). Today the status ("Full", "Already booked", seats left)
  is the third meta line under the photo. Photo cards also drop the `.go` chevron, so nothing says "opens".
- **Smallest change**: set `.photo-card .shot` to `position: relative`. Add an `aria-hidden` status pill at
  `inset-block-start: var(--s-2); inset-inline-start: var(--s-2)`, built like `.badge`: padding 4px 10px, `--r-pill`,
  `--t-caption-size`, weight 600. Its background is `color-mix(in oklch, var(--c-surface) 88%, transparent)` with
  `backdrop-filter: blur(8px)`, and `var(--c-surface)` under `prefers-reduced-transparency`. Text uses
  `--c-text`, `--c-danger` for full, `--c-success` for booked. At bottom-end add a 32px round chip with the same fill
  and an 18px chevron in `--c-text`, `chevron-left` in Arabic. Then remove the duplicate status line from the card body,
  since the card's `aria-label` already speaks it. Check the pill text against the fill with `contrast_check.py`.
- **Value**: while swiping she sees at once which tables are full or already hers, and that each card opens.
- **New Arabic wording**: no. It uses the existing `full`, `alreadyBooked` and `seatsLeft` strings.

## 3. The resume card says how long is left
- **Principle seen**: framer.university prints the cost inside the control: "Watch intro **0:30**" (duration in muted
  gray after the white label, 44px pill), and "30/60 minutes" before "Schedule a session". A known, small cost gets
  people to start.
- **HerZone screen**: Welcome, the "You have saved progress" card (`#resume-card`). It shows "Answers saved on this
  device: {n}" but not how much is still to do.
- **Smallest change**: append ` · ` + `timeLeftText(remaining)` to the card's `.caption` line, where `remaining` is the
  number of questions not yet answered (the quiz head already computes it this way). Use `--c-textMuted` and
  `--t-caption-size`, with no layout change.
- **Value**: a woman who stopped halfway sees "about 2 minutes left" and is far more likely to finish. Finishing the
  questionnaire is what lets her book.
- **New Arabic wording**: no new strings. It reuses the existing `timeLeftOne/Two/Few/Under` strings. The owner should
  still see the combined line once before it ships.

## 4. Member voices, signed with a first name and a month
- **Principle seen**: framer.university shows proof as named, dated witnesses. Under the hero runs a row of real posts,
  each with a 44px avatar, a 14px white name, and the handle and date ("Feb 10") in `#B5B9BA`. There are no anonymous
  stars and no percentage.
- **HerZone screen**: "What you get with HerZone" (`scrWhatYouGet`), after the benefits list.
- **Smallest change**: show 2–3 short quotes using the existing `.quote` block (2px `--c-primary` inline-start rule,
  `var(--s-1) var(--s-4)` padding, body 17px / 1.75). Under each, a caption in `--c-textMuted` with first name · month
  only. No photos and no avatars (faces rule). Quotes come only from post-meetup feedback where she ticked a new
  "you may quote me" box, and the owner picks them.
- **Value**: a newcomer to a women-only service in Doha trusts other women's words more than any claim HerZone makes.
- **New Arabic wording**: yes. This needs the consent box label in the feedback form, the section heading, and the
  owner's choice of quotes.

## 5. A home tile's icon turns mauve only when that tile is chosen
- **Principle seen**: framer.university keeps one colour for "do this". `#1A8CFF` covers 6% of the page, on the two
  Get course buttons only, and everything else is gray. cta.gallery goes further: no accent at all in the chrome, so the
  exhibits carry colour.
- **HerZone screen**: Home filter tiles (dinner, coffee). The 36px tile icon (`.tile .i`) is `--c-primary` all the time,
  so the unchosen tiles look selected too.
- **Smallest change**: `.tile .i { color: var(--c-textMuted) }` and
  `.tile[aria-pressed="true"] .i { color: var(--c-primary) }`, with
  `transition: color var(--m-fast) var(--m-ease)` (120 ms). The 2px mauve inset ring on the pressed tile stays.
- **Value**: the filter state reads at a glance, and mauve on home means "chosen" or "act" again.
- **New Arabic wording**: no.
- **Note**: this lowers colour on the resting tiles. Given the owner's "pale" comment on round 3, show it in light and
  dark before building.

## 6. A dated community count on home
- **Principle seen**: recent.design writes "Join 31,832 members, including **270 who signed up yesterday**" (13px
  `#838383`, five 20px avatars). An exact figure tied to a recent day proves the place is alive now.
- **HerZone screen**: Home, one caption line under `.home-sub`.
- **Smallest change**: one `<p class="caption">` (`--c-textMuted`, `--t-caption-size`, margin `0 0 var(--s-5)`) with
  the number of women who sat at a HerZone table in the last 7 days. It comes from a new public aggregate on
  `/api/v1/sessions` (a count only, never names), shown only when the count is ≥ 10 so no small table is identifiable.
  The number is in `.num` (tabular). No avatars.
- **Value**: tells a hesitant member that real women are meeting every week, right where she decides whether to book.
- **New Arabic wording**: yes, the sentence and its plural forms are the owner's wording. It also needs a small API
  addition and the owner's threshold.

## 7. Account rows lead with a small icon tile
- **Principle seen**: cta.gallery gives each of its 9 categories a 40px icon tile (radius 10px) beside an 18px label
  at a 52px rhythm, so a row is found by shape before it is read.
- **HerZone screen**: Account (`scrProfile`), the `.settings` card rows (language, appearance, notifications, privacy,
  data, delete account).
- **Smallest change**: at the inline-start of each `.settings a/button`, add a 40px tile built like `.benefits .bi`
  but neutral: `--r-sm` (10px), background `--c-surfaceSunken`, a 20px icon in `--c-textMuted` (`--c-danger` for
  delete). Row gap `var(--s-3)`, and `min-height: 56px` is unchanged. The icons come from the existing set.
- **Value**: faster to find "notifications" or "delete my data" in a list of six or more rows, and the screen looks
  less like plain text, which was the owner's round-3 complaint.
- **New Arabic wording**: no.

## 8. Each week heading carries its count
- **Principle seen**: recent.design marks multi-image cards with a 24px count badge ("3", "4"), and cta.gallery ends
  the list with an honest Load More. Both tell her how much is there before she scrolls.
- **HerZone screen**: Home, the `.week-group > h2` headings ("This week", "Next week", "Later").
- **Smallest change**: after the heading text add `<span class="num">· {n}</span>` in `--c-textMuted`, same 13px
  size, recounted in `paint()` when a day or kind filter hides cards.
- **Value**: she sees "This week · 4" and knows whether to swipe the row or look further down.
- **New Arabic wording**: no, the number only. The owner may prefer words, which would then be her wording.
