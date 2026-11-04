import { describe, expect, it } from 'vitest'
import type { AnkiData } from '../data/types'
import { recapSince, snapshotOf, type Snapshot } from './recap'
import { toDateKey } from './stats'

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ reviews: 100, seconds: 600, started: 50, proven: 2, streak: 3, badges: [], day: '2026-03-02', before: 90, ...over })
const log = (...days: [string, number][]) => new Map(days.map(([d, reviews]) => [d, { reviews, again: 0, seconds: 60 }]))
const history = log(['2026-03-01', 90], ['2026-03-02', 10], ['2026-03-03', 84])

describe('recapSince', () => {
  it('has nothing to celebrate on a first visit, or with no new reviews', () => {
    expect(recapSince(null, snap(), history)).toBeNull()
    expect(recapSince(snap(), snap(), history)).toBeNull()
  })

  it('adds up what changed, including new badges', () => {
    const now = snap({ reviews: 184, seconds: 1200, started: 62, proven: 5, streak: 4, badges: ['week', 'comeback'] })
    expect(recapSince(snap({ badges: ['comeback'] }), now, history)).toEqual({ reviews: 84, minutes: 10, newCards: 12, bloomed: 3, streak: 4, badges: ['week'] })
  })

  it('counts more reviews on the visit’s last day', () => {
    expect(recapSince(snap(), snap({ reviews: 120 }), log(['2026-03-01', 90], ['2026-03-02', 30]))?.reviews).toBe(20)
  })

  it('stays quiet when the past changed, as when a deck is added', () => {
    expect(recapSince(snap(), snap({ reviews: 5000 }), log(['2026-02-01', 4900], ['2026-03-01', 90], ['2026-03-02', 10]))).toBeNull()
  })

  it('never shows a loss', () => {
    expect(recapSince(snap(), snap({ reviews: 101, started: 40, proven: 0 }), history)).toMatchObject({ newCards: 0, bloomed: 0 })
  })
})

describe('snapshotOf', () => {
  it('reads the totals from the data', () => {
    const today = new Date()
    const byDate = new Map([[toDateKey(today), { reviews: 7, again: 0, seconds: 70 }]])
    const data = { decks: [{ youngCards: 3, matureCards: 2 }], fsrs: { proven: { a: 1 } } } as unknown as AnkiData
    expect(snapshotOf(data, byDate, today)).toMatchObject({ reviews: 7, seconds: 70, started: 5, proven: 1, streak: 1 })
  })
})
