# HerZone — Personality matching (rule version `r2-personality`)

**Status:** Design approved by the owner on 2026-10-30. Implemented (engine, reference engine, migration 011, API, UI).
**Source:** owner request («كل الإجابات معايير تقدير نوع الشخصية، وبناءً عليها يُجمع المتقاربات في نفس الطاولة») and the
owner's concept document `personality_matching_platform_concept_ar.pdf` (sections 3, 5, 6, 11).
**Replaces nothing:** `r1-baseline` and `r1-interest` stay available; `r2-personality` becomes the admin default.

## 1. Owner decisions (verbatim choices)

| Decision | Choice |
|---|---|
| Q23 (children) and Q24 (marital status) | **Used** in matching |
| Q12 energy (introvert / ambivert / extrovert) | **Balanced** within a table (the only non-similarity dimension) |
| Weights | Values & thinking **32%**, Personality & communication **28%**, Social preferences **18%**, Interests **12%**, Lifestyle **10%** |
| Reason shown to members | **Shown**: a general shared-themes line, never anyone's individual answers |
| Reason never uses | age (Q11), work (Q16), children (Q23), marital status (Q24) |

All other dimensions are **similarity** («المتقاربات»).

## 2. What each answer does

### 2.1 Hard constraints (never scored, never broken)

Unchanged from `r1`: same conversation language (Q01), table tier ≤ every member's budget cap (Q04), size 4–6,
no blocked pair, no booking twice, eligibility (paid, consents current, 18+, active).

### 2.2 Scored dimensions

| Dimension | Weight | Items (question → kind) |
|---|---|---|
| Values & thinking | 0.32 | Q13 single (`mix` = 0.5 with any), Q21 scale 1–5, Q22 scale 1–5, Q14 multi |
| Personality & communication | 0.28 | Q12 **table-level balance**, Q15 multi, Q06 multi (`no_pref` ignored), Q17 single |
| Social preferences | 0.18 | Q09 multi, Q18 single (`any` = 0.5 with any), Q19 single, Q20 single |
| Interests | 0.12 | Q05 multi |
| Lifestyle | 0.10 | Q11 ordinal (5 ranges), Q16 single, Q23 single, Q24 single |

Not used: Q07 (practical arrangement; coordinator only). Within a dimension, items have equal weight.

### 2.3 Item similarity (pair a, b → value in [0, 1])

- **single:** 1 if equal, else 0; the wildcard options above give 0.5 against anything.
- **scale / ordinal:** `1 − |rank(a) − rank(b)| / (maxRank − minRank)`.
- **multi:** Jaccard of the two option sets (options flagged `no_pref` removed first).
- **missing:** an item is *skipped* for the pair when either member did not answer it or chose `no_say`
  (Q23, Q24). The dimension score is the mean of the items both answered; a dimension with no shared
  answered item is skipped and the remaining dimension weights are renormalised. A pair with nothing in
  common answered scores `null` and is treated as 0 for optimisation (same rule as `r1`).

### 2.4 Pair score and table score

- `pair(a, b) = Σ_d w_d · dim_d(a, b) / Σ_d w_d` over the dimensions present for that pair. Q12 is not part of `pair`.
- `energyBalance(table) = distinctEnergyLevels / min(3, answeredEnergyCount)` (1 when every present level
  differs, lower when everyone is the same; `null` if fewer than 2 members answered Q12).
- `similarity(table) = 0.6 · mean(pair over all pairs) + 0.4 · min over members of (mean pair with the others)`,
  the same 60/40 mean/cohesion rule as `r1`, so no member is left the odd one out.
- `score(table) = (1 − wE) · similarity + wE · energyBalance`, with `wE = 0.28 / 4 = 0.07`.
  This gives Q12 the same share an item has inside the Personality dimension; if `energyBalance` is `null`,
  `score = similarity`.

All weights are constants in the engine, asserted to sum to 1, and written into each run's explanations.

## 3. Assignment

Same deterministic pipeline as `r1-interest`, with the new `score`:

