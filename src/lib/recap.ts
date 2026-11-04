// What changed since your last visit, for the celebration after closing Anki (pure, tested).

import type { AnkiData } from '../data/types'
import { earnedBadges, type BadgeId } from './badges'
import { streakWithRests } from './progress'
import type { DayTotal } from './stats'

export interface Snapshot {
  reviews: number
  seconds: number
  started: number
  proven: number
  streak: number
  badges: BadgeId[]
}

export interface Recap {
  reviews: number
  minutes: number
  newCards: number
  bloomed: number
  streak: number
  badges: BadgeId[]
}

export function snapshotOf(data: AnkiData, byDate: Map<string, DayTotal>, today: Date): Snapshot {
  const totals = [...byDate.values()]
  return {
    reviews: totals.reduce((n, t) => n + t.reviews, 0),
    seconds: totals.reduce((n, t) => n + t.seconds, 0),
    started: data.decks.reduce((n, d) => n + d.youngCards + d.matureCards, 0),
    proven: Object.values(data.fsrs?.proven ?? {}).reduce((a, b) => a + b, 0),
    streak: streakWithRests(byDate, today).days,
    badges: earnedBadges(data, byDate),
  }
}

/** Null until there's a visit to compare with and you've studied since. Cards can leave a deck, so nothing goes below 0. */
export function recapSince(last: Snapshot | null, now: Snapshot): Recap | null {
  if (!last || now.reviews <= last.reviews) return null
  return {
    reviews: now.reviews - last.reviews,
    minutes: Math.max(0, now.seconds - last.seconds) / 60,
    newCards: Math.max(0, now.started - last.started),
    bloomed: Math.max(0, now.proven - last.proven),
    streak: now.streak,
    badges: now.badges.filter((b) => !last.badges.includes(b)),
  }
}
