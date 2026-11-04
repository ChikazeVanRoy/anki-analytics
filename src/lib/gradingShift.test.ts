import { describe, expect, it } from 'vitest'
import type { AnkiData, CalibrationDay, FsrsData } from '../data/types'
import { buildSimDecks } from './simulator'
import { fsrsVerdict } from './fsrsStats'
import { gradingShift, lapseBasis, shiftWithin, SHIFT_MIN_SIDE, SHIFT_SETTLED_REVIEWS } from './gradingShift'

const day = (n: number, reviews: number, lapses: number, predictedRate = 0.9, deckId = 'a'): CalibrationDay => ({
  date: `2026-03-${String(n).padStart(2, '0')}`,
  deckId,
  reviews,
  passed: reviews - lapses,
  predicted: reviews * predictedRate,
})
const run = (from: number, to: number, reviews: number, lapses: number, rate?: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => day(from + i, reviews, lapses, rate))

describe('gradingShift', () => {
  it('finds the day lapses jump, and what each side looks like', () => {
    const shift = gradingShift([...run(1, 10, 40, 0), ...run(11, 12, 60, 8)])
    expect(shift?.date).toBe('2026-03-11')
    expect(shift?.before).toMatchObject({ reviews: 400, passed: 400 })
    expect(shift?.after).toMatchObject({ reviews: 120, passed: 104 })
    expect(shift?.settled).toBe(false)
  })

  it('also finds a fall in lapses', () => {
    expect(gradingShift([...run(1, 5, 40, 8), ...run(6, 12, 40, 0)])?.date).toBe('2026-03-06')
  })

  it('stays quiet for steady answers, however many there are', () => {
    expect(gradingShift(run(1, 20, 50, 5))).toBeNull()
  })

  it('stays quiet when the rise is what FSRS expected', () => {
    // Twice the lapses, but FSRS expected twice as many at those longer intervals
    expect(gradingShift([...run(1, 10, 50, 2, 0.95), ...run(11, 20, 50, 5, 0.88)])).toBeNull()
  })

  it('needs enough reviews on both sides', () => {
    expect(gradingShift([day(1, SHIFT_MIN_SIDE - 1, 0), ...run(2, 10, 40, 10)])).toBeNull()
  })

  it('needs more than a small drift, even with plenty of reviews', () => {
    expect(gradingShift([...run(1, 10, 500, 50), ...run(11, 20, 500, 70)])).toBeNull()
  })

  it('combines decks into one day', () => {
    const shift = gradingShift([...run(1, 10, 40, 0), day(11, 30, 5, 0.9, 'a'), day(11, 30, 5, 0.9, 'b')])
    expect(shift?.after.reviews).toBe(60)
  })

  it('returns the latest change when there were several', () => {
    const shift = gradingShift([...run(1, 6, 40, 0), ...run(7, 12, 40, 10), ...run(13, 18, 40, 0)])
    expect(shift?.date).toBe('2026-03-13')
    expect(shift?.before.reviews).toBe(240)
  })

  it('calls a change settled once enough reviews follow it', () => {
    const shift = gradingShift([...run(1, 10, 40, 0), ...run(11, 20, SHIFT_SETTLED_REVIEWS / 10, 4)])
    expect(shift?.settled).toBe(true)
  })

  it('has nothing to say without data', () => expect(gradingShift([])).toBeNull())
})

const fsrsWith = (calibrationDaily: CalibrationDay[] | undefined) => {
  const all = calibrationDaily ?? []
  const sum = (f: (d: CalibrationDay) => number) => all.reduce((n, d) => n + f(d), 0)
  return {
    presets: [{ deckId: 'a', params: [], paramsSource: 'default', desiredRetention: 0.9, maxInterval: 100, reviewsPerDay: 100, learnSteps: [], relearnSteps: [] }],
    cardPresets: [],
    cards: [],
    behaviour: [],
    newCards: {},
    calibrationDaily,
    calibration: [{ month: '2026-03', deckId: 'a', reviews: sum((d) => d.reviews), passed: sum((d) => d.passed), predicted: sum((d) => d.predicted), matureReviews: 0, maturePassed: 0, maturePredicted: 0 }],
  } as unknown as FsrsData
}

describe('shiftWithin', () => {
  const data = (calibrationDaily: CalibrationDay[]) => ({ fsrs: { calibrationDaily } }) as unknown as AnkiData

  it('reports a change inside the period, with the rate since it', () => {
    const d = data([...run(1, 10, 40, 0), ...run(11, 12, 60, 6)])
    expect(shiftWithin(d, '2026-03-02')?.rate).toBeCloseTo(108 / 120)
    expect(shiftWithin(d, '2026-03-02')?.date).toBe('2026-03-11')
  })

  it('stays out of a period that starts after the change, or with no FSRS data', () => {
    expect(shiftWithin(data([...run(1, 10, 40, 0), ...run(11, 12, 60, 6)]), '2026-03-11')).toBeNull()
    expect(shiftWithin({} as AnkiData, '2026-03-02')).toBeNull()
  })
})

describe('grading changes in the verdict and lapse rate', () => {
  const changed = [...run(1, 10, 40, 0), ...run(11, 12, 60, 8)]

  it('holds the verdict instead of blaming FSRS for two habits pooled together', () => {
    const v = fsrsVerdict(fsrsWith(changed))
    expect(v.kind).toBe('shifted')
    expect(v.reviews).toBe(120)
    expect(v.actual).toBeCloseTo(104 / 120)
    expect(v.lapses).toBe(16)
  })

  it('judges only the reviews since the change once it has settled', () => {
    const v = fsrsVerdict(fsrsWith([...run(1, 10, 40, 0), ...run(11, 20, 50, 5)]))
    expect(v.kind).toBe('fits')
    expect(v.shift?.settled).toBe(true)
    expect(v.reviews).toBe(500)
  })

  it('still gives the ordinary verdict with no change, or with an older API', () => {
    expect(fsrsVerdict(fsrsWith(run(1, 20, 50, 5))).kind).toBe('fits')
    const older = fsrsWith(undefined)
    older.calibration[0] = { ...older.calibration[0], reviews: 400, passed: 400, predicted: 360 }
    expect(fsrsVerdict(older)).toMatchObject({ kind: 'under', shift: null })
  })

  it('measures the Planner’s lapse rate from reviews since the change', () => {
    expect(lapseBasis(fsrsWith(changed)).reduce((n, d) => n + d.reviews, 0)).toBe(120)
    const [deck] = buildSimDecks(fsrsWith(changed), '2026-03-13')
    expect(deck.failRatio).toBeCloseTo(16.5 / 12)
  })
})