1. Group the eligible pool into cells by language × budget tier.
2. Seed-stable shuffle, then greedy seating into the computed table sizes.
3. Leftovers placed downward (lower tier tables only).
4. Pairwise swap optimisation between tables, accepted only if the sum of the two table scores strictly rises
   and both tables still satisfy every hard constraint. At most 50 passes.

## 4. Guarantees

- **Determinism:** same inputs + seed ⇒ identical tables, leftovers, explanations and `inputs_hash`.
  The hash now covers every scored answer, so a changed answer yields a different hash.
- **Hard-constraint validation** after every run; any violation throws and nothing is published (unchanged).
- **Questionnaire guard:** the engine holds a feature map keyed by question and option code. Before a run it
  checks every mapped question exists in the published questionnaire with every option it relies on; unknown or
  missing codes fail the run with a named error instead of being silently ignored.
- **Reference parity:** `qatar/matching/matching_engine.py` gets the same `r2-personality`; `parity.test.mjs`
  compares both engines on generated pools.
- **Property tests** on generated pools (hundreds of members, random answers incl. `no_say`): constraints always
  hold; optimisation never lowers the total score; identical seeds give identical output; weights sum to 1.

## 5. Data path

- Migration `011_matching_answers.sql`: `matching_input()` adds, per booking, `answers`: an object
  `{question_key: [option_key, ...]}` for every answered question of that booking's response
  (keeps `q05_topics` for `r1`). Adds `event_tables.match_themes jsonb` for the member-facing reason.
- `runFor` passes `answers` to the engine; the published run stores `match_themes` per table.

## 6. Member-facing reason

- Themes: options shared by at least half the table (and at least 2 members), from Q05, Q09, Q13, Q14, Q15,
  Q17, Q18, Q19, Q20 only. Ranked by how many members share them, then by a fixed question order; top 3 kept.
- Stored as `[{q, o, ar, en}]` using the option labels; shown on the revealed table as
  «يجمعكن: …» / "What you share: …". Never shown before reveal. If no theme qualifies, nothing is shown.
- Never derived from Q11, Q16, Q21–Q24, Q12, Q04, Q01, Q07.

## 7. Privacy

Owner decision (2026-10-30): Q23 and Q24 count from the first run, with no deferral. The privacy notice should
say that answers, including these two, are used to form tables; that wording is for counsel and is tracked as a
legal follow-up, not a code gate.

## 7a. Optimisation detail found in testing

With two clearly different profiles, swap search on the table score stayed at 3+3 per table: the cohesion term
makes every intermediate 4+2 swap look worse. For `r2-personality` the engine therefore climbs from two starts,
the seeded seating as is and the seating first clustered on the sum of pair similarities, and keeps the higher
total table score. The result is never below the single climb.

A second case: with 11 women the tables are 6 and 5 seats. If the 6-seat table starts with five of one profile
and one of the other, no swap helps; the fix is to move one woman. For `r2-personality` each pass therefore also
tries single-member moves between tables (first strictly improving move in a fixed order, up to 200 per pass),
keeping every table within 4..capacity. Measured before the fix: profiles mixed in 115 of 300 random orderings;
after: 0 of 800 (9–12 women), now a permanent test.

Migration 011 also re-pins `matching_input`'s `search_path = app, pg_temp` (set by 002): `CREATE OR REPLACE`
drops function settings, which broke the function for callers whose path does not include `app`.

## 8. Tuning later

Weights are a starting point. Once enough post-meetup ratings exist, compare table scores with ratings and
adjust weights by 3–5 points, as a new rule version (never by editing an existing one).

## 9. Testing

- Unit: each item kind, wildcards, missing/`no_say` skipping, renormalisation, energy balance, weights sum.
- Engine: determinism, constraint validation, optimisation monotonicity, questionnaire guard errors.
- Parity: JS vs Python on generated pools for `r2-personality`.
- API: dry run and publish with `r2-personality`; `match_themes` stored and shown only after reveal; no theme
  ever comes from an excluded question.
- UI: revealed table shows the themes line in Arabic and English.
