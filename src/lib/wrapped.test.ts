import { describe, expect, it } from 'vitest'
import type { AnkiData } from '../data/types'
import { defaultMonth, monthWrapped, wrappedMonths } from './wrapped'

const LATER = '2026-06-15'
const row = (date: string, deckId: string, reviews: number) => ({ date, deckId, reviews, studySeconds: reviews * 60 })
const data = (...daily: ReturnType<typeof row>[]) => ({ daily }) as unknown as AnkiData

describe('wrappedMonths', () => {
  it('lists months with reviews, newest first', () => {
    expect(wrappedMonths(data(row('2026-02-01', 'a', 1), row('2026-03-01', 'a', 1), row('2026-04-01', 'a', 0)))).toEqual(['2026-03', '2026-02'])
  })
})

describe('defaultMonth', () => {
  it('opens on the latest finished month', () => {
    expect(defaultMonth(['2026-03', '2026-02'], '2026-03-04')).toBe('2026-02')
    expect(defaultMonth(['2026-03', '2026-02'], '2026-04-01')).toBe('2026-03')
  })
  it('falls back to this month when it’s all there is', () => expect(defaultMonth(['2026-03'], '2026-03-04')).toBe('2026-03'))
})

describe('monthWrapped', () => {
  const d = data(
    row('2026-02-10', 'a', 50),
    row('2026-03-01', 'a', 10),
    row('2026-03-02', 'a', 30),
    row('2026-03-02', 'b', 5),
    row('2026-03-03', 'b', 5),
    row('2026-03-20', 'b', 50),
  )

  it('sums the month, and finds its best run and busiest day', () => {
    expect(monthWrapped(d, '2026-03', LATER)).toEqual({
      month: '2026-03',
      reviews: 100,
      minutes: 100,
      days: 4,
      bestRun: 3,
      busiest: { date: '2026-03-20', reviews: 50 },
      topDeck: { deckId: 'b', reviews: 60 },
      change: 1,
    })
  })

  it('leaves out comparisons it can’t make', () => {
    expect(monthWrapped(d, '2026-02', LATER)).toMatchObject({ topDeck: null, change: null })
  })

  it('doesn’t compare a month that isn’t over with a whole one', () => {
    expect(monthWrapped(d, '2026-03', '2026-03-25')?.change).toBeNull()
  })

  it('has nothing for a month with no reviews', () => expect(monthWrapped(d, '2025-01', LATER)).toBeNull())

  it('compares January with the December before', () => {
    expect(monthWrapped(data(row('2025-12-01', 'a', 10), row('2026-01-01', 'a', 20)), '2026-01', LATER)?.change).toBe(1)
  })
})
