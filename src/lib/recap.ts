// What changed since your last visit, for the celebration after closing Anki (pure, tested).

import type { AnkiData } from '../data/types'
import { earnedBadges, type BadgeId } from './badges'
import { toDateKey } from './dates'
import { streakWithRests, todayWork } from './progress'
import type { DayTotal } from './stats'

export interface Snapshot {
  reviews: number
  seconds: number
  started: number
  proven: number
  streak: number
  badges: BadgeId[]
  /** The latest day with reviews, and the reviews before it: a past that changes means the data did, not you. */
  day: string
  before: number
}

export interface Recap {
  reviews: number
  minutes: number
  newCards: number
  bloomed: number
  streak: number
  badges: BadgeId[]
  /** Nothing left in Anki today, and you studied today. */
  allDone: boolean
}

export const reviewsBefore = (byDate: Map<string, DayTotal>, day: string) =>
  [...byDate].reduce((n, [d, t]) => (d < day ? n + t.reviews : n), 0)

export function snapshotOf(data: AnkiData, byDate: Map<string, DayTotal>, today: Date): Snapshot {
  const totals = [...byDate.values()]
  const day = [...byDate].filter(([, t]) => t.reviews > 0).reduce((latest, [d]) => (d > latest ? d : latest), '')
  return {
    reviews: totals.reduce((n, t) => n + t.reviews, 0),
    seconds: totals.reduce((n, t) => n + t.seconds, 0),
    started: data.decks.reduce((n, d) => n + d.youngCards + d.matureCards, 0),
    proven: Object.values(data.fsrs?.proven ?? {}).reduce((a, b) => a + b, 0),
    streak: streakWithRests(byDate, today).days,
    badges: earnedBadges(data, byDate),
    day,
    before: reviewsBefore(byDate, day),
  }
}

/** You studied today and Anki has nothing more for you, as on Home. A quiet day with nothing due doesn't count. */
export function allDoneToday(data: AnkiData, byDate: Map<string, DayTotal>, today: Date): boolean {
  const left = todayWork(data, today, 0)
  return !!left && !left.stale && left.cards + left.newCards === 0 && (byDate.get(toDateKey(today))?.reviews ?? 0) > 0
}

/**
 * Null until there's a visit to compare with and you've studied since. Reviews only ever join the end of the log,
 * so if earlier days changed, a deck was added or left out or the profile changed, and there's no session to
 * celebrate. Cards can leave a deck, so nothing goes below 0.
 */
export function recapSince(last: Snapshot | null, now: Snapshot, byDate: Map<string, DayTotal>, allDone = false): Recap | null {
  if (!last || now.reviews <= last.reviews || reviewsBefore(byDate, last.day) !== last.before) return null
  return {
    reviews: now.reviews - last.reviews,
    minutes: Math.max(0, now.seconds - last.seconds) / 60,
    newCards: Math.max(0, now.started - last.started),
    bloomed: Math.max(0, now.proven - last.proven),
    streak: now.streak,
    badges: now.badges.filter((b) => !last.badges.includes(b)),
    allDone,
  }
}
