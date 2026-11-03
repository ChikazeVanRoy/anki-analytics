# FSRS calibration and validation

Validated against Anki 26.9.3. This note describes the method and the general conclusions. Figures from any
real collection stay out of the repository: `scripts/fsrs-validation/` writes them to the git-ignored `data/`
folder.

**Question.** With default parameters, the dashboard can show a large gap between FSRS-predicted recall and
actual recall. Is that a bug in this app, or a real property of the data?

**Answer.** It is a real property of the data. The app's calculations match Anki's own engine, and Anki's
evaluator reports the same mis-calibration. The review that asked this question found one small bug, in
same-day Hard answers, which is fixed and was not the cause of the gap.

## 1. How the numbers are produced

| Step | Where | What it does |
|---|---|---|
| Review history per card | `server/fsrsData.ts` `fsrsHistory` | Keeps revlog entries after the last "Forget" reset (type 4, ease 0, factor 0), with type 0–3 (learning, review, relearning, filtered) and ease 1–4; drops manual entries |
| Replay | `src/lib/fsrs.ts` `replay` | Steps FSRS-6 through the history in whole Anki days (rollover hour from the collection config); `predicted[i]` = recall probability just before review *i*, or NaN for a same-day review or the first review |
| Parameters | `server/fsrsData.ts` `readPreset` | The newest non-empty of `fsrs_params_6`, `_5`, `_4` (protobuf fields 6, 5, 3), upgraded to FSRS-6 as Anki does (`toFsrs6Params`); otherwise the FSRS-6 defaults. Each card uses its own home deck's preset |
| Calibration sample | `server/fsrsData.ts`, inside `readFsrsData` | Revlog type 1 (review card) and a predicted value (gap ≥ 1 day); **passed = ease > 1** (Hard, Good and Easy are passes, as in Anki) |
| Display | `src/lib/fsrsStats.ts` `retentionComparison`, `calibrationCurve` → `FsrsAnalytics.tsx` | Sums passed and predicted values; actual = passed / reviews, predicted = mean predicted |

## 2. Conclusions

- **Data selection is correct.** The rule that Hard counts as a pass matches Anki's true retention and the FSRS
  papers. Adding learning and relearning reviews that cross a day barely changes the result.
- **The FSRS-6 implementation matches Anki.** Anki's Rust backend, run on a throwaway copy of a collection,
  agreed with the replay on stability, difficulty and predicted recall at every review checked.
- **The bug that was fixed.** In a same-day review, Anki floors the stability increase at 1 for Hard as well as
  for Good and Easy, so only Again can lower stability. `shortTermStability` in `src/lib/fsrs.ts` now does too.
- **Predicted recall is the scheduler's target, by construction.** Anki schedules a review for when predicted
  recall falls to desired retention. If reviews are done on time, the mean prediction sits just under that
  target for any learner, so it says nothing about how good that learner's memory is.
- **Default parameters may not fit a learner.** Compare Anki's evaluator on default and optimised parameters
  (log loss and RMSE) to see this. Optimising in Anki (Deck options → FSRS → Optimize) is the real fix, and it
  changes scheduling, so it stays the user's decision. The dashboard picks up new parameters automatically.
- **Grading habits matter.** Anki and FSRS treat Hard as a pass. A learner who presses Hard after forgetting
  will show near-perfect retention, and the data cannot tell that from real recall. The app shows Again and Hard
  counts next to Remembered, and never reclassifies Hard as a lapse.

## 3. Comparison with Anki's built-in simulator

Both simulators ran from the same cards for 365 days, with default parameters, 90% desired retention, the
presets' review limits and daily study. Counts are review events only, without learning or relearning steps.

- For existing cards over 30–90 days, the two agree within about 15%.
- With new cards they differ by up to about 35% over a year, and the direction varies between decks.
- Anki's simulator request has no button-mix setting, so the difference can't be attributed more precisely.
  Treat the forecast as accurate to roughly ±35% for a year with new cards.

## 4. Cases checked with synthetic presets

These are covered by `src/lib/fixtures/anki-fsrs-reference.json`, which uses no personal data.

| Case | Anki's behaviour | Handling here |
|---|---|---|
| A preset with 0 new or 0 review cards per day | Protobuf leaves out fields holding 0 | A missing limit is 0; only a blob with no readable fields uses Anki's defaults |
| Parameters optimised under FSRS-4.5 (17 values, field 3) | Anki re-expresses the difficulty weights for FSRS-5 | `toFsrs6Params` |
| Field 7 | Not in Anki 26.9.3's descriptor; FSRS-6 parameters are field 6 | Fields 6, 5, 3 |
| A subdeck on its own preset | The card gets that preset's parameters | Per-card presets in the replay, current recall and the simulator |
| A history that doesn't start with learning | Anki seeds it from the SM-2 interval | Left out of calibration and the measured lapse rate, and counted in the app; not inferred |

## 5. Limitations

- With few lapses, optimised parameters are uncertain even when Anki's health check passes.
- The comparison used Anki 26.9.3 on desktop. Other clients may use other FSRS versions.
- The simulator comparison counts review events only, and Anki's internal button mix is unknown.

## 6. Reproduce

```sh
# 1. A Python 3.13 matching Anki.app's bundled backend (see scripts/fsrs-validation/README.md)
<python3.13> -I scripts/fsrs-validation/anki_export.py      # Anki's engine on a throwaway copy
node --import ./scripts/fsrs-validation/ts-resolve.ts scripts/fsrs-validation/compare.ts
<python3.13> -I scripts/fsrs-validation/anki_reference.py   # regenerates the synthetic test fixture
npm test                                                    # includes the Anki reference tests
```
