import { useMemo } from 'react'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import { AnswerBar } from '../components/AnswerBar'
import { DailyReviewsChart } from '../components/DailyReviewsChart'
import { DeckComparison } from '../components/DeckComparison'
import { HardTrend } from '../components/HardTrend'
import { KnowledgeChart } from '../components/KnowledgeChart'
import { RangeFilter } from '../components/RangeFilter'
import { StatCard } from '../components/StatCard'
import { TroubleCards } from '../components/TroubleCards'
import { WorkSplitChart } from '../components/WorkSplitChart'
import { SourceBadge } from '../components/ui'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { toDateKey } from '../lib/dates'
import { changeDelta, formatInt, formatMinutes, formatPct, formatRate, formatShortDate, SAME_POINTS, SAME_RELATIVE } from '../lib/format'
import { shiftWithin } from '../lib/gradingShift'
import {
  activeYears,
  againRateSeries,
  ankiToday,
  answerCounts,
  bucketFor,
  deckSummaries,
  hardShareSeries,
  lastNDays,
  RANGE_OPTIONS,
  rangeDays,
  retentionSplit,
  reviewsByPeriod,
  summarize,
  totalsByDate,
  workSplit,
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
  const hardRows = useMemo(() => hardShareSeries(data, days), [data, days])

  // Only compare with the previous period if there was one with reviews in it
  const canCompare = range !== 'all' && summary.hasPrevious
  const avgChange = summary.avgPerDay / summary.prevAvgPerDay - 1
  const againChange = summary.againRate - summary.prevAgainRate // percentage points
  const compareNote = range === 'all' ? null : canCompare ? m.compareWith(days) : m.compareNone(days)
  const { reviewCards, mature } = summary.retention
  const { matureThin } = retentionSplit(summary.retention)
  const minutes = decks.reduce((n, d) => n + d.minutes, 0)
  const work = useMemo(() => workSplit(data, days), [data, days])
  const firstDay = lastNDays(days, 0, today)[0]
  const shift = shiftWithin(data, firstDay)
  const sinceChange = Object.fromEntries(
    data.decks.flatMap((d) => {
      const own = shiftWithin(data, firstDay, d.id)
      return own ? [[d.id, own.rate]] : []
    }),
  )

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
          label={m.reviewsPerDay}
          value={formatInt(summary.avgPerDay)}
          delta={
            canCompare
              ? changeDelta(avgChange, {
                  tolerance: SAME_RELATIVE,
                  same: m.noChange,
                  text: (size, up) => m.changePct(formatPct(size, 0), up),
                })
              : undefined
          }
        />
        <StatCard
          label={m.forgot}
          tip={m.forgotTip}
          value={formatPct(summary.againRate)}
          hint={reviewCards.reviews > 0 ? m.forgotSub(formatRate(1 - reviewCards.rate)) : undefined}
          delta={
            canCompare
              ? changeDelta(againChange, {
                  tolerance: SAME_POINTS,
                  same: m.noChange,
                  lowerIsBetter: true,
                  text: (size, up) => m.changePoints((size * 100).toFixed(1), up),
                })
              : undefined
          }
          style={{ animationDelay: '60ms' }}
        />
        <StatCard
          label={m.remembered}
          tip={m.rememberedTip}
          value={reviewCards.reviews > 0 ? formatRate(reviewCards.rate) : '—'}
          visual={reviewCards.reviews > 0 && <AnswerBar {...answerCounts(reviewCards)} />}
          hint={
            reviewCards.reviews === 0 ? (
              m.rememberedNone
            ) : (
              <>
                {m.rememberedSub(reviewCards.reviews)}
                <span className="mt-0.5 block">{matureThin ? m.rememberedThin : m.rememberedKnown(formatRate(mature.rate))}</span>
                {shift && <span className="mt-0.5 block font-semibold text-ink-2">{m.rememberedShift(formatRate(shift.rate), formatShortDate(shift.date))}</span>}
              </>
            )
          }
          style={{ animationDelay: '120ms' }}
        />
        <StatCard
          label={m.studyTime}
          value={formatMinutes(minutes)}
          hint={m.studySub(summary.activeDays, summary.totalCards)}
          style={{ animationDelay: '180ms' }}
        />
      </div>
      {compareNote && <p className="-mt-3 text-xs text-muted">{compareNote}</p>}

      <ActivityHeatmap byDate={byDate} today={today} years={years} />
      {data.fsrs?.enabled && <KnowledgeChart fsrs={data.fsrs} decks={data.decks} todayKey={toDateKey(today)} />}
      <DailyReviewsChart rows={periodRows} decks={data.decks} bucket={bucket} period={period} />
      <WorkSplitChart split={work} bucket={bucket} period={period} sample={data.source === 'mock'} />
      <HardTrend
        rows={hardRows}
        share={reviewCards.reviews > 0 ? reviewCards.hard / reviewCards.reviews : null}
        bucket={bucket}
        period={period}
        sample={data.source === 'mock'}
      />
      <DeckComparison summaries={decks} againRows={againRows} decks={data.decks} bucket={bucket} period={period} shiftDate={shift?.date} sinceChange={sinceChange} />
      {data.fsrs?.enabled && <TroubleCards fsrs={data.fsrs} decks={data.decks} />}
    </div>
  )
}
