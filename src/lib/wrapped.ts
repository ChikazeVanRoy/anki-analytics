// A month in review, from the daily totals (pure, tested). Only what the data shows: there's no record of when
// a card was first studied per month, so there are no monthly new-card counts.

import type { AnkiData } from '../data/types'
import { dayNumber } from './dates'

export interface Wrapped {
  month: string // YYYY-MM
  reviews: number
  minutes: number
  days: number
  bestRun: number
  busiest: { date: string; reviews: number }
  /** The deck with the most reviews, when there's more than one to compare. */
  topDeck: { deckId: string; reviews: number } | null
  /** Change in reviews from the month before. Null if it had none, or this month isn't over: part of a month against a whole one says nothing. */
  change: number | null
}

/** Months with reviews, newest first. */
export function wrappedMonths(data: AnkiData): string[] {
  return [...new Set(data.daily.filter((s) => s.reviews > 0).map((s) => s.date.slice(0, 7)))].sort().reverse()
}

const previousMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** The month to open on: the latest finished one, or this month if it's the only one with reviews. */
export const defaultMonth = (months: string[], todayKey: string) => months.find((m) => m < todayKey.slice(0, 7)) ?? months[0]

export function monthWrapped(data: AnkiData, month: string, todayKey: string): Wrapped | null {
  const rows = data.daily.filter((s) => s.date.startsWith(month) && s.reviews > 0)
  if (!rows.length) return null
  const byDay = new Map<string, number>()
  const byDeck = new Map<string, number>()
  for (const s of rows) {
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.reviews)
    byDeck.set(s.deckId, (byDeck.get(s.deckId) ?? 0) + s.reviews)
  }
  const days = [...byDay.keys()].sort()
  let run = 0
  let bestRun = 0
  days.forEach((d, i) => {
    run = i > 0 && dayNumber(d) === dayNumber(days[i - 1]) + 1 ? run + 1 : 1
    bestRun = Math.max(bestRun, run)
  })
  const [date, most] = [...byDay].reduce((a, b) => (b[1] > a[1] ? b : a))
  const [deckId, deckReviews] = [...byDeck].reduce((a, b) => (b[1] > a[1] ? b : a))
  const reviews = rows.reduce((n, s) => n + s.reviews, 0)
  const before = data.daily.filter((s) => s.date.startsWith(previousMonth(month))).reduce((n, s) => n + s.reviews, 0)
  return {
    month,
    reviews,
    minutes: rows.reduce((n, s) => n + s.studySeconds, 0) / 60,
    days: days.length,
    bestRun,
    busiest: { date, reviews: most },
    topDeck: byDeck.size > 1 ? { deckId, reviews: deckReviews } : null,
    change: before > 0 && month < todayKey.slice(0, 7) ? reviews / before - 1 : null,
  }
}
