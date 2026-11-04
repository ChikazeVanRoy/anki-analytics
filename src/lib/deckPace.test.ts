import { describe, expect, it } from 'vitest'
import type { AnkiData, DailyDeckStat } from '../data/types'
import { realShapedData } from '../test/fsrsFixture'
import { deckFinish } from './deckPace'

const TODAY = new Date(2026, 10, 4)

function data(firstReview: string, introduced: number, remaining: number): AnkiData {
  const base = realShapedData()
  const fsrs = base.fsrs!
  return {
    ...base,
    daily: [{ date: firstReview, deckId: 'language', reviews: 5 } as DailyDeckStat],
    fsrs: {
      ...fsrs,
      newCards: { language: remaining },
      behaviour: fsrs.behaviour.map((b) => ({ ...b, newCardsIntroduced: introduced })),
    },
  }
}

describe('deckFinish', () => {
  it('projects from the measured pace', () => {
    // 90 days of history, 180 cards: 2 a day, so 100 cards take 50 days
    expect(deckFinish(data('2026-08-07', 180, 100), 'language', TODAY)).toEqual({
      kind: 'date',
      date: '2026-12-24',
      perDay: 2,
      remaining: 100,
      introduced: 180,
      days: 90,
    })
  })

  it('measures over the window, not the whole of an older deck’s life', () => {
    const d = data('2024-01-01', 180, 100)
    d.daily.push({ ...d.daily[0], date: '2026-05-09' })
    expect(deckFinish(d, 'language', TODAY)).toMatchObject({ kind: 'date', perDay: 1, days: 180 })
  })

  it('starts the pace when a deck was picked up again after a long break', () => {
    const d = data('2020-03-01', 180, 100)
    d.daily.push({ ...d.daily[0], date: '2026-08-07' })
    expect(deckFinish(d, 'language', TODAY)).toMatchObject({ kind: 'date', perDay: 2, days: 90 })
  })

  it('says a deck is finished when no new cards are left', () => {
    expect(deckFinish(data('2026-08-07', 180, 0), 'language', TODAY)).toEqual({ kind: 'done' })
  })

  it('won’t project from too few cards or days', () => {
    expect(deckFinish(data('2026-08-07', 19, 100), 'language', TODAY)).toEqual({ kind: 'thin' })
    expect(deckFinish(data('2026-10-25', 180, 100), 'language', TODAY)).toEqual({ kind: 'thin' })
  })

  it('says nothing about a deck it has no new-card count for', () => {
    expect(deckFinish(data('2026-08-07', 180, 100), 'science', TODAY)).toBeNull()
  })

  it('shows nothing without real FSRS data', () => {
    expect(deckFinish({ ...realShapedData(), fsrs: undefined }, 'language', TODAY)).toBeNull()
  })
})
