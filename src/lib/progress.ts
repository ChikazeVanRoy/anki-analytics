// Home-page progress: the weekly goal, week-on-week change, milestones and one plain-language insight.
// Pure functions over measured data only (tested). Nothing here is estimated or invented: a milestone is
// shown as reached only when the review log or card counts show it.

import type { AnkiData } from '../data/types'
import { ankiDayKey, dayNumber, toDateKey } from './dates'
import { formatInt, formatPct, formatRate } from './format'
import { measuredDefaults } from './measured'
import { deckSummaries, lastNDays, MIN_RATE_SAMPLE, ratio, retentionSplit, type DayTotal } from './stats'

const studied = (byDate: Map<string, DayTotal>, key: string) => (byDate.get(key)?.reviews ?? 0) > 0

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

// ---------- Weekly goal ----------

export interface GoalDay {
  date: string
  studied: boolean
  isToday: boolean
  future: boolean
}

export interface WeekGoal {
  goal: number
  done: number // study days so far this week
  met: boolean
  /** Monday to Sunday of this week. */
  days: GoalDay[]
  /** Whether the goal can still be reached this week. */
  reachable: boolean
  /** Weeks in a row at this goal: this week once met, plus the finished weeks before it. */
  weeksInRow: number
}

/** The seven date keys of the week `weeksAgo` before the one holding `today`, Monday first. */
function weekKeys(today: Date, weeksAgo: number): string[] {
  const monday = today.getDate() - ((today.getDay() + 6) % 7) - weeksAgo * 7
  return Array.from({ length: 7 }, (_, i) => toDateKey(new Date(today.getFullYear(), today.getMonth(), monday + i)))
}

/**
 * Progress towards `goal` study days this calendar week (Monday to Sunday). Unlike a streak, a rest day costs
 * nothing, and a week still under way never breaks the run of weeks.
 */
export function weekGoal(byDate: Map<string, DayTotal>, today: Date, goal: number): WeekGoal {
  const todayKey = toDateKey(today)
  const days = weekKeys(today, 0).map((date) => ({
    date,
    studied: studied(byDate, date),
    isToday: date === todayKey,
    future: date > todayKey,
  }))
  const done = days.filter((d) => d.studied).length
  const met = done >= goal
  const open = days.filter((d) => !d.studied && (d.future || d.isToday)).length
  let weeksInRow = met ? 1 : 0
  for (let w = 1; weekKeys(today, w).filter((k) => studied(byDate, k)).length >= goal; w++) weeksInRow++
  return { goal, done, met, days, reachable: done + open >= goal, weeksInRow }
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
  const known = data.decks.reduce((n, d) => n + d.matureCards, 0)
  return [
    milestoneTrack('reviews', totalReviews),
    milestoneTrack('days', [...byDate.keys()].filter((k) => studied(byDate, k)).length),
    milestoneTrack('known', known),
  ]
}

// ---------- Status and greeting ----------

export type DayStatus = 'empty' | 'done' | 'met' | 'keep'

/** What to say at the top of Home: reviewed today, the week's goal already met, a session to come, or no data yet. */
export function dayStatus(hasAnyReviews: boolean, reviewsToday: number, goalMet: boolean): DayStatus {
  if (!hasAnyReviews) return 'empty'
  if (reviewsToday > 0) return 'done'
  return goalMet ? 'met' : 'keep'
}

/** Greeting by local clock hour. */
export function greetingPart(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

export type DueToday =
  | {
      stale: false
      cards: number // studied, unburied cards due today or overdue, from Anki's stored due dates
      newCards: number // new cards left today: each deck's daily limit, less those started, up to what's available
      /**
       * Estimate of everything above: answers × measured seconds per answer, where a new card takes its deck's
       * measured answers on the first day. Anki's daily limits may show fewer.
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

/** What's waiting today, from FSRS card data. Null without real FSRS data (mock data has none). */
export function dueToday(data: AnkiData, today: Date): DueToday | null {
  if (!data.fsrs?.enabled) return null
  if (copiedOnEarlierDay(data, today)) return { stale: true }
  const day = dayNumber(toDateKey(today))
  const { fsrs } = data
  const cards = fsrs.cards.filter((c) => !c.buried && dayNumber(c.due) <= day).length
  let newCards = 0
  let answers = cards
  for (const p of fsrs.presets) {
    const left = Math.min(Math.max(0, p.newPerDay - (fsrs.newToday[p.deckId] ?? 0)), fsrs.newCards[p.deckId] ?? 0)
    newCards += left
    answers += left * Math.max(1, fsrs.behaviour.find((b) => b.deckId === p.deckId)?.learningReviewsPerNewCard ?? 1)
  }
  return { stale: false, cards, newCards, minutes: (answers * measuredDefaults(data, today).secondsPerReview) / 60 }
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

  const decks = deckSummaries(data, 30).filter(
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
