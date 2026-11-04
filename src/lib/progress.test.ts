import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnkiData, DailyDeckStat } from '../data/types'
import {
  dayStatus,
  greetingPart,
  homeInsight,
  longestStreak,
  milestones,
  milestoneTrack,
  nextStep,
  recentDays,
  staleCopyKey,
  todayWork,
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
    expect(milestoneTrack('days', 2)).toMatchObject({ reached: null, next: 7 })
    expect(milestoneTrack('days', 2).progress).toBeCloseTo(2 / 7)
  })
  it('is complete past the last threshold', () => {
    expect(milestoneTrack('days', 1_200)).toMatchObject({ reached: 1_000, next: null, progress: 1 })
  })
  it('reads lifetime reviews, days studied and mature cards from the data', () => {
    const d = data([...on([2, 1, 0], 40)], [8, 4])
    const [reviews, days, known] = milestones(d, totalsByDate(d.daily))
    expect(reviews.current).toBe(120)
    expect(days.current).toBe(3)
    expect(days.reached).toBeNull()
    expect(known.current).toBe(12)
    expect(known.reached).toBe(10)
  })
  it('only counts cards proven at a long interval when the review log can show that', () => {
    const d = { ...data([...on([1], 40)], [8, 4]), fsrs: { proven: { a: 2, b: 1 } } } as unknown as AnkiData
    expect(milestones(d, totalsByDate(d.daily))[2].current).toBe(3)
  })
})

