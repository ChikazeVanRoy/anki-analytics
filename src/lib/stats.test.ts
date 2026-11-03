import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnkiData, DailyDeckStat } from '../data/types'
import {
  againRateSeries,
  ankiToday,
  bucketFor,
  bucketStart,
  currentStreak,
  deckSummaries,
  lastNDays,
  rangeDays,
  retentionSplit,
  reviewsByPeriod,
  summarize,
  toDateKey,
  totalsByDate,
} from './stats'

function stat(date: string, deckId: string, reviews: number, again = 0, extra: Partial<DailyDeckStat> = {}): DailyDeckStat {
  return {
    date,
    deckId,
    reviews,
    again,
    studySeconds: reviews * 10,
    reviewCardReviews: 0,
    reviewCardPassed: 0,
    matureReviews: 0,
    maturePassed: 0,
    ...extra,
  }
}

function data(daily: DailyDeckStat[], dayStartHour = 0): AnkiData {
  return {
    source: 'mock',
    generatedAt: '',
    dayStartHour,
    decks: [
      { id: 'a', name: 'A', totalCards: 10, newCards: 5, youngCards: 3, matureCards: 2, suspendedCards: 0 },
      { id: 'b', name: 'B', totalCards: 5, newCards: 5, youngCards: 0, matureCards: 0, suspendedCards: 0 },
    ],
    daily,
  }
}

// Freeze "now" at Sunday 15 March 2026, 12:00 local time, so results don't depend on when tests run.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 2, 15, 12, 0))
})
afterEach(() => vi.useRealTimers())

describe('lastNDays', () => {
  it('returns n days ending today, oldest first, across a month boundary', () => {
    expect(lastNDays(3, 0, new Date(2026, 2, 1))).toEqual(['2026-02-27', '2026-02-28', '2026-03-01'])
  })
  it('can end `offset` days before today (the previous period)', () => {
    expect(lastNDays(2, 2, new Date(2026, 2, 15))).toEqual(['2026-03-12', '2026-03-13'])
  })
})

describe('ankiToday', () => {
  it('treats times before the rollover hour as the previous day', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 0, 30))
    expect(toDateKey(ankiToday(data([], 1)))).toBe('2026-03-14')
    vi.setSystemTime(new Date(2026, 2, 15, 1, 30))
    expect(toDateKey(ankiToday(data([], 1)))).toBe('2026-03-15')
  })
})

describe('currentStreak', () => {
  const today = new Date(2026, 2, 15)
  it('counts consecutive days ending today', () => {
    const byDate = totalsByDate([stat('2026-03-13', 'a', 5), stat('2026-03-14', 'a', 5), stat('2026-03-15', 'a', 5)])
    expect(currentStreak(byDate, today)).toBe(3)
  })
  it('still counts up to yesterday when today has no reviews yet', () => {
    const byDate = totalsByDate([stat('2026-03-13', 'a', 5), stat('2026-03-14', 'a', 5)])
    expect(currentStreak(byDate, today)).toBe(2)
  })
  it('stops at a gap', () => {
    const byDate = totalsByDate([stat('2026-03-11', 'a', 5), stat('2026-03-13', 'a', 5), stat('2026-03-14', 'a', 5)])
    expect(currentStreak(byDate, today)).toBe(2)
  })
  it('is 0 with no recent reviews', () => {
    expect(currentStreak(totalsByDate([stat('2026-03-01', 'a', 5)]), today)).toBe(0)
  })
})

describe('summarize', () => {
  it('computes Again rate and averages over the range', () => {
    const s = summarize(data([stat('2026-03-15', 'a', 40, 4), stat('2026-03-14', 'b', 60, 6)]), 7)
    expect(s.totalCards).toBe(15)
    expect(s.reviewsToday).toBe(40)
    expect(s.againRate).toBeCloseTo(0.1)
    expect(s.avgPerDay).toBeCloseTo(100 / 7)
    expect(s.activeDays).toBe(2)
  })
  it('flags when the previous period had no reviews (so no misleading comparison)', () => {
    expect(summarize(data([stat('2026-03-15', 'a', 10)]), 7).hasPrevious).toBe(false)
    expect(summarize(data([stat('2026-03-15', 'a', 10), stat('2026-03-05', 'a', 10)]), 7).hasPrevious).toBe(true)
  })
  it('computes retention from review-card answers only', () => {
    const s = summarize(
      data([stat('2026-03-15', 'a', 50, 10, { reviewCardReviews: 20, reviewCardPassed: 18, matureReviews: 5, maturePassed: 5 })]),
      7,
    )
    expect(s.retention.reviewCards).toEqual({ reviews: 20, rate: 0.9 })
    expect(s.retention.mature).toEqual({ reviews: 5, rate: 1 })
  })
  it('has zero rates (not NaN) with no data', () => {
    const s = summarize(data([]), 30)
    expect(s.againRate).toBe(0)
    expect(s.retention.mature.rate).toBe(0)
  })
})

