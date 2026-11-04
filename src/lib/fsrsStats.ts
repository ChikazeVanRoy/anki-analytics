// Turns FSRS data from the API into dashboard metrics. Pure functions (tested).

import type { CalibrationBin, CalibrationPoint, FsrsCard, FsrsData, KnowledgePoint } from '../data/types'
import { dayNumber } from './dates'
import { DEFAULT_PARAMS, difficultyPercent, retrievability } from './fsrs'
import { gradingShift, type GradingShift } from './gradingShift'

export interface Bin {
  label: string
  from: number
  to: number
}

export const STABILITY_BINS: Bin[] = [
  { label: '< 1 day', from: 0, to: 1 },
  { label: '1–7 days', from: 1, to: 7 },
  { label: '1–3 weeks', from: 7, to: 21 },
  { label: '3 wk–3 mo', from: 21, to: 90 },
  { label: '3–12 months', from: 90, to: 365 },
  { label: '> 1 year', from: 365, to: Infinity },
]

export const DIFFICULTY_BINS: Bin[] = Array.from({ length: 10 }, (_, i) => ({
  label: `${i * 10}–${i * 10 + 10}%`,
  from: i / 10,
  to: i === 9 ? 1.0001 : (i + 1) / 10,
}))

export const RETRIEVABILITY_BINS: Bin[] = [
  { label: '< 70%', from: 0, to: 0.7 },
  { label: '70–80%', from: 0.7, to: 0.8 },
  { label: '80–85%', from: 0.8, to: 0.85 },
  { label: '85–90%', from: 0.85, to: 0.9 },
  { label: '90–95%', from: 0.9, to: 0.95 },
  { label: '95–100%', from: 0.95, to: 1.0001 },
]

/** "Elevated risk": predicted recall more than 5 points below the deck's desired retention. */
export const RISK_MARGIN = 0.05

export interface CardNow extends FsrsCard {
  elapsed: number // whole Anki days since the last review
  r: number // current retrievability
  desired: number
  overdue: boolean
  dueToday: boolean // due today or earlier: Anki will show it
}

/** The memory-model settings a card uses: its own preset, else its deck group's preset. */
export function presetOfCard(fsrs: FsrsData, c: FsrsCard): { params: number[]; desiredRetention: number; maxInterval: number } | undefined {
  return (c.preset !== undefined ? fsrs.cardPresets?.[c.preset] : undefined) ?? fsrs.presets.find((p) => p.deckId === c.deckId)
}

/** Current retrievability of each card, using its own preset's FSRS parameters and desired retention. */
export function cardsNow(fsrs: FsrsData, todayKey: string): CardNow[] {
  const today = dayNumber(todayKey)
  return fsrs.cards.map((c) => {
    const preset = presetOfCard(fsrs, c)
    const elapsed = Math.max(today - dayNumber(c.lastReview), 0)
    return {
      ...c,
      elapsed,
      r: retrievability(elapsed, c.stability, preset?.params ?? DEFAULT_PARAMS),
      desired: preset?.desiredRetention ?? 0.9,
      overdue: dayNumber(c.due) < today,
      dueToday: dayNumber(c.due) <= today,
    }
  })
}

