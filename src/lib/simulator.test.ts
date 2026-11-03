import { describe, expect, it } from 'vitest'
import type { FsrsData } from '../data/types'
import { DEFAULT_PARAMS } from './fsrs'
import {
  buildSimDecks,
  fuzzInterval,
  isStudyDay,
  presetRetentionLabel,
  retentionScenarioValues,
  simulate,
  splitNew,
  summarise,
  type SimDeck,
  type SimSettings,
} from './simulator'

/** A deck of `n` review cards, due spread over the next `spread` days. */
function deck(id: string, n: number, opts: Partial<SimDeck> = {}, spread = 20): SimDeck {
  return {
    deckId: id,
    params: [...DEFAULT_PARAMS],
    desiredRetention: 0.9,
    maxInterval: 36500,
    reviewLimit: 9999,
    newPool: 5000,
    learnSteps: 2,
    relearnSteps: 1,
    firstRating: [0.2, 0.2, 0.4, 0.2],
    passRating: [0.1, 0.7, 0.2],
    failRatio: 0.1,
    learningReviewsPerNewCard: 2,
    cards: Array.from({ length: n }, (_, i) => ({ s: 10 + (i % 30), d: 5, lastDay: -10, dueDay: i % spread, interval: 10 })),
    ...opts,
  }
}

const base: SimSettings = {
  deckIds: ['a', 'b'],
  newPerDay: 20,
  desiredRetention: 0.9,
  studyDaysPerWeek: 7,
  runs: 4,
  seed: 42,
  recall: 'fsrs',
  startWeekday: 0,
  days: 120,
}
const decks = [deck('a', 200), deck('b', 100)]
const total = (s: Partial<SimSettings>, horizon = 120, ds = decks) => summarise(simulate(ds, { ...base, ...s }), horizon, 10).total.mean

describe('simulate', () => {
  it('is reproducible for the same seed', () => {
    expect(simulate(decks, base).days.map((d) => d.total)).toEqual(simulate(decks, base).days.map((d) => d.total))
  })

  it('treats a shorter horizon as a prefix of a longer run', () => {
    const long = simulate(decks, base).days.slice(0, 30).map((d) => d.total)
    const short = simulate(decks, { ...base, days: 30 }).days.map((d) => d.total)
    expect(short).toEqual(long)
  })

  it('counts each existing card’s scheduled review exactly once as "known"', () => {
    // No lapses (calibrated model with a lapse ratio of 0): exactly one known review per card due in the horizon
    const noLapse = [deck('a', 200, { failRatio: 0 }), deck('b', 100, { failRatio: 0 })]
    expect(summarise(simulate(noLapse, { ...base, recall: 'calibrated' }), 120, 10).known).toBe(300)
    // With lapses, relearning answers on that first review are counted as known too
    expect(summarise(simulate(decks, base), 120, 10).known).toBeGreaterThan(300)
  })

  it('has no new-card reviews with 0 new cards, and more reviews with more new cards', () => {
    expect(summarise(simulate(decks, { ...base, newPerDay: 0 }), 120, 10).fresh).toBe(0)
    const ts = [0, 10, 20, 40].map((n) => total({ newPerDay: n }))
    expect(ts).toEqual([...ts].sort((a, b) => a - b))
  })

  it('needs more reviews for a higher desired retention', () => {
    const ts = [0.8, 0.85, 0.9, 0.95].map((r) => total({ desiredRetention: r, newPerDay: 10 }))
    expect(ts).toEqual([...ts].sort((a, b) => a - b))
  })

  it('reviews nothing on rest days, and catches up afterwards', () => {
    const res = simulate(decks, { ...base, studyDaysPerWeek: 5 })
    for (const d of res.days) if (!d.study) expect(d.total).toBe(0)
    expect(res.days.filter((d) => d.study)).toHaveLength(17 * 5 + 1) // 17 full weeks from a Monday, plus one Monday
  })

  it('never exceeds the review limit and stops introducing new cards when the pool is empty', () => {
    const limited = [deck('a', 500, { reviewLimit: 50, newPool: 30 }, 1)]
    const res = simulate(limited, { ...base, deckIds: ['a'], newPerDay: 10 })
    const reviewsOfExisting = res.days.map((d) => d.known + d.followUp)
    // learning answers of new cards are not limited; existing-card reviews (incl. relearning) are
    for (const r of reviewsOfExisting) expect(r).toBeLessThanOrEqual(50 * 2)
    expect(res.days.reduce((n, d) => n + d.newIntroduced, 0)).toBe(30)
    expect(res.backlog[0]).toBeCloseTo(450, 6) // 500 due today, 50 reviewed
  })

  it('makes fewer reviews with the "calibrated" model when you lapse less than FSRS predicts', () => {
    expect(total({ recall: 'calibrated' })).toBeLessThan(total({ recall: 'fsrs' }))
  })

  it('uses each deck’s own preset retention by default, or one override for all', () => {
    const mixed = [deck('a', 200, { desiredRetention: 0.8 }), deck('b', 200, { desiredRetention: 0.95 })]
    const byDeck = (s: Partial<SimSettings>) =>
      summarise(simulate(mixed, { ...base, newPerDay: 0, ...s, desiredRetention: s.desiredRetention }), 120, 10).perDeck.map(
        (d) => d.existing,
      )
    const [a, b] = byDeck({})
    expect(b).toBeGreaterThan(a) // 95% needs more reviews than 80% for the same cards
    // An override of 90% behaves exactly like both presets being 90% (same seed, deterministic)
    const both90 = [deck('a', 200, { desiredRetention: 0.9 }), deck('b', 200, { desiredRetention: 0.9 })]
    const viaPresets = summarise(simulate(both90, { ...base, newPerDay: 0 }), 120, 10).perDeck.map((d) => d.existing)
    expect(byDeck({ desiredRetention: 0.9 })).toEqual(viaPresets)
  })

  it('only simulates the selected decks', () => {
    const s = summarise(simulate(decks, { ...base, deckIds: ['b'] }), 120, 10)
    expect(s.perDeck.map((d) => d.deckId)).toEqual(['b'])
  })

  it('gives a percentile range around the mean', () => {
    const s = summarise(simulate(decks, { ...base, runs: 12 }), 120, 10)
    expect(s.total.p10).toBeLessThanOrEqual(s.total.mean)
    expect(s.total.p90).toBeGreaterThanOrEqual(s.total.mean)
  })
})

