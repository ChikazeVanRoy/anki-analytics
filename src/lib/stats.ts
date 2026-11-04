// Pure functions that turn raw daily stats into what the UI shows.
// No React here, so they are easy to test and reuse.

import type { AnkiData, DailyDeckStat, Deck } from '../data/types'
import { parseDateKey, toDateKey } from './dates'

export { parseDateKey, toDateKey } from './dates'

export const RANGE_OPTIONS = [
  { key: '7d', label: '7d', description: 'last 7 days', days: 7 },
  { key: '30d', label: '30d', description: 'last 30 days', days: 30 },
  { key: '90d', label: '90d', description: 'last 90 days', days: 90 },
  { key: '1y', label: '1y', description: 'last year', days: 365 },
  { key: 'all', label: 'All', description: 'all time', days: null },
] as const
export type RangeKey = (typeof RANGE_OPTIONS)[number]['key']

/** How chart points are grouped: daily up to 90 days, weekly up to a year, monthly beyond. */
export type Bucket = 'day' | 'week' | 'month'
export const bucketFor = (days: number): Bucket => (days <= 90 ? 'day' : days <= 366 ? 'week' : 'month')

export interface DayTotal {
  reviews: number
  again: number
  seconds: number
}

const DAY_MS = 86_400_000

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

/** Number of days a range covers. "All time" runs from the first review to today. */
export function rangeDays(data: AnkiData, key: RangeKey): number {
  const option = RANGE_OPTIONS.find((o) => o.key === key)!
  if (option.days !== null) return option.days
  if (data.daily.length === 0) return 30
  const first = data.daily.reduce((min, s) => (s.date < min ? s.date : min), data.daily[0].date)
  const today = parseDateKey(toDateKey(ankiToday(data)))
  // Math.round absorbs the 1-hour difference across daylight-saving changes
  return Math.round((today.getTime() - parseDateKey(first).getTime()) / DAY_MS) + 1
}

export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

export function totalsByDate(daily: DailyDeckStat[]): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>()
  for (const s of daily) {
    const t = map.get(s.date) ?? { reviews: 0, again: 0, seconds: 0 }
    t.reviews += s.reviews
    t.again += s.again
    t.seconds += s.studySeconds
    map.set(s.date, t)
  }
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

export interface Retention {
  reviewCards: { reviews: number; passed: number; hard: number; rate: number }
  mature: { reviews: number; passed: number; rate: number }
}

function retentionOf(stats: DailyDeckStat[]): Retention {
  let rc = 0
  let rcPassed = 0
  let rcHard = 0
  let m = 0
  let mPassed = 0
  for (const s of stats) {
    rc += s.reviewCardReviews
    rcPassed += s.reviewCardPassed
    rcHard += s.reviewCardHard
    m += s.matureReviews
    mPassed += s.maturePassed
  }
  return {
    reviewCards: { reviews: rc, passed: rcPassed, hard: rcHard, rate: ratio(rcPassed, rc) },
    mature: { reviews: m, passed: mPassed, rate: ratio(mPassed, m) },
  }
}

/**
 * Splits graduated-card retention into young (previous interval under 21 days) and mature cards.
 * `matureThin` is true when too few mature reviews exist for the overall rate to say anything about
 * long-term memory: it is then almost entirely young cards, which are easier to recall.
 */
export function retentionSplit(r: Retention) {
  const youngReviews = r.reviewCards.reviews - r.mature.reviews
  const youngPassed = r.reviewCards.passed - r.mature.passed
  return {
    young: { reviews: youngReviews, rate: ratio(youngPassed, youngReviews) },
    mature: r.mature,
    matureThin: r.reviewCards.reviews > 0 && r.mature.reviews < MIN_MATURE_SAMPLE,
  }
}

export function summarize(data: AnkiData, days: number) {
  const today = ankiToday(data)
  const byDate = totalsByDate(data.daily)
  const range = lastNDays(days, 0, today)
  const inRange = new Set(range)
  const current = sumDays(byDate, range)
  const previous = sumDays(byDate, lastNDays(days, days, today))

  return {
    totalCards: data.decks.reduce((n, d) => n + d.totalCards, 0),
    reviewsToday: byDate.get(range[range.length - 1])?.reviews ?? 0,
    avgPerDay: current.reviews / days,
    prevAvgPerDay: previous.reviews / days,
    hasPrevious: previous.reviews > 0,
    againRate: ratio(current.again, current.reviews),
    prevAgainRate: ratio(previous.again, previous.reviews),
    activeDays: range.filter((d) => (byDate.get(d)?.reviews ?? 0) > 0).length,
    retention: retentionOf(data.daily.filter((s) => inRange.has(s.date))),
  }
}

