// Badges, worked out from your whole history each time, so they can't be lost or faked (pure, tested).
// They reward showing up and proven memory, never volume or a high score: a badge for Remembered would pay for
// pressing Good on a card you forgot.

import type { AnkiData } from '../data/types'
import { dayNumber } from './dates'
import { longestWithRests } from './progress'
import type { DayTotal } from './stats'

export const BADGES = ['firstReview', 'firstProven', 'started100', 'started500', 'week', 'month', 'comeback', 'steady'] as const
export type BadgeId = (typeof BADGES)[number]

const COMEBACK_GAP = 7 // days away before a return counts
const STEADY_WINDOW = 30
const STEADY_DAYS = 20

/** 20+ study days in 30, with no day above twice the middle day: regular, with no cramming to get there. */
function hadSteadyMonth(byDate: Map<string, DayTotal>) {
  const days = [...byDate].filter(([, t]) => t.reviews > 0).map(([d, t]) => ({ n: dayNumber(d), reviews: t.reviews })).sort((a, b) => a.n - b.n)
  return days.some((first, i) => {
    const month = days.slice(i).filter((d) => d.n < first.n + STEADY_WINDOW)
    if (month.length < STEADY_DAYS) return false
    const sorted = month.map((d) => d.reviews).sort((a, b) => a - b)
    return sorted[sorted.length - 1] <= 2 * sorted[Math.floor(sorted.length / 2)]
  })
}

function cameBack(byDate: Map<string, DayTotal>) {
  const days = [...byDate].filter(([, t]) => t.reviews > 0).map(([d]) => dayNumber(d)).sort((a, b) => a - b)
  return days.some((d, i) => i > 0 && d - days[i - 1] > COMEBACK_GAP)
}

export function earnedBadges(data: AnkiData, byDate: Map<string, DayTotal>): BadgeId[] {
  const started = data.decks.reduce((n, d) => n + d.youngCards + d.matureCards, 0)
  const proven = Object.values(data.fsrs?.proven ?? {}).reduce((a, b) => a + b, 0)
  const best = longestWithRests(byDate)
  const earned: Record<BadgeId, boolean> = {
    firstReview: [...byDate.values()].some((t) => t.reviews > 0),
    firstProven: proven > 0,
    started100: started >= 100,
    started500: started >= 500,
    week: best >= 7,
    month: best >= 30,
    comeback: cameBack(byDate),
    steady: hadSteadyMonth(byDate),
  }
  return BADGES.filter((b) => earned[b])
}
