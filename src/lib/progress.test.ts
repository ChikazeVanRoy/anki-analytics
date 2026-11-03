import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnkiData, DailyDeckStat } from '../data/types'
import {
  dayStatus,
  dueToday,
  greetingPart,
  homeInsight,
  longestStreak,
  milestones,
  milestoneTrack,
  recentDays,
  weekComparison,
} from './progress'
import { lastNDays, totalsByDate } from './stats'

const TODAY = new Date(2026, 10, 3, 12) // 3 Nov 2026, noon

function stat(date: string, deckId: string, reviews: number, extra: Partial<DailyDeckStat> = {}): DailyDeckStat {
  return {
    date,
    deckId,
    reviews,
    again: 0,
    studySeconds: reviews * 10,
    reviewCardReviews: 0,
    reviewCardPassed: 0,
    reviewCardHard: 0,
    matureReviews: 0,
    maturePassed: 0,
    ...extra,
  }
}

function data(daily: DailyDeckStat[], matureCards = [0, 0]): AnkiData {
  return {
    source: 'mock',
    generatedAt: '',
    dayStartHour: 0,
    decks: [
      { id: 'a', name: 'Alpha', totalCards: 10, newCards: 5, youngCards: 3, matureCards: matureCards[0], suspendedCards: 0 },
      { id: 'b', name: 'Beta', totalCards: 5, newCards: 5, youngCards: 0, matureCards: matureCards[1], suspendedCards: 0 },
    ],
    daily,
  }
}

/** Reviews on each of the given days-ago offsets (0 = today). */
const on = (daysAgo: number[], reviews = 10, deckId = 'a') =>
  daysAgo.map((n) => stat(lastNDays(1, n, TODAY)[0], deckId, reviews))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

describe('longestStreak', () => {
  it('finds the longest run of consecutive review days anywhere in history', () => {
    const byDate = totalsByDate(on([20, 19, 18, 17, 10, 9, 1, 0]))
    expect(longestStreak(byDate)).toBe(4)
  })
  it('is 0 without reviews and ignores days with zero reviews', () => {
    expect(longestStreak(new Map())).toBe(0)
    expect(longestStreak(totalsByDate([...on([3]), ...on([2], 0), ...on([1])]))).toBe(1)
  })
  it('counts across month and DST boundaries by calendar day', () => {
    const byDate = totalsByDate(['2026-10-24', '2026-10-25', '2026-10-26', '2026-11-01'].map((d) => stat(d, 'a', 1)))
    expect(longestStreak(byDate)).toBe(3)
  })
})

describe('weekComparison', () => {
  it('compares the last 7 days with the 7 before', () => {
    const byDate = totalsByDate([...on([0, 3, 6], 20), ...on([7, 13], 15)])
    expect(weekComparison(byDate, TODAY)).toEqual({ thisWeek: 60, lastWeek: 30, change: 1 })
  })
  it('has no change when the previous week was empty', () => {
    expect(weekComparison(totalsByDate(on([0])), TODAY).change).toBeNull()
  })
})

describe('recentDays', () => {
  it('returns the last n days oldest first, with zeros for rest days', () => {
    const rows = recentDays(totalsByDate(on([0], 6)), TODAY, 3)
    expect(rows.map((r) => r.reviews)).toEqual([0, 0, 6])
    expect(rows[2]).toMatchObject({ date: '2026-11-03', minutes: 1 })
  })
})

describe('milestones', () => {
  it('reports the highest reached threshold and progress to the next', () => {
    expect(milestoneTrack('reviews', 750)).toEqual({ kind: 'reviews', current: 750, reached: 500, next: 1000, progress: 0.5 })
  })
  it('has no reached milestone before the first threshold', () => {
    expect(milestoneTrack('streak', 2)).toMatchObject({ reached: null, next: 3 })
    expect(milestoneTrack('streak', 2).progress).toBeCloseTo(2 / 3)
  })
  it('is complete past the last threshold', () => {
    expect(milestoneTrack('streak', 400)).toMatchObject({ reached: 365, next: null, progress: 1 })
  })
  it('reads lifetime reviews, best streak and mature cards from the data', () => {
    const d = data([...on([2, 1, 0], 40)], [8, 4])
    const [reviews, streak, known] = milestones(d, totalsByDate(d.daily))
    expect(reviews.current).toBe(120)
    expect(streak.current).toBe(3)
    expect(streak.reached).toBe(3)
    expect(known.current).toBe(12)
    expect(known.reached).toBe(10)
  })
})

describe('dayStatus and greeting', () => {
  it('picks the right Home message', () => {
    expect(dayStatus(false, 0, 0)).toBe('empty')
    expect(dayStatus(true, 5, 3)).toBe('done')
    expect(dayStatus(true, 0, 3)).toBe('keep')
    expect(dayStatus(true, 0, 0)).toBe('start')
  })
  it('greets by hour', () => {
    expect(greetingPart(4)).toBe('evening')
    expect(greetingPart(5)).toBe('morning')
    expect(greetingPart(12)).toBe('afternoon')
    expect(greetingPart(18)).toBe('evening')
  })
})

