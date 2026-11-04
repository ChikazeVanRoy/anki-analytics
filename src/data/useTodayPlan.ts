import { useEffect, useMemo } from 'react'
import type { AnkiData } from './types'
import { toDateKey } from '../lib/dates'
import { currentPace, finishAt } from '../lib/deckPace'
import { maxSustainableNewPerDay } from '../lib/insights'
import { measuredDefaults } from '../lib/measured'
import { defaultBudget, minutesAt, planSettings, standardSweep, type SweepPoint } from '../lib/plan'
import { buildSimDecks } from '../lib/simulator'
import { useSimulation } from './useSimulation'

export type TodayPlan =
  | { status: 'pending' }
  | {
      status: 'ready'
      budget: number
      max: { value: number; capped: boolean } | null
      /** The same limit with the other recall model, so the answer can show how far it depends on that choice. */
      altMax?: { value: number; capped: boolean } | null
      /** The new cards you've actually been starting, and the heaviest month they'd lead to (both recall models). */
      current?: { newPerDay: number; minutes: [number, number] } | null
      /** When the last new card would be started at the suggested limit. */
      finish?: string | null
    }

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
  const { scenarios, scenariosSettled, error, unavailable } = useSimulation(decks, settings, !known, { retention: false })

  const pace = useMemo(() => currentPace(data, today, measured.studyDaysPerWeek), [data, today, measured])
  const fresh = useMemo(() => {
    if (!scenariosSettled || !scenarios?.newPerDay) return null
    const sweep = standardSweep(scenarios.newPerDay)
    const alt = standardSweep(scenarios.otherRecall ?? [])
    const max = maxSustainableNewPerDay(sweep, budget, seconds)
    const remaining = decks.reduce((n, d) => n + d.newPool, 0)
    const loadAt = (s: SweepPoint[], v: number) => minutesAt(s, v, seconds)
    const newPerDay = pace ? Math.round(pace.perStudyDay) : null
    const minutes = newPerDay === null ? null : [loadAt(sweep, newPerDay), alt.length ? loadAt(alt, newPerDay) : loadAt(sweep, newPerDay)]
    return {
      status: 'ready',
      budget,
      max,
      altMax: alt.length ? maxSustainableNewPerDay(alt, budget, seconds) : undefined,
      current:
        newPerDay !== null && minutes?.[0] != null && minutes[1] != null
          ? { newPerDay, minutes: [Math.min(minutes[0], minutes[1]), Math.max(minutes[0], minutes[1])] as [number, number] }
          : null,
      finish: max && max.value > 0 ? finishAt(remaining, max.value, measured.studyDaysPerWeek, today) : null,
    } as const
  }, [scenarios, scenariosSettled, budget, seconds, decks, pace, measured, today])
  useEffect(() => {
    if (fresh) solved.set(key, fresh)
  }, [key, fresh])

  if (known) return known
  if (unavailable || error) return null
  return fresh ?? { status: 'pending' }
}
