// When a deck's last new card would be started, at the pace you've actually been introducing them (pure, tested).
// A projection from measured data. Without real FSRS data there's no measured pace, so nothing is shown.

import type { AnkiData } from '../data/types'
import { dayNumber, keyFromDayNumber, toDateKey } from './dates'

/** Below this many new cards, or this many days of history, a pace would mostly be noise. */
export const MIN_NEW_CARDS = 20
export const MIN_PACE_DAYS = 14

export type DeckFinish =
  | { kind: 'done' } // no new cards left to start
  | { kind: 'thin' } // too little recent history to project from
  | { kind: 'date'; date: string; perDay: number; remaining: number; introduced: number; days: number }

export function deckFinish(data: AnkiData, deckId: string, today: Date): DeckFinish | null {
  const fsrs = data.fsrs?.enabled ? data.fsrs : null
  if (!fsrs) return null
  const remaining = fsrs.newCards[deckId] ?? 0
  if (remaining === 0) return { kind: 'done' }

  const first = data.daily.reduce<string | null>((min, s) => (s.deckId === deckId && s.reviews > 0 && (!min || s.date < min) ? s.date : min), null)
  const introduced = fsrs.behaviour.find((b) => b.deckId === deckId)?.newCardsIntroduced ?? 0
  const todayNumber = dayNumber(toDateKey(today))
  // A deck younger than the measurement window has only had those days to introduce cards
  const days = first ? Math.min(fsrs.windowDays, todayNumber - dayNumber(first) + 1) : 0
  if (introduced < MIN_NEW_CARDS || days < MIN_PACE_DAYS) return { kind: 'thin' }

  const perDay = introduced / days
  return { kind: 'date', date: keyFromDayNumber(todayNumber + Math.ceil(remaining / perDay)), perDay, remaining, introduced, days }
}
