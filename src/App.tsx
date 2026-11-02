import { useMemo, useState } from 'react'
import { ActivityHeatmap } from './components/ActivityHeatmap'
import { DailyReviewsChart } from './components/DailyReviewsChart'
import { DeckComparison } from './components/DeckComparison'
import { RangeFilter } from './components/RangeFilter'
import { StatCard } from './components/StatCard'
import type { AnkiData } from './data/types'
import { useAnkiData } from './data/useAnkiData'
import { formatInt, formatPct } from './lib/format'
import {
  ankiToday,
  dailyByDeck,
  deckSummaries,
  rollingAgainRate,
  summarize,
  totalsByDate,
  type RangeDays,
} from './lib/stats'

export default function App() {
  const state = useAnkiData()
  if (state.status === 'loading') {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading your Anki stats…</div>
  }
  return <Dashboard data={state.data} fallbackReason={state.fallbackReason} />
}

function Dashboard({ data, fallbackReason }: { data: AnkiData; fallbackReason?: string }) {
  const [range, setRange] = useState<RangeDays>(30)

  // useMemo: only recompute derived stats when the range (or data) changes
  const today = useMemo(() => ankiToday(data), [data])
  const byDate = useMemo(() => totalsByDate(data.daily), [data])
  const summary = useMemo(() => summarize(data, range), [data, range])
  const dailyRows = useMemo(() => dailyByDeck(data, range), [data, range])
  const decks = useMemo(() => deckSummaries(data, range), [data, range])
  const againRows = useMemo(() => rollingAgainRate(data, range), [data, range])

  // Only compare with the previous period if there were reviews in it
  const avgChange = summary.avgPerDay / summary.prevAvgPerDay - 1
  const againChange = summary.againRate - summary.prevAgainRate // percentage points
  const compareHint = summary.hasPrevious ? `vs previous ${range}d` : `no reviews in previous ${range}d`

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
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
                    <path d="M8 1.5 15 14H1L8 1.5Zm-.75 4.5v4h1.5V6h-1.5Zm0 5v1.5h1.5V11h-1.5Z" />
                  </svg>
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
          <RangeFilter value={range} onChange={setRange} />
        </header>

        <main className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total cards" value={formatInt(summary.totalCards)} hint={`across ${data.decks.filter((d) => d.totalCards > 0).length} decks`} />
            <StatCard label="Reviews today" value={formatInt(summary.reviewsToday)} hint={`${summary.streak}-day streak`} />
            <StatCard
              label="Avg reviews / day"
              value={formatInt(summary.avgPerDay)}
              delta={
                summary.hasPrevious
                  ? { text: `${avgChange >= 0 ? '▲' : '▼'} ${formatPct(Math.abs(avgChange), 0)}`, good: avgChange >= 0 }
                  : undefined
              }
              hint={compareHint}
            />
            <StatCard
              label="Again rate"
              value={formatPct(summary.againRate)}
              delta={
                summary.hasPrevious
                  ? { text: `${againChange <= 0 ? '▼' : '▲'} ${(Math.abs(againChange) * 100).toFixed(1)} pts`, good: againChange <= 0 }
                  : undefined
              }
              hint={compareHint}
            />
          </div>

          <ActivityHeatmap byDate={byDate} today={today} />
          <DailyReviewsChart rows={dailyRows} decks={data.decks} range={range} />
          <DeckComparison summaries={decks} againRows={againRows} decks={data.decks} range={range} />
        </main>

        <footer className="mt-10 text-center text-xs text-muted">
          {data.source === 'mock'
            ? 'Showing generated sample data. Real Anki statistics will be read locally from a copy of your collection.'
            : 'Data read locally from a copy of your Anki collection.'}
        </footer>
      </div>
    </div>
  )
}
