// Simulator defaults measured from your own reviews (pure, tested).

import type { AnkiData } from '../data/types'
import { lastNDays } from './stats'

export interface MeasuredDefaults {
  secondsPerReview: number
  studyDaysPerWeek: number
  minutesPerStudyDay: number
}

/**
 * - Seconds per review: the server's measurement (each answer capped at 60 s, last 180 days), weighted by
 *   answers across decks. Falls back to the daily totals only when FSRS data is missing.
 * - Study days per week and reviews per study day: the last 28 days.
 * - Minutes per study day = reviews per study day × seconds per review, the same conversion the forecast uses.
 */
export function measuredDefaults(data: AnkiData, today: Date): MeasuredDefaults {
  const days = new Set(lastNDays(28, 0, today))
  const recent = data.daily.filter((s) => days.has(s.date))
  const reviews = recent.reduce((n, s) => n + s.reviews, 0)
  const activeDays = new Set(recent.filter((s) => s.reviews > 0).map((s) => s.date)).size

  const behaviour = data.fsrs?.behaviour ?? []
  const answers = behaviour.reduce((n, b) => n + b.answers, 0)
  const fallback = reviews ? recent.reduce((n, s) => n + s.studySeconds, 0) / reviews : 12
  const secondsPerReview = answers ? behaviour.reduce((n, b) => n + b.secondsPerReview * b.answers, 0) / answers : fallback

  return {
    secondsPerReview,
    studyDaysPerWeek: Math.min(7, Math.max(1, Math.round(activeDays / 4))),
    minutesPerStudyDay: activeDays ? ((reviews / activeDays) * secondsPerReview) / 60 : 20,
  }
}
