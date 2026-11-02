// Pure functions that turn raw daily stats into what the UI shows.
// No React here, so they are easy to reuse in the API later.

import type { AnkiData, DailyDeckStat, Deck } from '../data/types'
import { toDateKey } from './dates'

export { parseDateKey, toDateKey } from './dates'

export const RANGE_OPTIONS = [7, 30, 90] as const
export type RangeDays = (typeof RANGE_OPTIONS)[number]

export interface DayTotal {
  reviews: number
  again: number
  seconds: number
}


/** The last `n` date keys, oldest first, ending `offset` days before today. */
export function lastNDays(n: number, offset = 0, today = new Date()): string[] {
  const keys: string[] = []
  for (let i = n - 1 + offset; i >= offset; i--) {
    keys.push(toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)))
  }
  return keys
}

/** "Today" in Anki terms: before the rollover hour it is still the previous day. */
export function ankiToday(data: AnkiData): Date {
  return new Date(Date.now() - data.dayStartHour * 3_600_000)
}

export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

function addTo(map: Map<string, DayTotal>, key: string, s: DailyDeckStat) {
  const t = map.get(key) ?? { reviews: 0, again: 0, seconds: 0 }
  t.reviews += s.reviews
  t.again += s.again
  t.seconds += s.studySeconds
  map.set(key, t)
}

export function totalsByDate(daily: DailyDeckStat[]): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>()
  for (const s of daily) addTo(map, s.date, s)
  return map
}

function sumDays(byDate: Map<string, DayTotal>, days: string[]): DayTotal {
  const sum = { reviews: 0, again: 0, seconds: 0 }
  for (const d of days) {
    const t = byDate.get(d)
    if (!t) continue
    sum.reviews += t.reviews
    sum.again += t.again
    sum.seconds += t.seconds
  }
  return sum
}

/** Consecutive days with reviews. If today has none yet, the streak runs to yesterday. */
export function currentStreak(byDate: Map<string, DayTotal>, today = new Date()): number {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!byDate.get(toDateKey(d))?.reviews) d.setDate(d.getDate() - 1)
  let streak = 0
  while ((byDate.get(toDateKey(d))?.reviews ?? 0) > 0) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function summarize(data: AnkiData, range: RangeDays) {
  const today = ankiToday(data)
  const byDate = totalsByDate(data.daily)
  const days = lastNDays(range, 0, today)
  const current = sumDays(byDate, days)
  const previous = sumDays(byDate, lastNDays(range, range, today))

  return {
    totalCards: data.decks.reduce((n, d) => n + d.totalCards, 0),
    reviewsToday: byDate.get(days[days.length - 1])?.reviews ?? 0,
    avgPerDay: current.reviews / range,
    prevAvgPerDay: previous.reviews / range,
    hasPrevious: previous.reviews > 0,
    againRate: ratio(current.again, current.reviews),
    prevAgainRate: ratio(previous.again, previous.reviews),
    activeDays: days.filter((d) => (byDate.get(d)?.reviews ?? 0) > 0).length,
    streak: currentStreak(byDate, today),
  }
}

/** One row per day with a reviews column per deck, for the stacked bar chart. */
export function dailyByDeck(data: AnkiData, range: RangeDays) {
  const rows = new Map<string, Record<string, number | string>>()
  for (const date of lastNDays(range, 0, ankiToday(data))) {
    const row: Record<string, number | string> = { date }
    for (const deck of data.decks) row[deck.id] = 0
    rows.set(date, row)
  }
  for (const s of data.daily) {
    const row = rows.get(s.date)
    if (row) row[s.deckId] = (row[s.deckId] as number) + s.reviews
  }
  return [...rows.values()]
}

export interface DeckSummary {
  deck: Deck
  reviews: number
  againRate: number
  avgPerDay: number
  minutes: number
}

export function deckSummaries(data: AnkiData, range: RangeDays): DeckSummary[] {
  const days = new Set(lastNDays(range, 0, ankiToday(data)))
  return data.decks.map((deck) => {
    const sum = { reviews: 0, again: 0, seconds: 0 }
    for (const s of data.daily) {
      if (s.deckId !== deck.id || !days.has(s.date)) continue
      sum.reviews += s.reviews
      sum.again += s.again
      sum.seconds += s.studySeconds
    }
    return {
      deck,
      reviews: sum.reviews,
      againRate: ratio(sum.again, sum.reviews),
      avgPerDay: sum.reviews / range,
      minutes: Math.round(sum.seconds / 60),
    }
  })
}

/** Again rate per deck over a trailing 7-day window, which smooths out noisy single days. */
export function rollingAgainRate(data: AnkiData, range: RangeDays, window = 7) {
  const days = lastNDays(range + window - 1, 0, ankiToday(data))
  const perDeck = new Map<string, Map<string, DayTotal>>()
  for (const deck of data.decks) {
    perDeck.set(deck.id, totalsByDate(data.daily.filter((s) => s.deckId === deck.id)))
  }
  return days.slice(window - 1).map((date, i) => {
    const windowDays = days.slice(i, i + window)
    const row: Record<string, number | string | null> = { date }
    for (const deck of data.decks) {
      const t = sumDays(perDeck.get(deck.id)!, windowDays)
      row[deck.id] = t.reviews > 0 ? t.again / t.reviews : null
    }
    return row
  })
}
