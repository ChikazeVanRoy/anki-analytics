import { describe, expect, it } from 'vitest'
import type { AnkiData } from '../data/types'
import { earnedBadges } from './badges'
import { keyFromDayNumber } from './dates'
import type { DayTotal } from './stats'

const start = 20_000
const study = (...days: [number, number?][]) =>
  new Map<string, DayTotal>(days.map(([n, reviews = 10]) => [keyFromDayNumber(start + n), { reviews, again: 0, seconds: 60 }]))
const run = (from: number, to: number, reviews = 10) => Array.from({ length: to - from + 1 }, (_, i): [number, number] => [from + i, reviews])
const data = (started = 0, proven?: number) =>
  ({ decks: [{ youngCards: started, matureCards: 0 }], ...(proven !== undefined && { fsrs: { proven: { a: proven } } }) }) as unknown as AnkiData

describe('earnedBadges', () => {
  it('has nothing to give before the first review', () => expect(earnedBadges(data(), new Map())).toEqual([]))

  it('rewards cards started and proven', () => {
    expect(earnedBadges(data(120, 1), study([0]))).toEqual(['firstReview', 'firstProven', 'started100'])
    expect(earnedBadges(data(500), study([0]))).toContain('started500')
  })

  it('rewards streaks, with rest days', () => {
    expect(earnedBadges(data(), study(...run(0, 2), ...run(4, 7)))).toContain('week')
    expect(earnedBadges(data(), study(...run(0, 5)))).not.toContain('week')
  })

  it('rewards coming back after more than a week away', () => {
    expect(earnedBadges(data(), study([0], [8]))).toContain('comeback')
    expect(earnedBadges(data(), study([0], [7]))).not.toContain('comeback')
  })

  it('rewards a regular month, but not one reached by cramming', () => {
    expect(earnedBadges(data(), study(...run(0, 19)))).toContain('steady')
    expect(earnedBadges(data(), study(...run(0, 18), [19, 500]))).not.toContain('steady')
    expect(earnedBadges(data(), study(...run(0, 18)))).not.toContain('steady')
  })
})
