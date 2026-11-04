// What the Planner assumes before you touch anything, and how a time budget turns into a new-card limit.
// Home and the Planner share this, so the two answer the same question with the same numbers (pure, tested).

import { dayNumber } from './dates'
import { maxSustainableNewPerDay } from './insights'
import type { MeasuredDefaults } from './measured'
import { splitNew, type HorizonSummary, type SimSettings } from './simulator'

/** The new-cards-per-day values every scenario sweep simulates. */
export const SCENARIO_NEW_PER_DAY = [0, 10, 20, 30, 40, 50, 60]

/** Default daily time budget: the measured minutes per study day, rounded up to 5. */
export const defaultBudget = (m: MeasuredDefaults) => Math.max(10, Math.ceil(m.minutesPerStudyDay / 5) * 5)

export const planSettings = (deckIds: string[], studyDaysPerWeek: number, startWeekday: number): SimSettings => ({
  deckIds,
  newPerDay: 30,
  studyDaysPerWeek,
  runs: 24,
  seed: 20261103,
  recall: 'fsrs',
  startWeekday,
})

export type SweepPoint = { value: number; year: HorizonSummary }

/**
 * Year-long results of the standard scenarios. The sweep also holds whatever value is selected right now;
 * leaving it out means an answer can't shift just because that selection changed.
 */
export const standardSweep = (scenarios: { value: number; byHorizon: Record<number, HorizonSummary> }[]): SweepPoint[] =>
  scenarios.filter((s) => SCENARIO_NEW_PER_DAY.includes(s.value)).map((s) => ({ value: s.value, year: s.byHorizon[365] }))

export const PLAN_PRESETS = [
  { key: 'relaxed', budgetShare: 0.6 },
  { key: 'steady', budgetShare: 1 },
  { key: 'push', budgetShare: 1.5 },
] as const
export type PlanPresetKey = (typeof PLAN_PRESETS)[number]['key']

export interface PlanPreset {
  key: PlanPresetKey
  newPerDay: number
  /** The minutes per study day this preset aims for. */
  minutes: number
  /** False when existing reviews alone take longer, so even no new cards won't fit. */
  fits: boolean
}

/** Each preset is the most new cards a day whose heaviest month fits a share of the time budget. */
export function planPresets(sweep: SweepPoint[], budgetMinutes: number, secondsPerReview: number): PlanPreset[] {
  return PLAN_PRESETS.map(({ key, budgetShare }) => {
    const minutes = Math.round(budgetMinutes * budgetShare)
    const max = maxSustainableNewPerDay(sweep, minutes, secondsPerReview)
    return { key, minutes, newPerDay: max?.value ?? 0, fits: max !== null }
  })
}

/**
 * Minutes per study day in the heaviest month at any new-card limit, read off the scenarios: exact at a simulated
 * value, on the straight line between two otherwise, and carried on from the last two beyond them.
 */
export function minutesAt(sweep: SweepPoint[], newPerDay: number, secondsPerReview: number): number | null {
  const pts = [...sweep].sort((a, b) => a.value - b.value)
  if (!pts.length) return null
  const load = (p: SweepPoint) => (p.year.maxWindowPerStudyDay * secondsPerReview) / 60
  if (pts.length === 1) return load(pts[0])
  const above = pts.findIndex((p) => p.value >= newPerDay)
  const upper = above < 0 ? pts.length - 1 : Math.max(above, 1)
  const [a, b] = [pts[upper - 1], pts[upper]]
  return Math.max(0, load(a) + ((load(b) - load(a)) * (newPerDay - a.value)) / (b.value - a.value))
}

/** Whether a new-card limit ends the year with reviews held back by a daily limit: no minutes figure can show that. */
export const pilesUpAt = (sweep: SweepPoint[], newPerDay: number) => sweep.some((p) => p.value <= newPerDay && p.year.backlogEnd > 1)

type Limit = { value: number } | null | undefined

/**
 * The new-card limit across both recall models, lowest first, or null when they agree. A model with no limit at
 * all (even no new cards won't fit) counts as 0, as that's when the answer is least certain.
 */
export function limitRange(max: Limit, altMax: Limit): [number, number] | null {
  if (!max || altMax === undefined) return null
  const [low, high] = [max.value, altMax?.value ?? 0].sort((a, b) => a - b)
  return low === high ? null : [low, high]
}

export interface DeckLimit {
  deckId: string
  /** What to enter as New cards/day in Anki for this deck. */
  newPerDay: number
  /** The limit it has now. */
  current: number
}

/** A total pace as per-deck Anki limits, split the way the simulator splits it. */
export function deckLimits(total: number, decks: { deckId: string; pool: number; current: number }[]): DeckLimit[] {
  const split = splitNew(total, decks.map((d) => d.pool))
  return decks.map((d, i) => ({ deckId: d.deckId, newPerDay: split[i], current: d.current }))
}

export type GoalPlan =
  | { kind: 'reached' } // already there
  | { kind: 'too-many'; available: number } // more than the decks have left
  | { kind: 'date-passed' }
  | { kind: 'ok'; perStudyDay: number; cardsToGo: number }

/** New cards per study day to have `target` cards started by `date`. */
export function goalPlan(
  { target, started, available, date, today, studyDaysPerWeek }: { target: number; started: number; available: number; date: string; today: string; studyDaysPerWeek: number },
): GoalPlan {
  const cardsToGo = target - started
  if (cardsToGo <= 0) return { kind: 'reached' }
  if (cardsToGo > available) return { kind: 'too-many', available }
  const days = dayNumber(date) - dayNumber(today)
  if (days <= 0) return { kind: 'date-passed' }
  return { kind: 'ok', cardsToGo, perStudyDay: Math.ceil(cardsToGo / ((days * studyDaysPerWeek) / 7)) }
}
