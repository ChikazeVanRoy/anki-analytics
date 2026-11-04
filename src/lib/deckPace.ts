// When a deck's last new card would be started, at the pace you've actually been introducing them (pure, tested).
// A projection from measured data. Without real FSRS data there's no measured pace, so nothing is shown.

import type { AnkiData } from '../data/types'
import { dayNumber, keyFromDayNumber, toDateKey } from './dates'

/** Below this many new cards, or this many days of history, a pace would mostly be noise. */
export const MIN_NEW_CARDS = 20
export const MIN_PACE_DAYS = 14

export type DeckFinish =
  | { kind: 'done' } // no new cards left to start (suspended ones can't be started)
  | { kind: 'thin' } // too little recent history to project from
  | { kind: 'date'; date: string; perDay: number; remaining: number; introduced: number; days: number }

export function deckFinish(data: AnkiData, deckId: string, today: Date): DeckFinish | null {
  const fsrs = data.fsrs?.enabled ? data.fsrs : null
  if (!fsrs) return null
  const remaining = fsrs.newCards[deckId]
  if (remaining === undefined) return null
  if (remaining === 0) return { kind: 'done' }

  const introduced = fsrs.behaviour.find((b) => b.deckId === deckId)?.newCardsIntroduced ?? 0
  const todayNumber = dayNumber(toDateKey(today))
  // The pace runs from the first day studied inside the window: a deck picked up partway through it, new or
  // after a long break, has only had those days to introduce cards
  const windowStart = keyFromDayNumber(todayNumber - fsrs.windowDays + 1)
  const first = data.daily.reduce<string | null>(
    (min, s) => (s.deckId === deckId && s.reviews > 0 && s.date >= windowStart && (!min || s.date < min) ? s.date : min),
    null,
  )
  const days = first ? todayNumber - dayNumber(first) + 1 : 0
  if (introduced < MIN_NEW_CARDS || days < MIN_PACE_DAYS) return { kind: 'thin' }

  const perDay = introduced / days
  return { kind: 'date', date: keyFromDayNumber(todayNumber + Math.ceil(remaining / perDay)), perDay, remaining, introduced, days }
}

/**
 * New cards you've actually been starting: per calendar day, and per study day as the simulator counts them, in
 * total and by deck. Sums the decks' own paces, so it's the pace behind their finish dates. Null when no deck has
 * enough history.
 */
export function currentPace(data: AnkiData, today: Date, studyDaysPerWeek: number) {
  const byDeck: Record<string, number> = {}
  let perDay = 0
  for (const d of data.decks) {
    const finish = deckFinish(data, d.id, today)
    if (finish?.kind !== 'date') continue
    perDay += finish.perDay
    byDeck[d.id] = (finish.perDay * 7) / studyDaysPerWeek
  }
  return perDay > 0 ? { perDay, perStudyDay: (perDay * 7) / studyDaysPerWeek, byDeck } : null
}

/** The day the last of `remaining` new cards would be started at `perStudyDay`, or null at no pace at all. */
export function finishAt(remaining: number, perStudyDay: number, studyDaysPerWeek: number, today: Date): string | null {
  if (perStudyDay <= 0) return null
  return keyFromDayNumber(dayNumber(toDateKey(today)) + Math.ceil((remaining / perStudyDay) * (7 / studyDaysPerWeek)))
}
