# FSRS calibration and validation report

Date: 3 November 2026 · Anki 26.9.3 · Branch `fix/fsrs-calibration`

**Question.** The dashboard shows about 88% FSRS-predicted recall against about 100% actual recall
(ARCHITECTURE.md, section 6). Is that a bug in this app, or a real property of the data?

**Answer.** It is real, not a bug. The app's FSRS calculations now match Anki's own engine exactly. The
gap appears because the presets use FSRS's **default parameters**, which don't fit this learner. Anki's own
evaluation reports the same mis-calibration. The investigation found one real but small bug, in same-day
Hard answers. It is fixed, and it was not the cause of the gap.

All numbers below are aggregates from the git-ignored copy `data/collection.anki2` (copied on 3 Nov
2026). No card content is included.

## 1. How the numbers are produced (traced through the code)

| Step | Where | What it does |
|---|---|---|
| Review history per card | `server/fsrsData.ts` `fsrsHistory` | Keeps revlog entries after the last "Forget" reset (type 4, ease 0, factor 0), with type 0–3 (learning, review, relearning, filtered) and ease 1–4; drops manual entries |
| Replay | `src/lib/fsrs.ts` `replay` | Steps FSRS-6 through the history in whole Anki days (rollover hour from the collection config); `predicted[i]` = recall probability just before review *i*, or NaN for a same-day review or the first review |
| Parameters | `server/fsrsData.ts` `readPreset` | Preset protobuf field 7 (FSRS-6, 21 values); falls back to 6/5/3; otherwise the FSRS-6 defaults. Uses the deck group's majority preset |
| Calibration sample | `server/fsrsData.ts`, inside `readFsrsData` | Revlog type 1 (review card) and a predicted value (gap ≥ 1 day); **passed = ease > 1** (Hard, Good and Easy are passes, as in Anki) |
| Display | `src/lib/fsrsStats.ts` `retentionComparison`, `calibrationCurve` → `FsrsAnalytics.tsx` | Sums passed and predicted values; actual = passed / reviews, predicted = mean predicted |

## 2. Findings

### 2.1 Data selection and button semantics are correct (not the cause)

