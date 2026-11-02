import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Deck } from '../data/types'
import type { DeckSummary } from '../lib/stats'
import { formatInt, formatLongDate, formatMinutes, formatPct, formatShortDate } from '../lib/format'
import { chart, deckColor } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'

function DeckCard({ summary, range }: { summary: DeckSummary; range: number }) {
  const { deck } = summary
  const color = deckColor(deck.id)
  // New -> young -> mature as one hue at increasing strength (an ordered scale)
  const segments = [
    { label: 'New', value: deck.newCards, opacity: 0.35 },
    { label: 'Young', value: deck.youngCards, opacity: 0.65 },
    { label: 'Mature', value: deck.matureCards, opacity: 1 },
  ]

  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-4">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        <h3 className="font-semibold text-ink">{deck.name}</h3>
        <span className="ml-auto text-xs text-muted">{formatInt(deck.totalCards)} cards</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Metric label={`Reviews (${range}d)`} value={formatInt(summary.reviews)} />
        <Metric label="Per day" value={formatInt(summary.avgPerDay)} />
        <Metric label="Again rate" value={formatPct(summary.againRate)} />
        <Metric label="Study time" value={formatMinutes(summary.minutes)} />
      </dl>

      <div className="mt-4">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {segments.map((s) => (
            <div key={s.label} style={{ flexGrow: s.value, background: color, opacity: s.opacity }} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {segments.map((s) => `${s.label} ${formatInt(s.value)}`).join(' · ')}
        </p>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  )
}

interface DeckComparisonProps {
  summaries: DeckSummary[]
  againRows: Record<string, number | string | null>[]
  decks: Deck[]
  range: number
}

export function DeckComparison({ summaries, againRows, decks, range }: DeckComparisonProps) {
  return (
    <Panel title="Deck comparison" subtitle={`How your decks compare over the last ${range} days`}>
      <div className={`grid gap-4 ${summaries.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {summaries.map((s) => (
          <DeckCard key={s.deck.id} summary={s} range={range} />
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Again rate by deck</h3>
            <p className="text-xs text-muted">7-day rolling average · lower is better</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {decks.map((d) => (
              <LegendItem key={d.id} color={deckColor(d.id)} label={d.name} />
            ))}
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={againRows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={chart.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fill: chart.muted, fontSize: 12 }}
                axisLine={{ stroke: chart.axis }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => formatPct(v, 0)}
                tick={{ fill: chart.muted, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 'auto']}
              />
              <Tooltip
                cursor={{ stroke: chart.muted, strokeDasharray: '3 3' }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    title={typeof label === 'string' ? formatLongDate(label) : ''}
                    rows={(payload ?? [])
                      .filter((p) => p.value != null)
                      .map((p) => ({
                        color: deckColor(String(p.dataKey)),
                        label: decks.find((d) => d.id === p.dataKey)?.name ?? String(p.dataKey),
                        value: formatPct(Number(p.value)),
                      }))}
                  />
                )}
              />
              {decks.map((d) => (
                <Line
                  key={d.id}
                  dataKey={d.id}
                  type="monotone"
                  stroke={deckColor(d.id)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  )
}
