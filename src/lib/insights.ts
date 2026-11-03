// Plain-language answers built only from measured data and the simulator's outputs.

import { formatInt } from './format'
import type { HorizonSummary } from './simulator'

export interface Insight {
  question: string
  answer: string
  basis: string // what the answer is derived from
  tone: 'good' | 'warning' | 'neutral'
}

export interface InsightInputs {
  newPerDay: number
  secondsPerReview: number
  budgetMinutes: number
  recentMinutesPerStudyDay: number // measured, last 28 days
  year: HorizonSummary // current settings, 365-day run
  horizon: HorizonSummary // current settings, selected horizon
  sweep: { value: number; year: HorizonSummary }[] // new/day scenarios, 365-day runs
  deckNames: Record<string, string>
}

const mins = (reviews: number, secs: number) => (reviews * secs) / 60
const fmt = formatInt

/** Largest new/day whose heaviest 30-day stretch fits the budget, interpolated between scenarios. */
export function maxSustainableNewPerDay(
  sweep: { value: number; year: HorizonSummary }[],
  budgetMinutes: number,
  secondsPerReview: number,
): { value: number; capped: boolean } | null {
  const pts = [...sweep].sort((a, b) => a.value - b.value)
  const load = (p: (typeof pts)[number]) =>
    p.year.backlogEnd > 1 ? Infinity : mins(p.year.maxWindowPerStudyDay, secondsPerReview)
  if (!pts.length || load(pts[0]) > budgetMinutes) return null
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (load(b) > budgetMinutes) {
      const la = load(a)
      const lb = load(b)
      const t = Number.isFinite(lb) && lb > la ? (budgetMinutes - la) / (lb - la) : 0
      return { value: Math.floor((a.value + t * (b.value - a.value)) / 5) * 5, capped: false }
    }
  }
  return { value: pts[pts.length - 1].value, capped: true }
}

export function buildInsights(x: InsightInputs): Insight[] {
  const out: Insight[] = []
  const heavy = mins(x.year.maxWindowPerStudyDay, x.secondsPerReview)

  // 1. Sustainability
  if (x.year.backlogEnd > 1) {
    out.push({
      question: 'Is my current workload sustainable?',
      answer: `No. At ${x.newPerDay} new cards/day your daily review limit is reached and about ${fmt(x.year.backlogEnd)} cards are still waiting at the end of the year.`,
      basis: 'Simulated year with your presets’ review limits.',
      tone: 'warning',
    })
  } else {
    const ok = heavy <= x.budgetMinutes
    out.push({
      question: 'Is my current workload sustainable?',
      answer: ok
        ? `Yes. At ${x.newPerDay} new cards/day your heaviest month averages about ${fmt(x.year.maxWindowPerStudyDay)} reviews (${fmt(heavy)} min) per study day, within your ${fmt(x.budgetMinutes)}-minute budget.`
        : `Not within your budget. At ${x.newPerDay} new cards/day your heaviest month averages about ${fmt(x.year.maxWindowPerStudyDay)} reviews (${fmt(heavy)} min) per study day, ${fmt(heavy - x.budgetMinutes)} min over your ${fmt(x.budgetMinutes)}-minute budget. You currently study about ${fmt(x.recentMinutesPerStudyDay)} min per study day.`,
      basis: `Heaviest 30 days of a simulated year (mean of runs), at ${x.secondsPerReview.toFixed(0)} s per review.`,
      tone: ok ? 'good' : 'warning',
    })
  }

  // 2. Maximum sustainable new cards
  const max = maxSustainableNewPerDay(x.sweep, x.budgetMinutes, x.secondsPerReview)
  out.push({
    question: 'How many new cards per day could I reasonably maintain?',
    answer: !max
      ? `Even with no new cards your existing reviews exceed a ${fmt(x.budgetMinutes)}-minute budget in the heaviest month.`
      : max.capped
        ? `At least ${max.value} per day: every simulated scenario up to ${max.value} stays within ${fmt(x.budgetMinutes)} min per study day.`
        : `About ${max.value} per day keeps your heaviest month within ${fmt(x.budgetMinutes)} min per study day.`,
    basis: `Interpolated between simulated scenarios (${x.sweep.map((s) => s.value).join(', ')} new/day, one year each). Change the time budget to see a different answer.`,
    tone: max && max.value >= x.newPerDay ? 'good' : 'neutral',
  })

  // 3. Deck burden
  const decks = x.horizon.perDeck.map((d) => ({ ...d, total: d.existing + d.fresh }))
  if (decks.length > 1) {
    const sorted = [...decks].sort((a, b) => b.total - a.total)
    const top = sorted[0]
    const all = decks.reduce((a, d) => a + d.total, 0) || 1
    out.push({
      question: 'Which deck is creating the most future review burden?',
      answer: `${x.deckNames[top.deckId] ?? top.deckId}: ${fmt(top.total)} of ${fmt(all)} projected reviews (${Math.round((top.total / all) * 100)}%) over the next ${x.horizon.horizon} days, ${fmt(top.fresh)} of them from new cards.`,
      basis: 'Simulated reviews per deck, split into existing cards and cards introduced during the period.',
      tone: 'neutral',
    })
  } else if (decks.length === 1) {
    out.push({
      question: 'Which deck is creating the most future review burden?',
      answer: `Only ${x.deckNames[decks[0].deckId] ?? decks[0].deckId} is selected. Select all decks to compare them.`,
      basis: 'Deck selection.',
      tone: 'neutral',
    })
  }

  // 4. Changing new cards/day
  const cur = x.sweep.find((s) => s.value === x.newPerDay)
  const less = [...x.sweep].filter((s) => s.value < x.newPerDay).sort((a, b) => b.value - a.value)[0]
  const more = x.sweep.filter((s) => s.value > x.newPerDay).sort((a, b) => a.value - b.value)[0]
  if (cur && (less || more)) {
    const parts: string[] = []
    const delta = (s: (typeof x.sweep)[number]) => {
      const dReviews = s.year.maxWindowPerStudyDay - cur.year.maxWindowPerStudyDay
      return `${s.value} new/day ${dReviews >= 0 ? 'adds' : 'removes'} about ${fmt(Math.abs(dReviews))} reviews (${fmt(Math.abs(mins(dReviews, x.secondsPerReview)))} min) per study day in the heaviest month`
    }
    if (more) parts.push(delta(more))
    if (less) parts.push(delta(less))
    out.push({
      question: 'What changes if I increase or decrease my daily new cards?',
      answer: `Compared with ${x.newPerDay}/day: ${parts.join('; ')}.`,
      basis: 'Same random seed in every scenario, so differences come from the setting rather than chance.',
      tone: 'neutral',
    })
  }
  return out
}