| Sample | Mandarin: n, actual, predicted | Portuguese: n, actual, predicted |
|---|---|---|
| A. review cards only (what the app shows) | 476 · 99.79% · 88.96% | 318 · 100.00% · 87.61% |
| B. every review type with a gap of 1+ days (what Anki's optimiser uses) | 514 · 99.81% · 88.71% | 327 · 100.00% · 87.66% |

- Including learning and relearning reviews that cross a day hardly changes the result. Sample B has exactly
  as many reviews as Anki's optimiser reports ("FSRS items": 514 and 327), so both use the same data.
- Every replayed history starts with a learning entry: no card has a truncated history.
- Reviews were done on time. The median of elapsed days ÷ previous interval is 1.00, and the mean is 1.14
  to 1.16. Neither early nor very late reviews explain the gap.
- The rule that Hard counts as a pass matches Anki. The FSRS papers and Anki's "true retention" both count
  only Again as a lapse.
- Reviews before the 17 Oct 2026 reset of 10,000 cards are left out, as Anki leaves them out. That is why
  only 794 of about 25,000 logged review-card reviews count.

### 2.2 The FSRS-6 implementation matches Anki 26.9.3 (after one fix)

Anki's own engine (the Rust backend bundled with Anki.app) was run on a throwaway copy of the
collection. For every review, it reported the memory state it computes, as shown in Anki's Card Info.

| Check | Before the fix | After the fix |
|---|---|---|
| Stability after each review (within 1%) | 2,122 / 2,221 | **2,221 / 2,221** |
| Difficulty after each review (within 0.01) | 2,221 / 2,221 | 2,221 / 2,221 |
| Predicted recall at each calibration review, largest difference from Anki | 0.096 (mean 0.001) | **0.00000** |

**Bug found:** in a same-day (short-term) review, Anki floors the stability increase at 1 for Hard as well
as for Good and Easy, so only Again can lower stability. `src/lib/fsrs.ts` applied the floor only to
Good and Easy. Synthetic cards answered with Anki's **live** scheduler confirm this: after Again then
Hard, stability stays at 0.212, and Anki's recomputation agrees. The bug lowered the mean predicted recall
by only 0.1 points (88.31% → 88.42% overall), so it is **not** the cause of the gap. The fix is in
`shortTermStability`.

**Stored states:** 728 of 740 cards' stored states (`cards.data`) match the replay. For all 12 others, Anki
26.9.3 recomputes the replay's value from the review log, not the stored one. Each of them has a same-day
Hard answer between 18 and 31 Oct 2026, and their stored values follow the old rule. The installed Anki.app
(26.9.3) dates from 23 Sep 2026. So the most likely explanation is that these cards were answered on another
device, or with an older FSRS, and synced. The data cannot prove this. The impact is small (in the cases checked, stored
stability is 4–13% lower, on 1.6% of cards).

Parameters: both presets have no optimised parameters, so the app correctly uses the FSRS-6 defaults. Anki
stores decay 0.154 and desired retention 0.9 on all 7,510 studied cards, matching the defaults (w20 =
0.1542) and the presets.

### 2.3 The cause: default parameters don't fit this learner

1. **The predicted value is the scheduler's target, by construction.** Anki schedules each review for
   when predicted recall falls to desired retention (90%). Reviews were done on time, so the mean
   prediction at review time is about 88–89% for *any* learner using these parameters. It does not show how
   good the learner's memory is.
2. **Actual recall is much higher than the defaults expect.** 1 lapse in 794 reviews, where the model
   expects about 92. If the predictions were right, a result this extreme would essentially never happen
   by chance, so the mis-calibration is not noise.
3. **Anki's own evaluator agrees.**

| | Mandarin | Portuguese |
|---|---|---|
| Default parameters: Anki log loss / RMSE | 0.132 / 11.2% | 0.132 / 12.4% |
| This app's log loss (sample B) | 0.127 | 0.134 |
| Anki-optimised parameters, time-split evaluation: log loss / RMSE | 0.050 / 3.7% | 0.034 / 3.5% |
| Optimised initial stability, Again / Hard / Good / Easy (days) | 16.2 / 17.5 / 17.5 / 26.2 | 14.9 / 22.8 / 22.8 / 22.8 |
| Default initial stability (days) | 0.2 / 1.3 / 2.3 / 8.3 | same |
| Optimiser health check | passed | passed |

   Anki's optimiser says that, for this learner, a card's memory after the first day lasts about 15–26
   days, not the default 0.2–8 days. Optimising was done only on the throwaway copy; nothing was saved
   to the presets.

4. **Grading pattern (a possible contributor).** Across this collection's whole history, Again was
   pressed on about 0.1% of review-card reviews (22 in 25,073 since 2018, across all decks). The other
   answers break down as Hard 20%, Good 24% and Easy 56%. Either recall really is that strong, or Hard is
   sometimes used for "I forgot". The data can't tell these apart. As a **sensitivity check only**, counting
   Hard as a lapse gives 76.9% actual recall for Mandarin and 92.8% for Portuguese. The app does not and
   should not do this; Anki treats Hard as a pass.

### 2.4 Comparison with Anki's built-in simulator

Both simulators ran from the same cards for 365 days, with default parameters, 90% desired retention, the
presets' review limits and study every day. Counts are review events only, without new-card learning
steps or relearning steps; for this comparison both are switched off in our simulator.

| Deck · new cards/day | 30 days (ours / Anki) | 90 days | 365 days |
|---|---|---|---|
| Mandarin · 0 | 439 / 513 (−14%) | 857 / 991 (−14%) | 1,750 / 1,992 (−12%) |
| Mandarin · 10 | 1,100 / 1,165 (−6%) | 3,986 / 4,176 (−5%) | 23,245 / 24,946 (−7%) |
| Mandarin · 30 | 2,408 / 2,406 (0%) | 10,241 / 10,678 (−4%) | 50,229 / 71,316 (−30%) |
| Portuguese · 0 | 511 / 530 (−4%) | 984 / 939 (+5%) | 1,759 / 1,505 (+17%) |
| Portuguese · 10 | 1,082 / 930 (+16%) | 3,637 / 2,868 (+27%) | 19,596 / 14,547 (+35%) |
| Portuguese · 30 | 2,198 / 1,690 (+30%) | 9,003 / 6,776 (+33%) | 52,522 / 40,174 (+31%) |

- For existing cards, over the next 30–90 days, the two agree within about 15%.
- With new cards, they differ by up to 35%, in opposite directions for the two decks. Neither hits the
  review limit. Supplying FSRS's published default button mix to ours makes Portuguese diverge more (+80%),
  so Anki is not using those defaults either.
- Anki's simulator request has no button-mix setting (`SimulateFsrsReviewRequest`), so Anki chooses one
  internally. This comparison cannot control for that, so the remaining difference can't be attributed
  more precisely. Treat the dashboard forecast as accurate to roughly ±35% for a year with new cards.

## 3. Changes made

| Change | Files |
|---|---|
| Same-day Hard no longer lowers stability (matches Anki) | `src/lib/fsrs.ts` |
| Tests: reference states from Anki's engine for 6 synthetic histories (they fail on the old code) | `src/lib/fsrs.test.ts`, `src/lib/fixtures/anki-fsrs-reference.json` |
| UI: explains that, with default parameters, predicted recall sits near the target; replaces "a reason not yet identified" with the finding above | `src/components/FsrsAnalytics.tsx` |
| Reproducible validation scripts | `scripts/fsrs-validation/` (see its README) |

The model was not otherwise changed. No calibration data was adjusted, and no parameters were optimised in
the app.

## 4. Proposed next steps (not done)

1. **Optimise the FSRS parameters in Anki** (Deck options → FSRS → Optimize, per preset). This is the real
   fix for the gap. It is your decision, because it changes your scheduling: with the optimiser's values,
   intervals would grow considerably. The dashboard picks the new parameters up automatically.
2. **Decide what Hard means for you.** If you sometimes press Hard after forgetting, Anki's
   guidance is to press Again instead. Otherwise FSRS learns that you never forget.
3. **"Your lapse rate" forecast mode** (`recall: 'calibrated'` in `src/lib/simulator.ts`) scales lapses down
   by the observed ratio (about 1.6% of FSRS's) but keeps the default parameters' short intervals. That is
   internally inconsistent: under optimised parameters, intervals would be longer, not just safer. A better
   option would be to offer "optimised parameters" as a scenario once they exist in the preset, or to
   remove this mode. That needs your decision.
4. **Use each card's own preset** in the replay instead of the deck group's majority preset. It makes no
   difference today, because both presets use the defaults.

## 5. Limitations

- One learner, a one-month history after the reset, 794 calibration reviews and one lapse. The optimised
  parameters are fitted to almost no lapses, so they are uncertain, even though the health check passed.
- The comparison used Anki 26.9.3 on desktop. Other Anki clients (AnkiDroid, AnkiMobile) may use other FSRS
  versions (section 2.2).
- The simulator comparison counts review events only, and Anki's internal button mix is unknown.

## 6. Reproduce

```sh
# 1. A Python 3.13 matching Anki.app's bundled backend (see scripts/fsrs-validation/README.md)
<python3.13> -I scripts/fsrs-validation/anki_export.py      # Anki's engine on a throwaway copy
node --import ./scripts/fsrs-validation/ts-resolve.ts scripts/fsrs-validation/compare.ts
<python3.13> -I scripts/fsrs-validation/anki_reference.py   # regenerates the synthetic test fixture
npm test                                                    # includes the Anki reference tests
```