/** Start of the bucket a date belongs to: itself, its week's Monday, or the 1st of its month. */
export function bucketStart(dateKey: string, bucket: Bucket): string {
  if (bucket === 'day') return dateKey
  if (bucket === 'month') return `${dateKey.slice(0, 7)}-01`
  const d = parseDateKey(dateKey)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday
  return toDateKey(d)
}

/** Ordered, empty buckets covering the last `days` days (so gaps show as zero, not missing). */
function emptyBuckets(data: AnkiData, days: number, bucket: Bucket) {
  const keys = new Set<string>()
  for (const d of lastNDays(days, 0, ankiToday(data))) keys.add(bucketStart(d, bucket))
  return keys
}

/** Reviews per deck for each day/week/month in the range, for the stacked bar chart. */
export function reviewsByPeriod(data: AnkiData, days: number) {
  const bucket = bucketFor(days)
  const firstDay = lastNDays(days, 0, ankiToday(data))[0]
  const rows = new Map<string, Record<string, number | string>>()
  for (const key of emptyBuckets(data, days, bucket)) {
    const row: Record<string, number | string> = { date: key }
    for (const deck of data.decks) row[deck.id] = 0
    rows.set(key, row)
  }
  for (const s of data.daily) {
    if (s.date < firstDay) continue
    const row = rows.get(bucketStart(s.date, bucket))
    if (row && s.deckId in row) row[s.deckId] = (row[s.deckId] as number) + s.reviews
  }
  return [...rows.values()]
}

export interface DeckSummary {
  deck: Deck
  reviews: number
  againRate: number
  avgPerDay: number
  minutes: number
  retention: Retention
}

export function deckSummaries(data: AnkiData, days: number): DeckSummary[] {
  const inRange = new Set(lastNDays(days, 0, ankiToday(data)))
  return data.decks.map((deck) => {
    const stats = data.daily.filter((s) => s.deckId === deck.id && inRange.has(s.date))
    const reviews = stats.reduce((n, s) => n + s.reviews, 0)
    const again = stats.reduce((n, s) => n + s.again, 0)
    const seconds = stats.reduce((n, s) => n + s.studySeconds, 0)
    return {
      deck,
      reviews,
      againRate: ratio(again, reviews),
      avgPerDay: reviews / days,
      minutes: Math.round(seconds / 60),
      retention: retentionOf(stats),
    }
  })
}

/** Fewer reviews than this in a window/bucket gives a meaningless rate (e.g. 1 review = 0% or 100%). */
export const MIN_RATE_SAMPLE = 10

/** Below this many mature reviews in a window, the overall Remembered rate is really a young-card rate. */
export const MIN_MATURE_SAMPLE = 30

const rateOrGap = (t: DayTotal) => (t.reviews >= MIN_RATE_SAMPLE ? t.again / t.reviews : null)

/**
 * Again rate per deck over time. Daily ranges use a trailing 7-day window (single days are noisy);
 * weekly/monthly ranges use each bucket's own rate. Too few reviews gives null, drawn as a gap.
 */
export function againRateSeries(data: AnkiData, days: number, window = 7) {
  const bucket = bucketFor(days)
  const perDeck = new Map(
    data.decks.map((d) => [d.id, totalsByDate(data.daily.filter((s) => s.deckId === d.id))] as const),
  )

  if (bucket === 'day') {
    const keys = lastNDays(days + window - 1, 0, ankiToday(data))
    return keys.slice(window - 1).map((date, i) => {
      const row: Record<string, number | string | null> = { date }
      for (const deck of data.decks) {
        row[deck.id] = rateOrGap(sumDays(perDeck.get(deck.id)!, keys.slice(i, i + window)))
      }
      return row
    })
  }

  const rangeKeys = lastNDays(days, 0, ankiToday(data))
  const byBucket = new Map<string, string[]>()
  for (const d of rangeKeys) {
    const key = bucketStart(d, bucket)
    byBucket.set(key, [...(byBucket.get(key) ?? []), d])
  }
  return [...byBucket].map(([date, bucketDays]) => {
    const row: Record<string, number | string | null> = { date }
    for (const deck of data.decks) {
      row[deck.id] = rateOrGap(sumDays(perDeck.get(deck.id)!, bucketDays))
    }
    return row
  })
}

/** Years (newest first) that have at least one review, for the heatmap's year picker. */
export function activeYears(data: AnkiData): number[] {
  const years = new Set(data.daily.filter((s) => s.reviews > 0).map((s) => Number(s.date.slice(0, 4))))
  return [...years].sort((a, b) => b - a)
}
