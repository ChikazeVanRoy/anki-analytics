// What the Planner assumes before you touch anything, and how a time budget turns into a new-card limit.
// Home and the Planner share this, so the two answer the same question with the same numbers (pure, tested).

import { maxSustainableNewPerDay } from './insights'
import type { MeasuredDefaults } from './measured'
import type { HorizonSummary, SimSettings } from './simulator'

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
