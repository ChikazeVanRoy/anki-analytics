import { useMemo, useState } from 'react'
import { ActivityHeatmap } from './components/ActivityHeatmap'
import { DailyReviewsChart } from './components/DailyReviewsChart'
import { DeckComparison } from './components/DeckComparison'
import { FsrsAnalytics } from './components/FsrsAnalytics'
import { Panel } from './components/Panel'
import { RangeFilter } from './components/RangeFilter'
import { StatCard } from './components/StatCard'
import { WorkloadForecast } from './components/WorkloadForecast'
import type { AnkiData } from './data/types'
import { useAnkiData } from './data/useAnkiData'
import { toDateKey } from './lib/dates'
import { formatInt, formatPct } from './lib/format'
import { fsrsUnavailableReason } from './lib/fsrsStatus'
import { measuredDefaults } from './lib/measured'
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
} from './lib/stats'

export default function App() {
  const { state, refresh, refreshing, refreshError } = useAnkiData()
  if (state.status === 'loading') {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading your Anki stats…</div>
  }
  return (
    <Dashboard
      data={state.data}
      fallbackReason={state.fallbackReason}
      onRefresh={refresh}
      refreshing={refreshing}
      refreshError={refreshError}
    />
  )
}

interface DashboardProps {
  data: AnkiData
  fallbackReason?: string
  onRefresh: () => void
  refreshing: boolean
  refreshError: string | null
}

function Dashboard({ data, fallbackReason, onRefresh, refreshing, refreshError }: DashboardProps) {
  const [range, setRange] = useState<RangeKey>('30d')
  const days = rangeDays(data, range)
  const bucket = bucketFor(days)
  const period = RANGE_OPTIONS.find((o) => o.key === range)!.description

  // useMemo: only recompute derived stats when the range (or data) changes
  const today = useMemo(() => ankiToday(data), [data])
  const byDate = useMemo(() => totalsByDate(data.daily), [data])
  const years = useMemo(() => activeYears(data), [data])
  const summary = useMemo(() => summarize(data, days), [data, days])
  const periodRows = useMemo(() => reviewsByPeriod(data, days), [data, days])
  const decks = useMemo(() => deckSummaries(data, days), [data, days])
  const againRows = useMemo(() => againRateSeries(data, days), [data, days])
  const todayKey = toDateKey(today)
  const measured = useMemo(() => measuredDefaults(data, today), [data, today])

  // Only compare with the previous period if there was one with reviews in it
  const canCompare = range !== 'all' && summary.hasPrevious
  const avgChange = summary.avgPerDay / summary.prevAvgPerDay - 1
  const againChange = summary.againRate - summary.prevAgainRate // percentage points
  const compareHint =
    range === 'all' ? 'all time' : canCompare ? `vs previous ${days}d` : `no reviews in previous ${days}d`
  const { reviewCards, mature } = summary.retention

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Anki Analytics</h1>
              {data.source === 'mock' && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning"
                  title={`Generated sample data, not your real Anki statistics. ${fallbackReason ?? ''}`}
                >
                  <WarningIcon />
                  Mock data
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {data.source === 'mock'
                ? `Showing sample data${fallbackReason ? ` · ${fallbackReason}` : ''}`
                : `Local Anki data · copied ${new Date(data.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RangeFilter value={range} onChange={setRange} />
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="Copy the latest collection from Anki (Anki must be closed)"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
            >
              <RefreshIcon spinning={refreshing} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {refreshError && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-2 rounded-xl border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-ink"
          >
            <span className="text-critical">
              <WarningIcon />
            </span>
            Couldn't refresh: {refreshError}
          </div>
        )}

        <main className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              label="Total cards"
              value={formatInt(summary.totalCards)}
              hint={`across ${data.decks.filter((d) => d.totalCards > 0).length} decks`}
            />
            <StatCard label="Reviews today" value={formatInt(summary.reviewsToday)} hint={`${summary.streak}-day streak`} />
            <StatCard
              label="Avg reviews / day"
              value={formatInt(summary.avgPerDay)}
              delta={
                canCompare
                  ? { text: `${avgChange >= 0 ? '▲' : '▼'} ${formatPct(Math.abs(avgChange), 0)}`, good: avgChange >= 0 }
                  : undefined
              }
              hint={compareHint}
            />
            <StatCard
              label="Again rate"
              value={formatPct(summary.againRate)}
              delta={
                canCompare
                  ? { text: `${againChange <= 0 ? '▼' : '▲'} ${(Math.abs(againChange) * 100).toFixed(1)} pts`, good: againChange <= 0 }
                  : undefined
              }
              hint={compareHint}
            />
            <StatCard
              className="col-span-2 lg:col-span-1"
              label="Retention"
              value={reviewCards.reviews > 0 ? formatPct(reviewCards.rate) : '—'}
              hint={`${formatInt(reviewCards.reviews)} review-card reviews · mature ${
                mature.reviews > 0 ? formatPct(mature.rate) : '—'
              }`}
            />
          </div>

          <ActivityHeatmap byDate={byDate} today={today} years={years} />
          <DailyReviewsChart rows={periodRows} decks={data.decks} bucket={bucket} period={period} />
          <DeckComparison summaries={decks} againRows={againRows} decks={data.decks} bucket={bucket} period={period} />

          {data.fsrs?.enabled ? (
            <>
              <FsrsAnalytics fsrs={data.fsrs} decks={data.decks} todayKey={todayKey} />
              <WorkloadForecast
                fsrs={data.fsrs}
                decks={data.decks}
                todayKey={todayKey}
                startWeekday={(today.getDay() + 6) % 7}
                measured={measured}
              />
            </>
          ) : (
            <FsrsUnavailable reason={fsrsUnavailableReason(data)} />
          )}
        </main>

        <footer className="mt-10 text-center text-xs text-muted">
          {data.source === 'mock'
            ? 'Showing generated sample data. Real Anki statistics are read locally from a copy of your collection.'
            : 'Data read locally from a copy of your Anki collection. Retention = review-card answers other than Again.'}
        </footer>
      </div>
    </div>
  )
}

function FsrsUnavailable({ reason }: { reason: { title: string; detail: string } }) {
  return (
    <Panel title="FSRS memory and workload forecast" subtitle={reason.title}>
      <p className="text-sm text-muted">{reason.detail}</p>
    </Panel>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
      <path d="M8 1.5 15 14H1L8 1.5Zm-.75 4.5v4h1.5V6h-1.5Zm0 5v1.5h1.5V11h-1.5Z" />
    </svg>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-4 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6" />
    </svg>
  )
}
