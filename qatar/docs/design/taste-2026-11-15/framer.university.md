# Design Map

Source: https://framer.university/ (single page, 1440x900, captured 15 Nov 2026; page height 8240px, so viewport + 50% + footer shots)

## Spacing Scale
- Base unit: 2px (values sit on 2/4/6/8/10, then 16/20/24, then 44/100)
- Values by frequency: 10px (110), 6px (58), 2px (53), 8px (43), 16px (39), 5px (26), 20px (19), 44px (18), 3px (16), 100px (11), 12px (10)
- Section rhythm: 100px container bottom padding; footer 44px top padding; card grid gap 20px
- Method: flex `gap` (nav 10px, list 20px, footer 16px)

## Font Hierarchy
| Role | Size / line-height | Weight |
|---|---|---|
| Hero title "Framer University" | ~60px (visual) | 500 |
| Section h2 ("Here for you. Every step of the way.") | 56px / 64.4px | 500 |
| Hero subtitle (h1) | 24px / 40.8px | 400 |
| FAQ question, h3 | 18px / 27px | 400 (Book) |
| Body, button label | 16px / 19.2px | 500 |
| Nav, card title, testimonial | 14px | 400 |
| Tag chip, footer, laurel badge | 12px | 400 |

One family, Suisse Intl, in four cuts (400, 450, 500, 600). 14px carries 142 nodes.

## Color Palette
- `#050505` page background
- `#0C0D0D` section band, 23.3%
- `#222426` chip and secondary button fill
- `#FFFFFF` text primary (106 nodes); `#B5B9BA` text secondary (108); `#52585B` muted
- `#1A8CFF` action fill (Get course, nav and hero), 6% of surface
- `#2480FF` action text link (Schedule a session)
- Neutrals: near-neutral, faint cool tint (`#B5B9BA`, `#52585B` have B > R)

## Image Ratios
- Hero: full-bleed background video, 1440 x ~800px
- Blog card cover: ~2.3:1 at 480px wide, radius 4px
- Testimonial avatar: 1:1 at 44px

## Component Tokens
- Radius: 1000px (135, pills and buttons), 4px (107, media), 100px (52, tag chips), 8px, 12px, 2px
- Shadows: `0 2px 8px rgba(5,5,5,0.2)` (24); 1px rings `0 0 0 1px #050505` (24) and `#343639`; one 2-layer ring + glow `0 0 0 1px #272B2D, 0 0 10px 2px rgba(5,5,5,0.4)`
- Grid: 980px container, 2 columns of 480px, gap 20px
- Top bar: sticky, 60px, `rgba(19,20,21,0.95)`; blue pill CTA 34px high at the end
- Primary button: 44px high, radius 1000px, `#1A8CFF`, 16px/500 white label
- Secondary button: 44px, `#222426`, play icon + label + muted duration "0:30"
- Tag chip on cards: 12px, icon 12px, 1px ring, radius 100px
- FAQ: "+" at the start, 18px question, 1px rules, about 76px row pitch
- Floating help button: 48px circle, fixed bottom-end (x 1392, y 812), same place in all three shots
- Motion: `background, box-shadow cubic-bezier(0.44, 0, 0.56, 1)`; testimonial marquee; `:focus-visible` present; no `prefers-reduced-motion`

---

# Taste DNA

### One blue means do this
- **Trigger**: When a dark, photo-led page needs the visitor to find the purchase
- **Decision**: A single blue (`#1A8CFF` fill, `#2480FF` text link) reserved for the next step, everything else in four grays, over colour-coded sections or tinted headings
- **Reason**: When colour only ever means "act here", the eye finds the action without reading; the same blue on a heading would dilute that promise
- **Evidence**: `#1A8CFF` on 6% of surface (two Get course buttons only); `#2480FF` only on Schedule a session; text split `#FFFFFF` x106 / `#B5B9BA` x108; Watch intro sits on `#222426`

### The cost is printed on the button
- **Trigger**: When inviting a visitor to spend time before spending money
- **Decision**: The duration inside the control ("Watch intro 0:30"; "30/60 minutes" before Schedule a session) in muted gray, over a bare verb
- **Reason**: People commit to a known, small cost; an unlabelled "Watch" could mean 30 seconds or 30 minutes and many will not risk it
- **Evidence**: "0:30" in gray after a white label inside a 44px `#222426` pill; support paragraph names the session length before the link

### Sections change floor, not lines
- **Trigger**: When moving from one block to the next on a long dark page
- **Decision**: A background step (`#0C0D0D` band to `#050505`) with no rule between sections; 1px dividers kept only inside lists (FAQ, footer), over rules between every section
- **Reason**: A change of floor says "new topic" without adding another line to look at; rules are kept for rows that must be counted
- **Evidence**: `#0C0D0D` 23.3% vs `#050505`; no divider at the support section edge; FAQ rows with 1px rules; one footer rule above the socials

### Proof wears a name and a date
- **Trigger**: When showing that the course is liked
- **Decision**: A moving row of real posts with a 44px avatar, name, verified mark, handle and date ("Feb 10") over anonymous stars or a satisfaction percentage
- **Reason**: A quote that can be traced to a person on a day reads as a witness; an unsigned score reads as marketing
- **Evidence**: testimonial row under the hero, 14px name `#FFFFFF`, handle and date `#B5B9BA`; 44px avatars; 12px laurel badge "BEST FRAMER CREATOR 2024"
