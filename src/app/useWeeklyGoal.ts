import { useCallback, useState } from 'react'

const KEY = 'anki-analytics.weekly-goal'

/** The saved goal, if any. Storage can be unavailable (private mode, blocked site data). */
function load(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isInteger(v) && v >= 1 && v <= 7 ? v : null
  } catch {
    return null
  }
}

/** Study days a week to aim for: the owner's choice, or `measured` (their recent habit) until they make one. */
export function useWeeklyGoal(measured: number) {
  const [saved, setSaved] = useState(load)
  const goal = saved ?? measured
  const change = useCallback(
    (by: number) => {
      const next = Math.min(7, Math.max(1, goal + by))
      setSaved(next)
      try {
        localStorage.setItem(KEY, String(next))
      } catch {
        // Not saved: the goal still applies until the page reloads
      }
    },
    [goal],
  )
  return { goal, change }
}