describe('rangeDays', () => {
  it('uses fixed lengths for preset ranges', () => {
    expect(rangeDays(data([]), '90d')).toBe(90)
  })
  it('runs "all time" from the first review to today, inclusive', () => {
    expect(rangeDays(data([stat('2026-03-15', 'a', 1), stat('2026-03-01', 'a', 1)]), 'all')).toBe(15)
  })
})

describe('buckets', () => {
  it('picks day/week/month by range length', () => {
    expect([bucketFor(90), bucketFor(365), bucketFor(800)]).toEqual(['day', 'week', 'month'])
  })
  it('maps dates to the Monday of their week and the 1st of their month', () => {
    expect(bucketStart('2026-03-15', 'week')).toBe('2026-03-09') // Sunday -> previous Monday
    expect(bucketStart('2026-03-09', 'week')).toBe('2026-03-09')
    expect(bucketStart('2026-03-15', 'month')).toBe('2026-03-01')
  })
})

describe('reviewsByPeriod', () => {
  it('fills every day with zeros and sums per deck', () => {
    const rows = reviewsByPeriod(data([stat('2026-03-15', 'a', 3), stat('2026-03-15', 'b', 2)]), 7)
    expect(rows).toHaveLength(7)
    expect(rows[0]).toEqual({ date: '2026-03-09', a: 0, b: 0 })
    expect(rows[6]).toEqual({ date: '2026-03-15', a: 3, b: 2 })
  })
  it('groups into weeks for a 1-year range and ignores reviews before the range', () => {
    const rows = reviewsByPeriod(
      data([stat('2026-03-10', 'a', 3), stat('2026-03-15', 'a', 4), stat('2024-01-01', 'a', 99)]),
      365,
    )
    expect(rows.at(-1)).toEqual({ date: '2026-03-09', a: 7, b: 0 })
    expect(rows.reduce((n, r) => n + (r.a as number), 0)).toBe(7)
  })
})

describe('againRateSeries', () => {
  it('shows a gap (null) when a window has too few reviews to be meaningful', () => {
    const rows = againRateSeries(data([stat('2026-03-15', 'a', 1, 1)]), 7)
    expect(rows.at(-1)!.a).toBeNull()
  })
  it('uses a trailing 7-day window and null where a deck had no reviews', () => {
    const rows = againRateSeries(data([stat('2026-03-10', 'a', 10, 2), stat('2026-03-15', 'a', 10, 0)]), 7)
    const last = rows.at(-1)!
    expect(last.date).toBe('2026-03-15')
    expect(last.a).toBeCloseTo(0.1) // (2 + 0) / (10 + 10)
    expect(last.b).toBeNull()
  })
})

describe('deckSummaries', () => {
  it('keeps decks separate', () => {
    const [a, b] = deckSummaries(data([stat('2026-03-15', 'a', 10, 1), stat('2026-03-15', 'b', 20, 5)]), 7)
    expect(a.reviews).toBe(10)
    expect(a.againRate).toBeCloseTo(0.1)
    expect(b.againRate).toBeCloseTo(0.25)
  })
})

describe('retentionSplit', () => {
  it('derives young retention from the overall and mature counts', () => {
    const r = {
      reviewCards: { reviews: 100, rate: 0.9 },
      mature: { reviews: 40, rate: 0.95 },
    }
    const split = retentionSplit(r)
    expect(split.young.reviews).toBe(60)
    expect(split.young.rate).toBeCloseTo(52 / 60) // 90 passed overall, 38 of them mature
    expect(split.matureThin).toBe(false)
  })

  it('flags a window with almost no mature reviews (the 795/796 case)', () => {
    const split = retentionSplit({ reviewCards: { reviews: 796, rate: 795 / 796 }, mature: { reviews: 1, rate: 1 } })
    expect(split.matureThin).toBe(true)
    expect(split.young.reviews).toBe(795)
  })

  it('is not flagged when there are no reviews at all', () => {
    expect(retentionSplit({ reviewCards: { reviews: 0, rate: 0 }, mature: { reviews: 0, rate: 0 } }).matureThin).toBe(false)
  })
})
