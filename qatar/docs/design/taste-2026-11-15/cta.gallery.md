# Design Map

Source: https://www.cta.gallery/ (single page, 1440x900, captured 15 Nov 2026; page height 4701px)

## Spacing Scale
- Base unit: 5px (not 4/8)
- Values by frequency: 10px (269), 20px (53), 2px (44), 15px (39), 5px (24), 6px (5), 30px (4), 50px (2), 120px (1)
- Method: flex `gap` (nav gap 2px, footer gap 10px, button gap 10px); paddings 20px on nav, footer and grid cells

## Font Hierarchy
| Role | Size / line-height | Weight | Family |
|---|---|---|---|
| Hero h1 | 46px / 50.6px | 600 | Overused Grotesk SemiBold |
| Section title ("Freshly added CTA's") | 22px / 35.2px | 400 | Inter Display Medium |
| Card title, sidebar label | 18px | 400 | Inter Display Medium |
| Lead / body | 16px / 25.6px | 400 | Inter Display Medium |
| Filter dropdowns | 14px | 400 | Inter Display Medium |
| Button, footer, "Sponsored by" | 12px | 400 | Inter Display Medium |

Scale is not modular (46 / 22 / 18 / 16 / 14 / 12). Weight variation comes from the font file ("Medium" face at weight 400), not from CSS weight.

## Color Palette
- `#0E0F11` page background, 87.5% of measured surface
- `#1A1A1C` sidebar and raised panels, 9.9%
- `#161618` control fill (Submit Your CTA, dropdowns, Load More)
- `#232324` hairline rules between grid cells and sections
- `#C9CBD1` text primary (62 nodes); `#FFFFFF` hero and card titles (10 nodes)
- Decorative, under 1% each: `#836FE9` (Templates pill, sidebar glow), `#FE4787`
- Neutrals: cool grays, very slight blue tint (`#0E0F11`, `#C9CBD1` have B > R)

## Image Ratios
- Gallery thumbnail, wide column: 2.17:1 (rendered 453px)
- Gallery thumbnail, narrow column: 1.81:1 (rendered 337px)
- Sponsor tile: 1.13:1
- Favicon beside card title: 1:1 at 20px; category icon tile 40px

## Component Tokens
- Radius: 5px (237 uses, small controls), 10px (139, thumbnails, buttons, icon tiles), 200px (3, round sponsor buttons)
- Shadows: none
- Grid: 3-column masonry, template 493 / 457 / 403px, gap 0px, 1px `#232324` rules between columns and rows
- Sidebar: fixed 270px, 9 category rows at a 52px rhythm (40px tile + 18px label)
- Button: 12px text, padding 12px 40px, radius 10px, fill `#161618`, 1px hairline
- Motion: `color 0.4s cubic-bezier(0.44, 0, 0.56, 1)`; no `:focus-visible`; no `prefers-reduced-motion`
- Card anatomy: thumbnail (radius 10px) then a row: 20px favicon, 18px title, external-link icon at the end

---

# Taste DNA

### The screenshots are the only colour
- **Trigger**: When building a gallery whose content is other people's brightly coloured CTAs
- **Decision**: A near-black, accent-free chrome (`#0E0F11` on 87.5% of the surface, `#1A1A1C` panels, `#C9CBD1` text, no coloured button fill) over a branded accent on buttons, filters and links
- **Reason**: A visitor is judging the colour of the exhibits; any colour in the frame competes with them and skews the comparison
- **Evidence**: `#836FE9` 0.5% and `#FE4787` 0.3% are the only saturated values; Submit Your CTA and Load More are `#161618` with a hairline; zero box-shadows

### Hairlines carve the grid, not cards
- **Trigger**: When laying out about 60 thumbnails of uneven height
- **Decision**: A 3-column masonry with 0px gap and 1px column/row rules over floating cards with gutters and shadows
- **Reason**: A ruled sheet reads as one catalogue to scan; separate shadowed cards would each ask to be looked at as an object
- **Evidence**: grid template 493 / 457 / 403px, gap 0px; `effects.shadows` empty; thumbnails radius 10px inside unrounded cells; 20px cell padding

### Every category is always one glance away
- **Trigger**: When offering 9 CTA types to browse
- **Decision**: A fixed 270px sidebar with a 40px icon tile plus an 18px label per type over a collapsed menu or a horizontal chip row
- **Reason**: Browsers switch type often; a permanent labelled list with a picture per item removes the open-menu step and lets the eye find a type by shape before reading
- **Evidence**: 9 rows at a 52px rhythm; icon tiles 40px, radius 10px; labels 18px `#FFFFFF`; the two secondary filters are 14px dropdowns, not chips

### A finite page with a door at the end
- **Trigger**: When the collection is longer than one screen
- **Decision**: One Load More button and a reachable footer at about 4,700px over infinite scroll
- **Reason**: A page that ends gives a sense of having seen the set and keeps About and Submit reachable; infinite scroll removes both
- **Evidence**: scrollHeight 4701px; Load More 12px text, `#161618`, radius 10px; a two-line 12px footer after it
