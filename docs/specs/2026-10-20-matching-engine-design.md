# Rightime Matching Engine — System Design

**Status:** Draft for review. Design only; no code or migrations written yet.
**Next slice.** Review before implementation (brainstorming → plan → build).

## 1. Problem & data-model decision

Today `events` *is* a single table (`seats`, `attendees_count`, `status`) and a
booking takes one of those seats. The real product: a person books **a night in
their city** (city + date + format); dozens–hundreds book the same night; an
engine splits them into tables of ~6. The table is an **output** of matching,
not the thing booked.

**Recommended model (Option B): add two layers, repoint bookings.**

- **`gatherings`** — the bookable night: `city_id`, `type`, `starts_at`, `name`,
  generic `neighbourhood`, plus matching controls (`cutoff_at`, `target_size`,
  `min_size`, `max_size`, `status`). This is what the Events list shows.
- **`bookings`** — repoint `event_id` → `gathering_id`, keep
  `unique(user_id, gathering_id)`; `status` ∈ confirmed/cancelled/no_show/waitlist.
- **`seatings`** — a table produced by matching: `gathering_id`, label,
  venue fields + `venue_revealed_at`, `status`. ~6 per gathering.
- **`seating_assignments`** — `booking`/`user` → `seating`, with `run_id` for
  idempotency.

Rejected Option A (overload `events` as both night and table): collapses the
moment a night needs two tables, and fights the `unique`/`attendees_count`
machinery.

**Migration sketch:** each current `events` row → one `gatherings` row
(`seats`→`target_size`, `cutoff_at = starts_at − 1d`) with a single backfilled
`seatings` row holding its existing confirmed bookings, so current single-table
events survive as 1-table gatherings. Keep `attendees_count` cached on both
`gatherings` (bookers) and `seatings` (assigned) via trigger.

## 2. Algorithm

**Inputs** (per confirmed booker): `characteristics` {gender, birthdate decade,
children, industry, personality (4 archetypes), interests[], drinks, dietary[]}
+ derived repeat-pair history and reliability.

**Group size:** target 6, bounds [5,7]; `k = round(n/6)` tables, remainder
absorbed within the band.

**Hard constraints:** women-only tables only `gender='Woman'` (re-checked at
match time); never ship below `min_size`; **dietary is info, not a grouping key**;
strongly avoid (penalize) recently-seated pairs.

**Objective — diversity within a cohesion floor:** reward *variety* on identity
axes (gender, age decade, industry, and especially spread the 4 personality
archetypes) while rewarding *overlap* on interests/drinks so there's common
ground. Pure compatibility → echo chamber; pure diversity → no spark.

**Approach — greedy seed + local-swap** (tractable for hundreds, explainable,
deterministic given a seed, re-runnable):
1. partition by hard constraints; 2. decide `k` + capacities; 3. seed tables
with anchors spread across diversity axes; 4. greedily place each person into
the table whose marginal score gains most; 5. bounded local-swap passes;
6. emit `seatings` + `seating_assignments` tagged with `run_id`.

**Score sketch:** `w_div·diversity − ... ` — reward identity spread + interest
cohesion, penalize repeat pairs, out-of-band size, and unfairness. Weights are
config so product can tune mix-vs-comfort without a deploy. Missing /
"prefer not to say" values score neutral.

## 3. When/where it runs

**pg_cron (~every 10–15 min) → Supabase Edge Function `match-gatherings`**;
picks gatherings past `cutoff_at`. **Idempotent & transactional:** compute full
assignment, then in one txn clear the prior `run_id` rows and insert new ones
(a crashed run leaves prior state intact). Re-runs between cutoff and start
handle late cancellations/bookings with **assignment stickiness** (don't reshuffle
someone already notified); a final `locked` cutoff (~start − 2–3h) freezes it.
**Venue reveal** is a pure time-gate in the read path: `venue_*` withheld until
`now() >= venue_revealed_at`.

## 4. Surfacing + RLS

- Events list/detail unchanged in shape — users browse/book `gatherings`.
- Pre-match: "we'll match you into a table of six at cutoff."
- Post-match: "Who's at your table" shows **their own seating's** de-identified
  blurbs; venue only after reveal.
- **RLS:** `gatherings` readable by authenticated; `bookings` own-only;
  `seatings`/`seating_assignments` readable only for the seating the caller is
  assigned to (EXISTS on own assignment). `tablemates` re-keyed from event →
  caller's seating, same privacy model (no PII), with a "not matched yet" shape
  pre-assignment.

## 5. Edge cases

Too few to form a table → hold/extend, merge across formats, or cancel + notify
(+ waive penalty). Odd remainders → absorb in [5,7]. No-shows → recorded after
the event, feed reliability + future matching weighting (conservative
over-booking). Women-only → re-validate gender at match time. Partial run →
transactional swap guarantees all-or-nothing. Sparse profiles → never block.

## 6. Phased build

- **Phase 0** — model migration behind a trivial one-table-per-gathering matcher
  (no visible change); de-risks the schema.
- **Phase 1** — multi-table greedy matcher + pg_cron + `cutoff_at`.
- **Phase 2** — full scoring (diversity + cohesion + repeat-pair) + local-swap.
- **Phase 3** — re-runs/stickiness, cancellation merge/backfill, waitlist, lock
  cutoff, venue reveal, no-show/penalty signals, fairness-over-time.
- **Phase 4** — ops: admin view, manual pin/override, match-run metrics.

## Open questions for product

1. Cutoff timing (24h?) and hard-lock time (2–3h?).
2. Too-few policy: cancel vs merge across formats; is min size firm at 5?
3. Venue source (pool vs ops-attached) and exact reveal time.
4. Diversity-vs-comfort weighting; which axes are must-mix (personality?).
5. Repeat users: hard-ban re-pairing or penalize, over what window?
6. No-show handling: over-book vs reliability penalty; is a real penalty in scope?
7. Waitlist for popular nights, yes/no?
8. Cross-format/neighbourhood merging allowed at all?
