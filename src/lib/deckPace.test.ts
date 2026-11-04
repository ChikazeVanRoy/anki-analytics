import { describe, expect, it } from 'vitest'
import type { AnkiData, DailyDeckStat } from '../data/types'
import { realShapedData } from '../test/fsrsFixture'
import { currentPace, deckFinish, finishAt } from './deckPace'

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

describe('currentPace', () => {
  const today = new Date(2026, 2, 31)
  const data = (introduced: number) =>
    ({
      decks: [{ id: 'a' }],
      daily: [{ deckId: 'a', date: '2026-03-02', reviews: 5 }],
      fsrs: { enabled: true, windowDays: 180, newCards: { a: 100 }, behaviour: [{ deckId: 'a', newCardsIntroduced: introduced }] },
    }) as unknown as AnkiData

  it('turns the decks’ pace into cards per study day', () => {
    const pace = currentPace(data(60), today, 5)!
    expect(pace.perDay).toBeCloseTo(2)
    expect(pace.perStudyDay).toBeCloseTo(2.8)
    expect(pace.byDeck.a).toBeCloseTo(2.8)
  })

  it('has no pace without enough history', () => expect(currentPace(data(1), today, 5)).toBeNull())
})

describe('finishAt', () => {
  const today = new Date(2026, 2, 1)
  it('counts rest days', () => {
    expect(finishAt(70, 10, 7, today)).toBe('2026-03-08')
    expect(finishAt(50, 10, 5, today)).toBe('2026-03-08')
  })
  it('has no date at no pace', () => expect(finishAt(70, 0, 7, today)).toBeNull())
})