describe('helpers', () => {
  it('fuzzes like Anki: nothing below 2.5 days, a bounded spread above', () => {
    expect(fuzzInterval(2, 36500, 0.99)).toBe(2)
    for (const r of [0, 0.5, 0.999]) {
      const v = fuzzInterval(100, 36500, r)
      // delta = 1 + 0.15·4.5 + 0.1·13 + 0.05·80 = 6.975 days
      expect(v).toBeGreaterThanOrEqual(93)
      expect(v).toBeLessThanOrEqual(107)
    }
    expect(fuzzInterval(100, 50, 0.5)).toBe(50) // maximum interval
  })

  it('takes rest days on Sunday, then Saturday, then mid-week', () => {
    const study = (n: number) => [0, 1, 2, 3, 4, 5, 6].filter((w) => isStudyDay(w, n))
    expect(study(7)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(study(5)).toEqual([0, 1, 2, 3, 4])
    expect(study(4)).toEqual([0, 1, 3, 4])
  })

  it('splits new cards evenly and moves the rest to decks that still have cards', () => {
    expect(splitNew(30, [100, 100])).toEqual([15, 15])
    expect(splitNew(30, [5, 100])).toEqual([5, 25])
    expect(splitNew(30, [0, 0])).toEqual([0, 0])
    expect(splitNew(7, [100, 100])).toEqual([4, 3])
  })
})

describe('buildSimDecks', () => {
  const fsrs = {
    presets: [
      {
        deckId: 'a',
        presetName: 'A',
        desiredRetention: 0.9,
        newPerDay: 10,
        reviewsPerDay: 200,
        maxInterval: 365,
        learnSteps: [1, 10],
        relearnSteps: [10],
        params: [...DEFAULT_PARAMS],
        paramsSource: 'default',
      },
    ],
    cards: [
      { deckId: 'a', stability: 5, difficulty: 4, lastReview: '2026-03-01', due: '2026-03-08', interval: 7, state: 'review' },
      { deckId: 'a', stability: 5, difficulty: 4, lastReview: '2026-03-01', due: '2026-03-20', interval: 19, state: 'review' },
    ],
    newCards: { a: 50 },
    suspended: {},
    calibration: [{ month: '2026-03', deckId: 'a', reviews: 100, passed: 99, predicted: 90, matureReviews: 0, maturePassed: 0, maturePredicted: 0 }],
    calibrationBins: [],
    behaviour: [{ deckId: 'a', firstRating: [1, 1, 1, 1], passRating: [1, 2, 1], reviewAgain: 1, secondsPerReview: 10, learningReviewsPerNewCard: 1.8, newCardsIntroduced: 4 }],
  } as unknown as FsrsData

  it('converts dates to days relative to today and treats overdue cards as due today', () => {
    const [d] = buildSimDecks(fsrs, '2026-03-10')
    expect(d.cards.map((c) => [c.lastDay, c.dueDay])).toEqual([[-9, 0], [-9, 10]])
  })

  it('turns measured counts into probabilities and computes the lapse ratio', () => {
    const [d] = buildSimDecks(fsrs, '2026-03-10')
    expect(d.firstRating).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(d.passRating).toEqual([0.25, 0.5, 0.25])
    expect(d.failRatio).toBeCloseTo(1.5 / 10) // (1 observed + 0.5) / 10 expected
    expect(d).toMatchObject({ reviewLimit: 200, maxInterval: 365, newPool: 50, learnSteps: 2, relearnSteps: 1, learningReviewsPerNewCard: 1.8 })
  })
})

describe('retention scenarios', () => {
  const ds = [deck('a', 1, { desiredRetention: 0.87 }), deck('b', 1, { desiredRetention: 0.92 })]
  it('always includes the retention actually in use, so it gets a bar', () => {
    expect(retentionScenarioValues(ds, { deckIds: ['a'] })).toEqual([0.8, 0.85, 0.87, 0.9, 0.95])
    expect(retentionScenarioValues(ds, { deckIds: ['a', 'b'] })).toEqual([0.8, 0.85, 0.87, 0.9, 0.92, 0.95])
    expect(retentionScenarioValues(ds, { deckIds: ['a', 'b'], desiredRetention: 0.93 })).toEqual([0.8, 0.85, 0.9, 0.93, 0.95])
    expect(retentionScenarioValues(ds, { deckIds: [] })).toEqual([0.8, 0.85, 0.9, 0.95])
  })
  it('labels preset values without Infinity when nothing is selected', () => {
    expect(presetRetentionLabel([0.9])).toBe('90%')
    expect(presetRetentionLabel([0.92, 0.85, 0.9])).toBe('85–92%')
    expect(presetRetentionLabel([])).toBe('')
  })
})