describe('dayStatus and greeting', () => {
  it('picks the right Home message', () => {
    expect(dayStatus(false, 0, 0)).toBe('empty')
    expect(dayStatus(true, 5, 3)).toBe('done')
    expect(dayStatus(true, 0, 3)).toBe('keep')
    expect(dayStatus(true, 0, 0)).toBe('start')
    expect(dayStatus(true, 0, 3, true)).toBe('stale')
    expect(dayStatus(false, 0, 0, true)).toBe('empty')
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
    expect(i.text).toContain('100% more in the last 7 days')
  })
  it('describes a quieter week without blame', () => {
    const d = data([...on([0], 10), ...on([8, 9], 30)])
    const i = homeInsight(d, totalsByDate(d.daily), TODAY)!
    expect(i.tone).toBe('neutral')
    expect(i.text).toMatch(/^A lighter week/)
  })
  it('doesn’t cap a rise above 100%', () => {
    const d = data(on([1], 250).concat(on([8], 100)))
    expect(homeInsight(d, totalsByDate(d.daily), TODAY)!.text).toMatch(/150% more in the last 7 days/)
  })
  it('names the strongest deck when both have enough reviews', () => {
    const rc = (passed: number) => ({ reviewCardReviews: 40, reviewCardPassed: passed, reviewCardHard: 0, matureReviews: 35, maturePassed: passed - 2 })
    const d = data([stat('2026-11-01', 'a', 40, rc(30)), stat('2026-11-01', 'b', 40, rc(38))])
    expect(homeInsight(d, totalsByDate(d.daily), TODAY)!.text).toMatch(/^Your strongest deck this month is Beta.*95\.0%/)
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

describe('staleCopyKey', () => {
  const copied = (generatedAt: string, source: AnkiData['source'] = 'anki') => ({ ...data([]), source, generatedAt })

  it('gives the copy’s Anki day when it’s before today', () => {
    expect(staleCopyKey(copied(new Date(2026, 10, 1, 20).toISOString()), TODAY)).toBe('2026-11-01')
  })
  it('counts a copy from before the rollover as the day before', () => {
    const early = { ...copied(new Date(2026, 10, 2, 2).toISOString()), dayStartHour: 4 }
    expect(staleCopyKey(early, TODAY)).toBe('2026-11-01')
  })
  it('is null for today’s copy, sample data and an unreadable date', () => {
    expect(staleCopyKey(copied(new Date(2026, 10, 3, 9).toISOString()), TODAY)).toBeNull()
    expect(staleCopyKey(copied(new Date(2026, 10, 1).toISOString(), 'mock'), TODAY)).toBeNull()
    expect(staleCopyKey(copied('not a date'), TODAY)).toBeNull()
  })
})

describe('todayWork', () => {
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
      behaviour: [{ deckId: 'a', secondsPerReview: 6, answers: 100, learningReviewsPerNewCard: 2.5 }],
      presets: [{ deckId: 'a', newPerDay: 0, reviewsPerDay: 1_000 }],
      newCards: {},
      newToday: {},
      cards: [...dues.map(card), ...buried.map((d) => ({ ...card(d), buried: true }))],
    } as unknown as NonNullable<AnkiData['fsrs']>,
    ...extra,
  })

  it('counts cards due today or overdue, not later ones, and estimates minutes at the measured pace', () => {
    const due = todayWork(withFsrs(['2026-11-01', '2026-11-03', '2026-11-04', '2026-12-01']), TODAY, 6)
    expect(due).toEqual({ stale: false, cards: 2, heldBack: 0, newCards: 0, minutes: (2 * 6) / 60 })
  })
  describe('with new cards', () => {
    type Limits = { deckId: string; newPerDay: number; reviewsPerDay?: number }
    const newDay = (presets: Limits[], newCards: Record<string, number>, newToday: Record<string, number>, extra: Partial<NonNullable<AnkiData['fsrs']>> = {}) => {
      const d = withFsrs(['2026-11-03'])
      const limited = presets.map((p) => ({ reviewsPerDay: 1_000, ...p }))
      return todayWork({ ...d, fsrs: { ...d.fsrs!, presets: limited, newCards, newToday, ...extra } as unknown as NonNullable<AnkiData['fsrs']> }, TODAY, 6)
    }
    it('takes off what was already started today', () => {
      expect(newDay([{ deckId: 'a', newPerDay: 15 }], { a: 100 }, { a: 4 })).toMatchObject({ newCards: 11 })
    })
    it('adds up the decks, each capped by what it has left', () => {
      expect(newDay([{ deckId: 'a', newPerDay: 15 }, { deckId: 'b', newPerDay: 30 }], { a: 100, b: 7 }, {})).toMatchObject({ newCards: 22 })
    })
    it('never goes below zero when the limit was exceeded', () => {
      expect(newDay([{ deckId: 'a', newPerDay: 5 }], { a: 100 }, { a: 9 })).toMatchObject({ newCards: 0 })
    })
    it('leaves out buried new cards, which Anki won’t show today', () => {
      expect(newDay([{ deckId: 'a', newPerDay: 15 }], { a: 12 }, {}, { buriedNew: { a: 8 } })).toMatchObject({ newCards: 4 })
    })
    it('caps reviews at the review limit, and says how many are held back', () => {
      const d = withFsrs(['2026-11-03', '2026-11-03', '2026-11-02'])
      const fsrs = { ...d.fsrs!, presets: [{ deckId: 'a', newPerDay: 10, reviewsPerDay: 2 }], newCards: { a: 100 } } as unknown as NonNullable<AnkiData['fsrs']>
      expect(todayWork({ ...d, fsrs }, TODAY, 6)).toMatchObject({ cards: 2, heldBack: 1, newCards: 0 })
    })
    it('counts reviews and new cards already done against the review limit', () => {
      const work = newDay([{ deckId: 'a', newPerDay: 10, reviewsPerDay: 8 }], { a: 100 }, { a: 2 }, { reviewsToday: { a: 3 } })
      // 8 - 3 reviews - 2 new leaves 3: one due card, then 2 new cards
      expect(work).toMatchObject({ cards: 1, heldBack: 0, newCards: 2 })
    })
    it('never holds back learning or relearning cards', () => {
      const d = withFsrs([])
      const fsrs = {
        ...d.fsrs!,
        cards: [card('2026-11-03'), card('2026-11-03'), { ...card('2026-11-03'), state: 'relearning' as const }],
        presets: [{ deckId: 'a', newPerDay: 0, reviewsPerDay: 1 }],
      } as unknown as NonNullable<AnkiData['fsrs']>
      expect(todayWork({ ...d, fsrs }, TODAY, 6)).toMatchObject({ cards: 2, heldBack: 1 })
    })
    it('holds back cards in day-long learning steps, which count as reviews', () => {
      const d = withFsrs([])
      const fsrs = {
        ...d.fsrs!,
        cards: [card('2026-11-03'), { ...card('2026-11-03'), state: 'learning' as const, interday: true }],
        presets: [{ deckId: 'a', newPerDay: 0, reviewsPerDay: 1 }],
      } as unknown as NonNullable<AnkiData['fsrs']>
      expect(todayWork({ ...d, fsrs }, TODAY, 6)).toMatchObject({ cards: 1, heldBack: 1 })
    })
    it('lets new cards past a used-up review limit when Anki is set to', () => {
      const work = newDay([{ deckId: 'a', newPerDay: 10, reviewsPerDay: 1 }], { a: 100 }, {}, { newCardsIgnoreReviewLimit: true })
      expect(work).toMatchObject({ cards: 1, newCards: 10 })
    })
    it('still works on an answer from an older API, without today’s counts', () => {
      expect(newDay([{ deckId: 'a', newPerDay: 10 }], { a: 100 }, undefined as unknown as Record<string, number>)).toMatchObject({ newCards: 10 })
    })
    it('times each deck at its own pace', () => {
      const d = withFsrs([])
      const fsrs = {
        ...d.fsrs!,
        cards: [card('2026-11-03'), { ...card('2026-11-03'), deckId: 'b' }],
        presets: ['a', 'b'].map((deckId) => ({ deckId, newPerDay: 0, reviewsPerDay: 100 })),
        behaviour: [
          { deckId: 'a', secondsPerReview: 10, answers: 100, learningReviewsPerNewCard: 2 },
          { deckId: 'b', secondsPerReview: 20, answers: 100, learningReviewsPerNewCard: 2 },
        ],
      } as unknown as NonNullable<AnkiData['fsrs']>
      expect(todayWork({ ...d, fsrs }, TODAY, 6)).toMatchObject({ minutes: 30 / 60 })
    })
    it('counts a new card’s measured first-day answers in the time', () => {
      expect(newDay([{ deckId: 'a', newPerDay: 10 }], { a: 100 }, {})).toMatchObject({ minutes: ((1 + 10 * 2.5) * 6) / 60 })
    })
    it('counts at least one answer per new card when none are measured', () => {
      expect(newDay([{ deckId: 'b', newPerDay: 10 }], { b: 100 }, {})).toMatchObject({ minutes: ((1 + 10) * 6) / 60 })
    })
  })
  it('leaves out buried cards, which Anki won’t show today', () => {
    expect(todayWork(withFsrs(['2026-11-02'], {}, ['2026-11-02', '2026-11-03']), TODAY, 6)).toMatchObject({ cards: 1 })
  })
  it('gives no count when the copy is from an earlier Anki day', () => {
    const yesterday = { generatedAt: new Date(2026, 10, 2, 20).toISOString() }
    expect(todayWork(withFsrs(['2026-11-01'], yesterday), TODAY, 6)).toEqual({ stale: true })
    // Before the rollover hour it's still the previous Anki day: a copy from 2am counts as 2 Nov
    const early = { generatedAt: new Date(2026, 10, 3, 2).toISOString(), dayStartHour: 4 }
    expect(todayWork(withFsrs(['2026-11-01'], early), TODAY, 6)).toEqual({ stale: true })
  })
  it('is null without FSRS data, so sample data never shows a due count', () => {
    expect(todayWork(data([]), TODAY, 6)).toBeNull()
  })
})

describe('nextStep', () => {
  const work = (cards: number, newCards: number, minutes = 10.4) => ({ stale: false as const, cards, heldBack: 0, newCards, minutes })

  it('puts reviews first, then new cards, then rest', () => {
    expect(nextStep(work(5, 10))).toEqual({ kind: 'reviews', cards: 5, minutes: 10 })
    expect(nextStep(work(0, 10))).toEqual({ kind: 'new', cards: 10, minutes: 10 })
    expect(nextStep(work(0, 0, 0))).toEqual({ kind: 'done' })
  })

  it('never promises less than a minute, and asks for a refresh on an old copy', () => {
    expect(nextStep(work(1, 0, 0.1))).toMatchObject({ minutes: 1 })
    expect(nextStep({ stale: true })).toEqual({ kind: 'refresh' })
  })
})
