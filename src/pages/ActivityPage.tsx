import { useMemo } from 'react'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { DailyReviewsChart } from '../components/DailyReviewsChart'
import { DeckComparison } from '../components/DeckComparison'
import { RangeFilter } from '../components/RangeFilter'
import { StatCard } from '../components/StatCard'
import { SourceBadge } from '../components/ui'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { changeDelta, formatInt, formatMinutes, formatPct, formatRate, SAME_POINTS, SAME_RELATIVE } from '../lib/format'
import {
  activeYears,
  againRateSeries,
  ankiToday,
  bucketFor,
  deckSummaries,
  RANGE_OPTIONS,
  rangeDays,
  retentionSplit,
  reviewsByPeriod,
  summarize,
  totalsByDate,
  type RangeKey,
} from '../lib/stats'
import { PageHeader } from './PageHeader'

const m = messages.activity

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
  const compareNote = range === 'all' ? null : canCompare ? m.compareWith(days) : m.compareNone(days)
  const { reviewCards, mature } = summary.retention
  const { matureThin } = retentionSplit(summary.retention)
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
              ? changeDelta(avgChange, {
                  tolerance: SAME_RELATIVE,
                  same: m.noChange,
                  text: (size, up) => `${up ? '▲' : '▼'} ${formatPct(size, 0)}`,
                })
              : undefined
          }
        />
        <StatCard
          label={m.forgot}
          tip={m.forgotTip}
          value={formatPct(summary.againRate)}
          delta={
            canCompare
              ? changeDelta(againChange, {
                  tolerance: SAME_POINTS,
                  same: m.noChange,
                  lowerIsBetter: true,
                  text: (size, up) => `${up ? '▲' : '▼'} ${(size * 100).toFixed(1)} pts`,
                })
              : undefined
          }
          style={{ animationDelay: '60ms' }}
        />
        <StatCard
          label={m.remembered}
          tip={m.rememberedTip}
          value={reviewCards.reviews > 0 ? formatRate(reviewCards.rate) : '—'}
          hint={
            reviewCards.reviews === 0 ? (
              m.rememberedNone
            ) : (
              <>
                {m.rememberedSub(reviewCards.reviews, reviewCards.reviews - reviewCards.passed, reviewCards.hard)}
                <span className="mt-0.5 block">{matureThin ? m.rememberedThin : m.rememberedKnown(formatRate(mature.rate))}</span>
              </>
            )
          }
          style={{ animationDelay: '120ms' }}
        />
        <StatCard
          label="Study time"
          value={formatMinutes(minutes)}
          hint={`${summary.activeDays} active ${summary.activeDays === 1 ? 'day' : 'days'} · ${formatInt(summary.totalCards)} cards in total`}
          style={{ animationDelay: '180ms' }}
        />
      </div>
      {compareNote && <p className="-mt-3 text-xs text-muted">{compareNote}</p>}

      <ActivityHeatmap byDate={byDate} today={today} years={years} />
      <DailyReviewsChart rows={periodRows} decks={data.decks} bucket={bucket} period={period} />
      <DeckComparison summaries={decks} againRows={againRows} decks={data.decks} bucket={bucket} period={period} />
    </div>
  )
}
