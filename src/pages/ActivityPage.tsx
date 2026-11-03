import { useMemo } from 'react'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { DailyReviewsChart } from '../components/DailyReviewsChart'
import { DeckComparison } from '../components/DeckComparison'
import { RangeFilter } from '../components/RangeFilter'
import { StatCard } from '../components/StatCard'
import { SourceBadge } from '../components/ui'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { formatInt, formatMinutes, formatPct } from '../lib/format'
import {
  activeYears,
  againRateSeries,
  ankiToday,
  bucketFor,
  deckSummaries,
  RANGE_OPTIONS,
  rangeDays,
  reviewsByPeriod,
  summarize,
  totalsByDate,
  type RangeKey,
} from '../lib/stats'
import { PageHeader } from './PageHeader'

interface Props {
  data: AnkiData
  range: RangeKey
  onRangeChange: (r: RangeKey) => void
}

export function ActivityPage({ data, range, onRangeChange }: Props) {
  const days = rangeDays(data, range)
  const bucket = bucketFor(days)
  const period = RANGE_OPTIONS.find((o) => o.key === range)!.description

  const today = useMemo(() => ankiToday(data), [data])
  const byDate = useMemo(() => totalsByDate(data.daily), [data])
  const years = useMemo(() => activeYears(data), [data])
  const summary = useMemo(() => summarize(data, days), [data, days])
  const periodRows = useMemo(() => reviewsByPeriod(data, days), [data, days])
  const decks = useMemo(() => deckSummaries(data, days), [data, days])
  const againRows = useMemo(() => againRateSeries(data, days), [data, days])

  // Only compare with the previous period if there was one with reviews in it
  const canCompare = range !== 'all' && summary.hasPrevious
  const avgChange = summary.avgPerDay / summary.prevAvgPerDay - 1
  const againChange = summary.againRate - summary.prevAgainRate // percentage points
  const compareHint =
    range === 'all' ? 'all time' : canCompare ? `vs previous ${days} days` : `no reviews in the previous ${days} days`
  const { reviewCards, mature } = summary.retention
  const minutes = decks.reduce((n, d) => n + d.minutes, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={messages.activity.title}
        subtitle={messages.activity.subtitle}
        badge={<SourceBadge kind={data.source === 'mock' ? 'sample' : 'measured'} />}
        actions={<RangeFilter value={range} onChange={onRangeChange} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Reviews per day"
          value={formatInt(summary.avgPerDay)}
          delta={
            canCompare
              ? { text: `${avgChange >= 0 ? '▲' : '▼'} ${formatPct(Math.abs(avgChange), 0)}`, good: avgChange >= 0 }
              : undefined
          }
          hint={compareHint}
        />
        <StatCard
          label="Forgot"
          tip="Share of all answers that were “Again”, including new and learning cards. Lower is better, but some forgetting is normal and healthy."
          value={formatPct(summary.againRate)}
          delta={
            canCompare
              ? { text: `${againChange <= 0 ? '▼' : '▲'} ${(Math.abs(againChange) * 100).toFixed(1)} pts`, good: againChange <= 0 }
              : undefined
          }
          hint={compareHint}
          style={{ animationDelay: '60ms' }}
        />
        <StatCard
          label="Remembered"
          tip="Reviews of graduated cards not answered Again (Anki’s true retention). “Known well” = cards whose previous interval was 21 days or more."
          value={reviewCards.reviews > 0 ? formatPct(reviewCards.rate) : '—'}
          hint={`${formatInt(reviewCards.reviews)} reviews · known well ${mature.reviews > 0 ? formatPct(mature.rate) : '—'}`}
          style={{ animationDelay: '120ms' }}
        />
        <StatCard
          label="Study time"
          value={formatMinutes(minutes)}
          hint={`${summary.activeDays} active ${summary.activeDays === 1 ? 'day' : 'days'} · ${formatInt(summary.totalCards)} cards in total`}
          style={{ animationDelay: '180ms' }}
        />
      </div>

      <ActivityHeatmap byDate={byDate} today={today} years={years} />
      <DailyReviewsChart rows={periodRows} decks={data.decks} bucket={bucket} period={period} />
      <DeckComparison summaries={decks} againRows={againRows} decks={data.decks} bucket={bucket} period={period} />
    </div>
  )
}