/** Rows of { label, [deckId]: count } for grouped bar charts. */
export function histogram(cards: CardNow[], deckIds: string[], bins: Bin[], value: (c: CardNow) => number) {
  return bins.map((b) => {
    const row: Record<string, number | string> = { label: b.label }
    for (const id of deckIds) {
      row[id] = cards.filter((c) => c.deckId === id && value(c) >= b.from && value(c) < b.to).length
    }
    return row
  })
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface MemorySummary {
  deckId: string | 'all'
  cards: number
  avgRetrievability: number
  medianStability: number
  avgDifficulty: number // percent, as Anki shows it
  belowTarget: number // R < desired retention
  atRisk: number // R < desired retention - RISK_MARGIN
  overdue: number
  desired: number
}

export function memorySummary(cards: CardNow[], deckId: string | 'all'): MemorySummary {
  const cs = deckId === 'all' ? cards : cards.filter((c) => c.deckId === deckId)
  const n = cs.length || 1
  return {
    deckId,
    cards: cs.length,
    avgRetrievability: cs.reduce((a, c) => a + c.r, 0) / n,
    medianStability: median(cs.map((c) => c.stability)),
    avgDifficulty: cs.reduce((a, c) => a + difficultyPercent(c.difficulty), 0) / n,
    belowTarget: cs.filter((c) => c.r < c.desired).length,
    atRisk: cs.filter((c) => c.r < c.desired - RISK_MARGIN).length,
    overdue: cs.filter((c) => c.overdue).length,
    desired: cs.length ? cs.reduce((a, c) => a + c.desired, 0) / cs.length : 0.9,
  }
}

export interface RetentionComparison {
  deckId: string | 'all'
  reviews: number
  actual: number // pass rate of review-card reviews
  predicted: number // mean FSRS-predicted recall at those reviews
  young: { reviews: number; actual: number; predicted: number }
  mature: { reviews: number; actual: number; predicted: number }
}

const rate = (a: number, b: number) => (b > 0 ? a / b : 0)

/** Actual vs predicted retention over the replayed history (review cards only). */
export function retentionComparison(points: CalibrationPoint[], deckId: string | 'all'): RetentionComparison {
  const ps = deckId === 'all' ? points : points.filter((p) => p.deckId === deckId)
  const sum = (f: (p: CalibrationPoint) => number) => ps.reduce((a, p) => a + f(p), 0)
  const reviews = sum((p) => p.reviews)
  const mReviews = sum((p) => p.matureReviews)
  const yReviews = reviews - mReviews
  return {
    deckId,
    reviews,
    actual: rate(sum((p) => p.passed), reviews),
    predicted: rate(sum((p) => p.predicted), reviews),
    young: {
      reviews: yReviews,
      actual: rate(sum((p) => p.passed - p.maturePassed), yReviews),
      predicted: rate(sum((p) => p.predicted - p.maturePredicted), yReviews),
    },
    mature: {
      reviews: mReviews,
      actual: rate(sum((p) => p.maturePassed), mReviews),
      predicted: rate(sum((p) => p.maturePredicted), mReviews),
    },
  }
}

/** Below this many replayed reviews, a gap between actual and predicted says little. */
export const VERDICT_MIN_REVIEWS = 100
/** A gap this large (in rate, so 0.03 = 3 points) counts as a mis-fit. */
export const VERDICT_GAP = 0.03
/** Below this many lapses the verdict says the picture may still shift. */
export const VERDICT_FEW_LAPSES = 20

export type ParamsSource = 'default' | 'optimised' | 'mixed'

/** Whether the presets cards actually use have optimised FSRS parameters. A deck group can mix presets. */
export function paramsSourceOf(fsrs: FsrsData): ParamsSource {
  const used = fsrs.cardPresets?.length ? fsrs.cardPresets : fsrs.presets
  if (used.every((p) => p.paramsSource === 'default')) return 'default'
  return used.every((p) => p.paramsSource === 'optimised') ? 'optimised' : 'mixed'
}

export interface FsrsVerdict {
  /** `shifted`: your answers changed recently and too few have followed to judge FSRS on them alone. */
  kind: 'thin' | 'under' | 'over' | 'fits' | 'shifted'
  actual: number
  predicted: number
  reviews: number
  lapses: number
  params: ParamsSource
  /** The change the numbers above start from: with one, they only count the reviews since it. */
  shift: GradingShift | null
}

/**
 * One plain answer to "does FSRS fit me?", from replayed reviews: did you remember more or less than it expected?
 * A pooled rate would blend two grading habits, so after a change only the reviews since it count.
 */
export function fsrsVerdict(fsrs: FsrsData): FsrsVerdict {
  const shift = gradingShift(fsrs.calibrationDaily ?? [])
  const params = paramsSourceOf(fsrs)
  const span = shift?.after ?? {
    reviews: fsrs.calibration.reduce((n, p) => n + p.reviews, 0),
    passed: fsrs.calibration.reduce((n, p) => n + p.passed, 0),
    predicted: fsrs.calibration.reduce((n, p) => n + p.predicted, 0),
  }
  const { reviews } = span
  const actual = rate(span.passed, reviews)
  const predicted = rate(span.predicted, reviews)
  const gap = actual - predicted
  const kind =
    shift && !shift.settled ? 'shifted' : reviews < VERDICT_MIN_REVIEWS ? 'thin' : gap >= VERDICT_GAP ? 'under' : gap <= -VERDICT_GAP ? 'over' : 'fits'
  return { kind, actual, predicted, reviews, lapses: reviews - span.passed, params, shift }
}

/** Monthly actual vs predicted retention, all decks combined. */
export function monthlyTrend(points: CalibrationPoint[]) {
  const months = [...new Set(points.map((p) => p.month))].sort()
  return months.map((month) => {
    const ps = points.filter((p) => p.month === month)
    const reviews = ps.reduce((a, p) => a + p.reviews, 0)
    return {
      month,
      reviews,
      actual: rate(ps.reduce((a, p) => a + p.passed, 0), reviews),
      predicted: rate(ps.reduce((a, p) => a + p.predicted, 0), reviews),
    }
  })
}

/** Calibration curve: for each predicted-recall bin, how often you actually recalled. */
export function calibrationCurve(bins: CalibrationBin[]) {
  const edges = [...new Set(bins.map((b) => b.from))].sort((a, b) => a - b)
  return edges.map((from) => {
    const bs = bins.filter((b) => b.from === from)
    const reviews = bs.reduce((a, b) => a + b.reviews, 0)
    return {
      label: `${Math.round(from * 100)}–${Math.round(bs[0].to * 100)}%`,
      reviews,
      actual: rate(bs.reduce((a, b) => a + b.passed, 0), reviews),
      predicted: rate(bs.reduce((a, b) => a + b.predicted, 0), reviews),
    }
  })
}

/** Lapses vs review-card reviews for the given decks only (the evidence behind the lapse ratio). */
export function lapseEvidence(points: { deckId: string; reviews: number; passed: number }[], deckIds: string[]) {
  const ps = points.filter((p) => deckIds.includes(p.deckId))
  return {
    reviews: ps.reduce((n, p) => n + p.reviews, 0),
    lapses: ps.reduce((n, p) => n + p.reviews - p.passed, 0),
  }
}

/** The knowledge curve as chart rows, one per sampled day, and the latest totals. */
export function knowledgeCurve(points: KnowledgePoint[]) {
  const rows = new Map<string, Record<string, number | string>>()
  for (const p of points) {
    const row = rows.get(p.date) ?? rows.set(p.date, { date: p.date }).get(p.date)!
    row[p.deckId] = p.recalled
  }
  const last = points.at(-1)?.date
  const today = points.filter((p) => p.date === last)
  return {
    rows: [...rows.values()],
    recalled: today.reduce((n, p) => n + p.recalled, 0),
    started: today.reduce((n, p) => n + p.started, 0),
  }
}

/** Anki's Browser finds these cards from this search, so nothing here needs to write to Anki. */
export const ankiSearch = (ids: string[]) => `cid:${ids.join(',')}`
