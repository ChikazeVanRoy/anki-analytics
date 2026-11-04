import { describe, expect, it } from 'vitest'
import type { CalibrationPoint, FsrsData } from '../data/types'
import { DEFAULT_PARAMS, retrievability } from './fsrs'
import { calibrationCurve, cardsNow, fsrsVerdict, histogram, lapseEvidence, memorySummary, paramsSourceOf, retentionComparison, STABILITY_BINS } from './fsrsStats'
import type { HorizonSummary } from './simulator'
import { buildInsights, maxSustainableNewPerDay } from './insights'

const preset = (deckId: string, dr: number) => ({
  deckId,
  presetName: deckId,
  desiredRetention: dr,
  newPerDay: 10,
  reviewsPerDay: 200,
  maxInterval: 36500,
  learnSteps: [1, 10],
  relearnSteps: [10],
  params: [...DEFAULT_PARAMS],
  paramsSource: 'default' as const,
})
const card = (deckId: string, stability: number, lastReview: string, due: string) => ({
  deckId,
  stability,
  difficulty: 5.5,
  lastReview,
  due,
  interval: 10,
  state: 'review' as const,
})
const fsrs = {
  presets: [preset('a', 0.9), preset('b', 0.8)],
  cards: [
    card('a', 10, '2026-03-05', '2026-03-15'), // 10 days elapsed on 15 Mar: R = 0.9
    card('a', 2, '2026-03-05', '2026-03-07'), // overdue, low R
    card('b', 100, '2026-03-14', '2026-06-01'),
  ],
} as unknown as FsrsData

describe('cardsNow', () => {
  const now = cardsNow(fsrs, '2026-03-15')
  it('uses the card’s own preset when its subdeck has one', () => {
    const own = { ...preset('a', 0.97), presetId: 2, params: DEFAULT_PARAMS.map((w, i) => (i === 20 ? 0.5 : w)) }
    const mixed = {
      ...fsrs,
      cardPresets: [own],
      cards: [{ ...fsrs.cards[0], preset: 0 }, fsrs.cards[0]],
    } as unknown as FsrsData
    const [sub, main] = cardsNow(mixed, '2026-03-15')
    expect(sub.desired).toBe(0.97)
    expect(sub.r).toBeCloseTo(retrievability(10, 10, own.params), 10)
    expect(main.desired).toBe(0.9)
    expect(main.r).toBeCloseTo(0.9, 10)
  })
  it('computes retrievability from whole days since the last review', () => {
    expect(now[0].elapsed).toBe(10)
    expect(now[0].r).toBeCloseTo(0.9, 10)
    expect(now[1].r).toBeCloseTo(retrievability(10, 2), 10)
  })
  it('flags overdue cards and uses each deck’s own desired retention', () => {
    expect(now.map((c) => c.overdue)).toEqual([false, true, false])
    expect(now.map((c) => c.desired)).toEqual([0.9, 0.9, 0.8])
  })
  it('summarises risk relative to the target', () => {
    const a = memorySummary(now, 'a')
    expect(a.cards).toBe(2)
    expect(a.belowTarget).toBe(1) // R exactly 0.9 is not below target
    expect(a.atRisk).toBe(1)
    expect(a.overdue).toBe(1)
    expect(a.avgDifficulty).toBeCloseTo(0.5, 10)
    expect(memorySummary(now, 'all').cards).toBe(3)
  })
  it('bins cards per deck', () => {
    const rows = histogram(now, ['a', 'b'], STABILITY_BINS, (c) => c.stability)
    expect(rows.find((r) => r.label === '1–7 days')).toMatchObject({ a: 1, b: 0 })
    expect(rows.find((r) => r.label === '3–12 months')).toMatchObject({ a: 0, b: 1 })
    expect(rows.reduce((n, r) => n + (r.a as number) + (r.b as number), 0)).toBe(3)
  })
})

describe('retention comparison', () => {
  const pts: CalibrationPoint[] = [
    { month: '2026-02', deckId: 'a', reviews: 10, passed: 9, predicted: 8.5, matureReviews: 4, maturePassed: 4, maturePredicted: 3.6 },
    { month: '2026-03', deckId: 'b', reviews: 10, passed: 10, predicted: 9, matureReviews: 0, maturePassed: 0, maturePredicted: 0 },
  ]
  it('splits young and mature reviews', () => {
    const a = retentionComparison(pts, 'a')
    expect(a.actual).toBeCloseTo(0.9)
    expect(a.mature).toEqual({ reviews: 4, actual: 1, predicted: 0.9 })
    expect(a.young.reviews).toBe(6)
    expect(a.young.actual).toBeCloseTo(5 / 6)
    expect(retentionComparison(pts, 'all').reviews).toBe(20)
  })
  it('counts lapse evidence for the selected decks only', () => {
    expect(lapseEvidence(pts, ['b'])).toEqual({ reviews: 10, lapses: 0 })
    expect(lapseEvidence(pts, ['a', 'b'])).toEqual({ reviews: 20, lapses: 1 })
  })
  it('handles decks without reviews', () => {
    expect(retentionComparison(pts, 'zzz')).toMatchObject({ reviews: 0, actual: 0, predicted: 0 })
  })
  it('merges calibration bins across decks', () => {
    const curve = calibrationCurve([
      { deckId: 'a', from: 0.9, to: 0.95, reviews: 10, passed: 9, predicted: 9.2 },
      { deckId: 'b', from: 0.9, to: 0.95, reviews: 10, passed: 10, predicted: 9.2 },
    ])
    expect(curve).toHaveLength(1)
    expect(curve[0]).toMatchObject({ label: '90–95%', reviews: 20, actual: 0.95 })
    expect(curve[0].predicted).toBeCloseTo(0.92, 10)
  })
})