describe('homeInsight', () => {
  it('is null without any reviews', () => {
    const d = data([])
    expect(homeInsight(d, totalsByDate(d.daily), TODAY)).toBeNull()
  })
  it('celebrates a clearly busier week', () => {
    const d = data([...on([0, 1, 2], 20), ...on([8, 9], 15)])
    const i = homeInsight(d, totalsByDate(d.daily), TODAY)!
    expect(i.tone).toBe('good')
    expect(i.text).toContain('100% more this week')
  })
  it('describes a quieter week without blame', () => {
    const d = data([...on([0], 10), ...on([8, 9], 30)])
    const i = homeInsight(d, totalsByDate(d.daily), TODAY)!
    expect(i.tone).toBe('neutral')
    expect(i.text).toMatch(/^A lighter week/)
  })
  it('names the strongest deck when both have enough reviews', () => {
    const rc = (passed: number) => ({ reviewCardReviews: 40, reviewCardPassed: passed, reviewCardHard: 0, matureReviews: 35, maturePassed: passed - 2 })
    const d = data([stat('2026-11-01', 'a', 40, rc(30)), stat('2026-11-01', 'b', 40, rc(38))])
    expect(homeInsight(d, totalsByDate(d.daily), TODAY)!.text).toMatch(/^Your strongest deck this month is Beta.*95%/)
  })
  it('falls back to consistency over the last 30 days', () => {
    const d = data(on([0, 2, 4]))
    expect(homeInsight(d, totalsByDate(d.daily), TODAY)!.text).toMatch(/3 of the last 30 days/)
  })
})

describe('insight percentages', () => {
  it('does not rank a deck of mostly young cards as strongest', () => {
    const rc = (passed: number) => ({ reviewCardReviews: 40, reviewCardPassed: passed, reviewCardHard: 0, matureReviews: 1, maturePassed: 1 })
    const d = data([stat('2026-11-01', 'a', 40, rc(30)), stat('2026-11-01', 'b', 40, rc(38))])
    expect(homeInsight(d, totalsByDate(d.daily), TODAY)!.text).not.toMatch(/strongest deck/)
  })
  it('never rounds a rate below 100% up to 100%', () => {
    const rc = (passed: number) => ({ reviewCardReviews: 1000, reviewCardPassed: passed, reviewCardHard: 0, matureReviews: 500, maturePassed: 500 })
    const d = data([stat('2026-11-01', 'a', 1000, rc(999)), stat('2026-11-01', 'b', 1000, rc(900))])
    expect(homeInsight(d, totalsByDate(d.daily), TODAY)!.text).toContain('99.9%')
  })
})

describe('dueToday', () => {
  const card = (due: string) => ({
    deckId: 'a',
    stability: 10,
    difficulty: 5,
    lastReview: '2026-10-20',
    due,
    interval: 10,
    state: 'review' as const,
  })
  const withFsrs = (dues: string[], extra: Partial<AnkiData> = {}, buried: string[] = []): AnkiData => ({
    ...data([]),
    generatedAt: new Date(2026, 10, 3, 9).toISOString(), // copied this morning
    fsrs: {
      enabled: true,
      behaviour: [{ deckId: 'a', secondsPerReview: 6, answers: 100 }],
      cards: [...dues.map(card), ...buried.map((d) => ({ ...card(d), buried: true }))],
    } as unknown as NonNullable<AnkiData['fsrs']>,
    ...extra,
  })

  it('counts cards due today or overdue, not later ones, and estimates minutes at the measured pace', () => {
    const due = dueToday(withFsrs(['2026-11-01', '2026-11-03', '2026-11-04', '2026-12-01']), TODAY)
    expect(due).toEqual({ stale: false, cards: 2, minutes: (2 * 6) / 60 })
  })
  it('leaves out buried cards, which Anki won’t show today', () => {
    expect(dueToday(withFsrs(['2026-11-02'], {}, ['2026-11-02', '2026-11-03']), TODAY)).toMatchObject({ cards: 1 })
  })
  it('gives no count when the copy is from an earlier Anki day', () => {
    const yesterday = { generatedAt: new Date(2026, 10, 2, 20).toISOString() }
    expect(dueToday(withFsrs(['2026-11-01'], yesterday), TODAY)).toEqual({ stale: true })
    // Before the rollover hour it's still the previous Anki day: a copy from 2am counts as 2 Nov
    const early = { generatedAt: new Date(2026, 10, 3, 2).toISOString(), dayStartHour: 4 }
    expect(dueToday(withFsrs(['2026-11-01'], early), TODAY)).toEqual({ stale: true })
  })
  it('is null without FSRS data, so sample data never shows a due count', () => {
    expect(dueToday(data([]), TODAY)).toBeNull()
  })
})
