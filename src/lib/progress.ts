// Home-page progress: streaks, week-on-week change, milestones and one plain-language insight.
// Pure functions over measured data only (tested). Nothing here is estimated or invented: a milestone is
// shown as reached only when the review log or card counts show it.

import type { AnkiData } from '../data/types'
import { ankiDayKey, dayNumber, toDateKey } from './dates'
import { formatInt, formatPct, formatRate } from './format'
import { shiftWithin } from './gradingShift'
import { deckSummaries, lastNDays, MIN_RATE_SAMPLE, ratio, retentionSplit, type DayTotal } from './stats'

const studied = (byDate: Map<string, DayTotal>, key: string) => (byDate.get(key)?.reviews ?? 0) > 0

/** Longest run of consecutive days with at least one review, across the whole history. */
export function longestStreak(byDate: Map<string, DayTotal>): number {
  const days = [...byDate]
    .filter(([, t]) => t.reviews > 0)
    .map(([d]) => dayNumber(d))
    .sort((a, b) => a - b)
  let best = 0
  let run = 0
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

const reviewsOn = (byDate: Map<string, DayTotal>, keys: string[]) =>
  keys.reduce((n, k) => n + (byDate.get(k)?.reviews ?? 0), 0)

export interface WeekComparison {
  thisWeek: number // reviews in the last 7 days, today included
  lastWeek: number // the 7 days before that
  /** Relative change, or null when the previous week had no reviews (no meaningful comparison). */
  change: number | null
}

export function weekComparison(byDate: Map<string, DayTotal>, today: Date): WeekComparison {
  const thisWeek = reviewsOn(byDate, lastNDays(7, 0, today))
  const lastWeek = reviewsOn(byDate, lastNDays(7, 7, today))
  return { thisWeek, lastWeek, change: lastWeek > 0 ? thisWeek / lastWeek - 1 : null }
}

/** Reviews per day for the last `n` days, oldest first, for the Home activity strip. */
export function recentDays(byDate: Map<string, DayTotal>, today: Date, n = 14) {
  return lastNDays(n, 0, today).map((date) => ({
    date,
    reviews: byDate.get(date)?.reviews ?? 0,
    minutes: (byDate.get(date)?.seconds ?? 0) / 60,
  }))
}

// ---------- Milestones ----------

export type MilestoneKind = 'reviews' | 'days' | 'known'

/** Thresholds per kind. Steady, cumulative achievements only: nothing rewards a single heavy day. */
export const MILESTONES: Record<MilestoneKind, number[]> = {
  reviews: [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000],
  days: [7, 30, 60, 100, 180, 365, 500, 1_000],
  known: [10, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
}

export interface MilestoneTrack {
  kind: MilestoneKind
  current: number
  reached: number | null // highest threshold reached
  next: number | null // next threshold, null when all are reached
  /** 0-1 progress from the last reached threshold (or 0) to the next. */
  progress: number
}

export function milestoneTrack(kind: MilestoneKind, current: number): MilestoneTrack {
  const steps = MILESTONES[kind]
  const reached = [...steps].reverse().find((s) => current >= s) ?? null
  const next = steps.find((s) => current < s) ?? null
  const from = reached ?? 0
  return {
    kind,
    current,
    reached,
    next,
    progress: next === null ? 1 : Math.min(1, Math.max(0, (current - from) / (next - from))),
  }
}

export function milestones(data: AnkiData, byDate: Map<string, DayTotal>): MilestoneTrack[] {
  const totalReviews = data.daily.reduce((n, s) => n + s.reviews, 0)
  // A long interval alone hasn't been tested, so with real data only cards that passed a review at it count
  const proven = data.fsrs?.proven
  const known = proven ? Object.values(proven).reduce((a, b) => a + b, 0) : data.decks.reduce((n, d) => n + d.matureCards, 0)
  return [
    milestoneTrack('reviews', totalReviews),
    milestoneTrack('days', [...byDate.keys()].filter((k) => studied(byDate, k)).length),
    milestoneTrack('known', known),
  ]
}

// ---------- Status and greeting ----------

export type DayStatus = 'empty' | 'stale' | 'done' | 'keep' | 'start'

/**
 * What to say at the top of Home: reviewed today, a streak to continue, a fresh start, or no data yet. A copy
 * from an earlier day can't say what's happened since, so `stale` comes before anything about today.
 */
export function dayStatus(hasAnyReviews: boolean, reviewsToday: number, streak: number, stale = false): DayStatus {
  if (!hasAnyReviews) return 'empty'
  if (stale) return 'stale'
  if (reviewsToday > 0) return 'done'
  return streak > 0 ? 'keep' : 'start'
}

/** Greeting by local clock hour. */
export function greetingPart(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

export type TodayWork =
  | {
      stale: false
      cards: number // reviews Anki will show today: unburied cards due or overdue, within the daily review limit
      heldBack: number // cards due beyond the review limit, left for another day
      newCards: number // new cards left today, within the daily limits
      /**
       * Estimate of everything above: answers × each deck's measured seconds per answer, where a new card takes
       * its deck's measured answers on the first day.
       */
      minutes: number
    }
  /** The copy is from an earlier Anki day, so its due dates can't say what's left today. */
  | { stale: true }

/** The copy was made on an earlier Anki day, so its due dates can't say what's left today. */
export function copiedOnEarlierDay(data: AnkiData, today: Date) {
  const copied = Date.parse(data.generatedAt)
  return !Number.isFinite(copied) || ankiDayKey(copied, data.dayStartHour) < toDateKey(today)
}

/** The Anki day real data was copied, when that's before `today`. Null for sample data, a current copy or an unreadable date. */
export function staleCopyKey(data: AnkiData, today: Date): string | null {
  if (data.source !== 'anki' || !copiedOnEarlierDay(data, today)) return null
  const copied = Date.parse(data.generatedAt)
  return Number.isFinite(copied) ? ankiDayKey(copied, data.dayStartHour) : null
}

/**
 * What's left today, from FSRS card data, following Anki's limits per deck group. Reviews come first; unless
 * Anki's "New cards ignore review limit" is on, new cards count towards the review limit and get what's left of it.
 * Limits are the preset most of a group's cards use, so a group of decks with different limits is approximate.
 * `seconds` is the pace for a deck with none measured. Null without real FSRS data (mock data has none).
 */
export function todayWork(data: AnkiData, today: Date, seconds: number): TodayWork | null {
  if (!data.fsrs?.enabled) return null
  if (copiedOnEarlierDay(data, today)) return { stale: true }
  const day = dayNumber(toDateKey(today))
  const { fsrs } = data
  // Cards in same-day learning steps aren't held back by the review limit; day-long steps count as reviews
  const due = new Map<string, { reviews: number; learning: number }>()
  for (const c of fsrs.cards) {
    if (c.buried || dayNumber(c.due) > day) continue
    const counts = due.get(c.deckId) ?? { reviews: 0, learning: 0 }
    counts[c.state === 'review' || c.interday ? 'reviews' : 'learning']++
    due.set(c.deckId, counts)
  }
  const pace = (deckId: string) => fsrs.behaviour.find((b) => b.deckId === deckId)?.secondsPerReview || seconds
  const work = { cards: 0, heldBack: 0, newCards: 0, seconds: 0 }
  for (const [deckId, { reviews, learning }] of due) {
    if (fsrs.presets.some((p) => p.deckId === deckId)) continue
    work.cards += reviews + learning // no preset read for this group, so no limit to apply
    work.seconds += (reviews + learning) * pace(deckId)
  }
  for (const p of fsrs.presets) {
    const started = fsrs.newToday?.[p.deckId] ?? 0
    const ignoreLimit = !!fsrs.newCardsIgnoreReviewLimit
    const reviewRoom = Math.max(0, p.reviewsPerDay - (fsrs.reviewsToday?.[p.deckId] ?? 0) - (ignoreLimit ? 0 : started))
    const { reviews, learning } = due.get(p.deckId) ?? { reviews: 0, learning: 0 }
    const shown = Math.min(reviews, reviewRoom)
    const available = Math.max(0, (fsrs.newCards[p.deckId] ?? 0) - (fsrs.buriedNew?.[p.deckId] ?? 0))
    const newLeft = Math.min(Math.max(0, p.newPerDay - started), available, ignoreLimit ? Infinity : reviewRoom - shown)
    const firstDayAnswers = Math.max(1, fsrs.behaviour.find((b) => b.deckId === p.deckId)?.learningReviewsPerNewCard ?? 1)
    work.cards += shown + learning
    work.heldBack += reviews - shown
    work.newCards += newLeft
    work.seconds += (shown + learning + newLeft * firstDayAnswers) * pace(p.deckId)
  }
  return { stale: false, cards: work.cards, heldBack: work.heldBack, newCards: work.newCards, minutes: work.seconds / 60 }
}

// ---------- One insight ----------

export interface HomeInsight {
  text: string
  tone: 'good' | 'neutral'
  /** Which section has the detail behind the insight. */
  link: 'activity'
}

const fmt = formatInt
const pct = formatRate

/**
 * A single sentence from measured data, in priority order: a clear change in weekly volume, the
 * strongest deck this month (with enough reviews to mean something), then consistency.
 * Never shames: a quieter week is described neutrally.
 */
export function homeInsight(data: AnkiData, byDate: Map<string, DayTotal>, today: Date): HomeInsight | null {
  if (!data.daily.some((s) => s.reviews > 0)) return null
  const week = weekComparison(byDate, today)
  if (week.change !== null && week.lastWeek >= 20) {
    if (week.change >= 0.15) {
      return {
        text: `You reviewed ${formatPct(week.change, 0)} more in the last 7 days than the 7 before (${fmt(week.thisWeek)} vs ${fmt(week.lastWeek)}). Great momentum.`,
        tone: 'good',
        link: 'activity',
      }
    }
    if (week.change <= -0.3) {
      return {
        text: `A lighter week: ${fmt(week.thisWeek)} reviews vs ${fmt(week.lastWeek)} the week before. Short, regular sessions keep cards fresh.`,
        tone: 'neutral',
        link: 'activity',
      }
    }
  }

  // A month that mixes two grading habits can't rank decks, as each deck's rate depends on how much it has of each
  const mixed = !!shiftWithin(data, lastNDays(30, 0, today)[0])
  const decks = (mixed ? [] : deckSummaries(data, 30, today)).filter(
    // A deck of mostly young cards recalls easily, so ranking it "strongest" would mislead
    (d) => d.retention.reviewCards.reviews >= MIN_RATE_SAMPLE * 3 && !retentionSplit(d.retention).matureThin,
  )
  if (decks.length >= 2) {
    const best = [...decks].sort((a, b) => b.retention.reviewCards.rate - a.retention.reviewCards.rate)[0]
    return {
      text: `Your strongest deck this month is ${best.deck.name}: you remembered ${pct(best.retention.reviewCards.rate)} of ${fmt(best.retention.reviewCards.reviews)} scheduled reviews.`,
      tone: 'good',
      link: 'activity',
    }
  }

  const last30 = lastNDays(30, 0, today)
  const active = last30.filter((d) => (byDate.get(d)?.reviews ?? 0) > 0).length
  const share = ratio(active, 30)
  return {
    text:
      share >= 0.7
        ? `You studied on ${active} of the last 30 days. That kind of consistency is what makes spaced repetition work.`
        : `You studied on ${active} of the last 30 days. Even a few minutes on most days keeps reviews from piling up.`,
    tone: share >= 0.7 ? 'good' : 'neutral',
    link: 'activity',
  }
}
