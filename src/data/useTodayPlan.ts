import { useEffect, useMemo } from 'react'
import type { AnkiData } from './types'
import { toDateKey } from '../lib/dates'
import { maxSustainableNewPerDay } from '../lib/insights'
import { measuredDefaults } from '../lib/measured'
import { defaultBudget, planSettings, standardSweep } from '../lib/plan'
import { buildSimDecks } from '../lib/simulator'
import { useSimulation } from './useSimulation'

export type TodayPlan =
  | { status: 'pending' }
  | { status: 'ready'; budget: number; max: { value: number; capped: boolean } | null }

// One simulation per copy of the collection, so coming back to Home doesn't run it again
const solved = new Map<string, Extract<TodayPlan, { status: 'ready' }>>()

/**
 * The Planner's answer to "how many new cards a day fit my usual time?", with the Planner's default settings.
 * Null when there's nothing to simulate (no FSRS data) or the simulation failed.
 */
export function useTodayPlan(data: AnkiData, today: Date): TodayPlan | null {
  const fsrs = data.fsrs?.enabled ? data.fsrs : undefined
  const todayKey = toDateKey(today)
  const measured = useMemo(() => measuredDefaults(data, today), [data, today])
  const decks = useMemo(() => (fsrs ? buildSimDecks(fsrs, todayKey) : []), [fsrs, todayKey])
  const budget = defaultBudget(measured)
  const seconds = Math.round(measured.secondsPerReview)
  // Only the scenarios are used, and they run at their own size, so the main run can be small
  const settings = { ...planSettings(decks.map((d) => d.deckId), measured.studyDaysPerWeek, (today.getDay() + 6) % 7), runs: 8 }
  const key = `${data.generatedAt}|${budget}|${seconds}|${JSON.stringify(settings)}`
  const known = solved.get(key)
  const { scenarios, scenariosSettled, error, unavailable } = useSimulation(decks, settings, !known)

  const fresh = useMemo(
    () =>
      scenariosSettled && scenarios?.newPerDay
        ? ({ status: 'ready', budget, max: maxSustainableNewPerDay(standardSweep(scenarios.newPerDay), budget, seconds) } as const)
        : null,
    [scenarios, scenariosSettled, budget, seconds],
  )
  useEffect(() => {
    if (fresh) solved.set(key, fresh)
  }, [key, fresh])

  if (known) return known
  if (unavailable || error) return null
  return fresh ?? { status: 'pending' }
}
