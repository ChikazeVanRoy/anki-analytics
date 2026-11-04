// Finds the day your answers changed, so old and new grading habits aren't pooled into one number (pure, tested).
// Works on replayed reviews and compares lapses with what FSRS expected on each side of a candidate day, so
// longer intervals, which lapse more by design, don't look like a change of habit.

import type { AnkiData, CalibrationDay, FsrsData } from '../data/types'

export interface GradingSpan {
  reviews: number
  passed: number
  predicted: number
}

export interface GradingShift {
  date: string // first Anki day of the new pattern
  before: GradingSpan
  after: GradingSpan
  /** Enough reviews since the change to judge FSRS on them alone. */
  settled: boolean
}

/** Each side needs this many reviews, or a single odd day could count as a change. */
export const SHIFT_MIN_SIDE = 50
/**
 * Log-likelihood ratio a split must reach. Far above the usual 3.84, because the best of many possible days is
 * tested, and a false alarm would throw away real history.
 */
export const SHIFT_MIN_EVIDENCE = 20
/** The lapse rate, relative to FSRS's expectation, must differ by at least this factor. */
export const SHIFT_MIN_FACTOR = 3
/** Reviews since a change before the verdict is given on them alone. */
export const SHIFT_SETTLED_REVIEWS = 400

const add = (a: GradingSpan, b: GradingSpan): GradingSpan => ({
  reviews: a.reviews + b.reviews,
  passed: a.passed + b.passed,
  predicted: a.predicted + b.predicted,
})
const ZERO: GradingSpan = { reviews: 0, passed: 0, predicted: 0 }
const sum = (xs: GradingSpan[]) => xs.reduce(add, ZERO)

const lapses = (s: GradingSpan) => s.reviews - s.passed
const expected = (s: GradingSpan) => s.reviews - s.predicted

export const forgotRate = (s: GradingSpan) => (s.reviews > 0 ? lapses(s) / s.reviews : 0)

/** Combined days, oldest first. */
function byDay(days: CalibrationDay[]) {
  const map = new Map<string, GradingSpan>()
  for (const d of days) map.set(d.date, add(map.get(d.date) ?? ZERO, d))
  return [...map].sort(([a], [b]) => a.localeCompare(b))
}

/** Poisson likelihood ratio: are two sides better described by their own lapse rates than by one shared rate? */
function evidence(a: GradingSpan, b: GradingSpan) {
  const shared = (lapses(a) + lapses(b)) / (expected(a) + expected(b))
  const side = (s: GradingSpan) => (lapses(s) > 0 ? lapses(s) * Math.log(lapses(s) / expected(s) / shared) : 0)
  return 2 * (side(a) + side(b))
}

function bestSplit(rows: [string, GradingSpan][]) {
  let best: { index: number; score: number } | null = null
  const total = sum(rows.map(([, s]) => s))
  let a = ZERO
  for (let i = 1; i < rows.length; i++) {
    a = add(a, rows[i - 1][1])
    const b = { reviews: total.reviews - a.reviews, passed: total.passed - a.passed, predicted: total.predicted - a.predicted }
    if (a.reviews < SHIFT_MIN_SIDE || b.reviews < SHIFT_MIN_SIDE || expected(a) <= 0 || expected(b) <= 0) continue
    // Half a lapse keeps a side with no lapses at all from counting as an infinite change
    const factor = ((lapses(a) + 0.5) / expected(a)) / ((lapses(b) + 0.5) / expected(b))
    if (Math.max(factor, 1 / factor) < SHIFT_MIN_FACTOR) continue
    const score = evidence(a, b)
    if (score >= SHIFT_MIN_EVIDENCE && (!best || score > best.score)) best = { index: i, score }
  }
  return best
}

/** The latest clear change in your lapse rate, or null if your answers look consistent. */
export function gradingShift(days: CalibrationDay[]): GradingShift | null {
  let rows = byDay(days)
  let found: GradingShift | null = null
  for (let split = bestSplit(rows); split; split = bestSplit(rows)) {
    const before = sum(rows.slice(0, split.index).map(([, s]) => s))
    rows = rows.slice(split.index)
    const after = sum(rows.map(([, s]) => s))
    found = { date: rows[0][0], before, after, settled: after.reviews >= SHIFT_SETTLED_REVIEWS }
  }
  return found
}

/** The reviews lapse rates should be measured from: all of them, or only those since a grading change. */
export function lapseBasis(fsrs: FsrsData): { deckId: string; reviews: number; passed: number; predicted: number }[] {
  const shift = gradingShift(fsrs.calibrationDaily ?? [])
  return shift ? fsrs.calibrationDaily!.filter((d) => d.date >= shift.date) : fsrs.calibration
}

/** A change inside a period that starts on `firstDay`, so a rate over that period can say it mixes two habits. */
export function shiftWithin(data: AnkiData, firstDay: string): { date: string; rate: number; reviews: number } | null {
  const shift = gradingShift(data.fsrs?.calibrationDaily ?? [])
  if (!shift || shift.date <= firstDay) return null
  return { date: shift.date, rate: shift.after.reviews ? shift.after.passed / shift.after.reviews : 0, reviews: shift.after.reviews }
}
