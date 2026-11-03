import { describe, expect, it } from 'vitest'
import type { AnkiData, DeckBehaviour } from '../data/types'
import { measuredDefaults } from './measured'

const today = new Date(2026, 2, 28, 12)
const day = (date: string, reviews: number, studySeconds: number) => ({
  date,
  deckId: 'a',
  reviews,
  again: 0,
  studySeconds,
  reviewCardReviews: 0,
  reviewCardPassed: 0,
  matureReviews: 0,
  maturePassed: 0,
})
const behaviour = (secondsPerReview: number, answers: number) => ({ deckId: 'x', secondsPerReview, answers }) as DeckBehaviour

// 8 study days in the last 28, 100 reviews each; one day includes a 10-minute pause (uncapped in daily totals)
const daily = ['2026-03-02', '2026-03-05', '2026-03-09', '2026-03-12', '2026-03-16', '2026-03-19', '2026-03-23', '2026-03-26'].map((d, i) =>
  day(d, 100, i === 0 ? 1000 + 600 : 1000),
)

describe('measuredDefaults', () => {
  it('uses the server’s capped seconds per review, weighted by answers across decks', () => {
    const data = { daily, fsrs: { behaviour: [behaviour(10, 300), behaviour(20, 100)] } } as unknown as AnkiData
    const m = measuredDefaults(data, today)
    expect(m.secondsPerReview).toBeCloseTo(12.5) // (10·300 + 20·100) / 400, unaffected by the long pause
    expect(m.studyDaysPerWeek).toBe(2)
    expect(m.minutesPerStudyDay).toBeCloseTo((100 * 12.5) / 60) // reviews per study day × seconds per review
  })

  it('falls back to daily totals without FSRS data', () => {
    const m = measuredDefaults({ daily } as unknown as AnkiData, today)
    expect(m.secondsPerReview).toBeCloseTo(8600 / 800)
  })

  it('has sensible defaults with no recent reviews', () => {
    expect(measuredDefaults({ daily: [] } as unknown as AnkiData, today)).toEqual({ secondsPerReview: 12, studyDaysPerWeek: 1, minutesPerStudyDay: 20 })
  })
})