describe('insights', () => {
  const summary = (maxWindow: number, extra: Partial<HorizonSummary> = {}) =>
    ({ maxWindowPerStudyDay: maxWindow, backlogEnd: 0, perDeck: [], horizon: 90, ...extra }) as unknown as HorizonSummary
  // 60 s per review makes minutes equal reviews, which keeps the arithmetic readable
  const sweep = [0, 10, 20, 30].map((value) => ({ value, year: summary(10 + value * 2) })) // 10, 30, 50, 70 min

  it('interpolates the largest new/day within budget, rounded down to 5', () => {
    expect(maxSustainableNewPerDay(sweep, 40, 60)).toEqual({ value: 15, capped: false }) // crosses 40 at 15
    expect(maxSustainableNewPerDay(sweep, 100, 60)).toEqual({ value: 30, capped: true })
    expect(maxSustainableNewPerDay(sweep, 5, 60)).toBeNull()
  })

  it('never answers below a simulated scenario that fits the budget', () => {
    // Your own 12/day (added to the sweep) fits; 20 doesn't. Rounding 12.x down to 10 would contradict that.
    const withCurrent = [...sweep.slice(0, 2), { value: 12, year: summary(33) }, ...sweep.slice(2)] // 33 min at 12/day
    expect(maxSustainableNewPerDay(withCurrent, 34, 60)).toEqual({ value: 12, capped: false })
  })

  it('treats a review-limit backlog as unsustainable', () => {
    const withBacklog = [...sweep.slice(0, 2), { value: 20, year: summary(1, { backlogEnd: 50 }) }]
    expect(maxSustainableNewPerDay(withBacklog, 1000, 60)).toEqual({ value: 10, capped: false })
  })

  it('answers each question from the simulated numbers', () => {
    const horizon = summary(0, {
      perDeck: [
        { deckId: 'a', existing: 100, fresh: 300 },
        { deckId: 'b', existing: 50, fresh: 50 },
      ],
    })
    const out = buildInsights({
      newPerDay: 20,
      secondsPerReview: 60,
      budgetMinutes: 40,
      recentMinutesPerStudyDay: 25,
      year: sweep[2].year,
      horizon,
      sweep,
      deckNames: { a: 'Spanish', b: 'German' },
    })
    expect(out).toHaveLength(4)
    expect(out[0].tone).toBe('warning') // 50 min heaviest month > 40 budget
    expect(out[1].answer).toContain('About 15 per day')
    expect(out[2].answer).toContain('Spanish: 400 of 500')
    expect(out[3].answer).toContain('30 new/day adds about 20 reviews')
    expect(out[3].answer).toContain('10 new/day removes about 20 reviews')
  })
})

describe('fsrsVerdict', () => {
  const point = (reviews: number, passed: number, predicted: number) =>
    ({ month: '2026-10', deckId: 'a', reviews, passed, predicted, matureReviews: 0, maturePassed: 0, maturePredicted: 0 })
  const fsrs = (p: ReturnType<typeof point>, paramsSource: 'default' | 'optimised' = 'default') =>
    ({ calibration: [p], presets: [{ paramsSource }] }) as unknown as FsrsData

  it('says FSRS underestimates you when you remember clearly more than it expected', () => {
    expect(fsrsVerdict(fsrs(point(500, 490, 440)))).toMatchObject({ kind: 'under', lapses: 10, params: 'default' })
  })

  it('says FSRS overestimates you when you remember clearly less', () => {
    expect(fsrsVerdict(fsrs(point(500, 400, 450), 'optimised'))).toMatchObject({ kind: 'over', params: 'optimised' })
  })

  it('calls a small gap a fit', () => {
    expect(fsrsVerdict(fsrs(point(500, 450, 445))).kind).toBe('fits')
  })

  it('won’t judge from too few reviews', () => {
    expect(fsrsVerdict(fsrs(point(99, 99, 80))).kind).toBe('thin')
  })

  it('reads the presets cards use, not only the deck groups’', () => {
    const f = { calibration: [], presets: [{ paramsSource: 'default' }], cardPresets: [{ paramsSource: 'optimised' }, { paramsSource: 'default' }] } as unknown as FsrsData
    expect(paramsSourceOf(f)).toBe('mixed')
  })
})
