// Pure helpers for the GitHub-style activity grid.

import { parseDateKey, toDateKey } from './dates'

export interface HeatCell {
  date: string
  reviews: number
}

/** Either the 12 months up to today, or one calendar year. */
export type HeatmapView = 'last12' | number

/**
 * Columns of weeks (Mon -> Sun) covering the view. Days outside the view, or in the
 * future, are null so the grid keeps its shape without showing them.
 */
export function buildWeeks(reviewsByDate: Map<string, { reviews: number }>, view: HeatmapView, today: Date) {
  const todayStart = parseDateKey(toDateKey(today))
  let first: Date
  let last: Date
  if (view === 'last12') {
    last = todayStart
    first = new Date(last.getFullYear(), last.getMonth(), last.getDate() - 364)
  } else {
    first = new Date(view, 0, 1)
    const dec31 = new Date(view, 11, 31)
    last = dec31 < todayStart ? dec31 : todayStart
  }

  // Start on the Monday on or before the first day
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))

  const weeks: (HeatCell | null)[][] = []
  while (cursor <= last) {
    const week: (HeatCell | null)[] = []
    for (let i = 0; i < 7; i++) {
      const inView = cursor >= first && cursor <= last
      const key = toDateKey(cursor)
      week.push(inView ? { date: key, reviews: reviewsByDate.get(key)?.reviews ?? 0 } : null)
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** Quartile thresholds over active days, so the colour scale adapts to your own volume. */
export function thresholds(values: number[]): [number, number, number] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return [1, 1, 1]
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))]
  return [q(0.25), q(0.5), q(0.75)]
}

/** 0 = no reviews, 1-4 = quartile of the active days. */
export function level(reviews: number, t: [number, number, number]): number {
  if (reviews === 0) return 0
  if (reviews <= t[0]) return 1
  if (reviews <= t[1]) return 2
  if (reviews <= t[2]) return 3
  return 4
}

/** Running review total after each cell (oldest first), for the replay's ticking counter. */
export function runningTotals(cells: HeatCell[]): number[] {
  let n = 0
  return cells.map((c) => (n += c.reviews))
}

/**
 * Replay pacing: when (0-1 of the replay) each day appears. Days with reviews get a full beat, empty days
 * a tenth of one, so a sparse year doesn't spend the replay filling blank squares.
 */
export function replayStarts(cells: HeatCell[], emptyWeight = 0.1): number[] {
  const weights = cells.map((c) => (c.reviews > 0 ? 1 : emptyWeight))
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  let t = 0
  return weights.map((w) => {
    const start = t / sum
    t += w
    return start
  })
}

/** How many days are revealed at replay progress `p` (0-1). */
export function revealedAt(starts: number[], p: number): number {
  if (p >= 1) return starts.length
  let n = 0
  while (n < starts.length && starts[n] <= p) n++
  return n
}
