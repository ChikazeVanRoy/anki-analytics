import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDeckColor } from '../data/deckColors'
import type { Deck } from '../data/types'
import { messages } from '../i18n'
import { MIN_MATURE_SAMPLE, type Bucket, type DeckSummary } from '../lib/stats'
import { formatBucketTick, formatBucketTitle, formatInt, formatMinutes, formatPct, formatRate } from '../lib/format'
import { chart } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'

function DeckCard({ summary }: { summary: DeckSummary }) {
  const deckColor = useDeckColor()
  const { deck } = summary
  const color = deckColor(deck.id)
  // New -> young -> mature as one hue at increasing strength (an ordered scale)
  const segments = [
    { label: 'Not started', value: deck.newCards, opacity: 0.3 },
    { label: 'Learning', value: deck.youngCards, opacity: 0.65 },
    { label: 'Known well', value: deck.matureCards, opacity: 1 },
  ]

  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: color }} />
        <h3 className="font-extrabold text-ink">{deck.name}</h3>
        <span className="ml-auto text-xs text-muted">
          {formatInt(deck.totalCards)} cards
          {deck.suspendedCards > 0 && ` · ${messages.home.decks.suspended(deck.suspendedCards)}`}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Metric label="Reviews" value={formatInt(summary.reviews)} />
        <Metric label="Per day" value={formatInt(summary.avgPerDay)} />
        <Metric label={messages.activity.forgot} value={formatPct(summary.againRate)} />
        <Metric label="Study time" value={formatMinutes(summary.minutes)} />
        <RetentionMetric label="Remembered" {...summary.retention.reviewCards} />
        <RetentionMetric label="Remembered, known-well cards" minReviews={MIN_MATURE_SAMPLE} {...summary.retention.mature} />
      </dl>

      <div className="mt-4">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
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

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-extrabold text-ink tabular-nums">
        {value}
        {note && <span className="ml-1.5 text-xs font-normal text-muted">{note}</span>}
      </dd>
    </div>
  )
}

/** Pass rate with its sample size, since small samples (or none) are common for mature cards. */
function RetentionMetric({ label, reviews, rate, minReviews = 1 }: { label: string; reviews: number; rate: number; minReviews?: number }) {
  if (reviews === 0) return <Metric label={label} value="—" note="no reviews yet" />
  if (reviews < minReviews) return <Metric label={label} value="—" note={messages.activity.deckThin(reviews)} />
  return <Metric label={label} value={formatRate(rate)} note={`of ${formatInt(reviews)}`} />
}

interface DeckComparisonProps {
  summaries: DeckSummary[]
  againRows: Record<string, number | string | null>[]
  decks: Deck[]
  bucket: Bucket
  /** e.g. "last 30 days" */
  period: string
}

export function DeckComparison({ summaries, againRows, decks, bucket, period }: DeckComparisonProps) {
  const deckColor = useDeckColor()
  return (
    <Panel title="How do my decks compare?" eyebrow="Decks" subtitle={`Each deck, ${period}. “Remembered” counts scheduled reviews not answered Again; Hard counts as remembered.`}>
      <div className={`grid gap-4 ${summaries.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {summaries.map((s) => (
          <DeckCard key={s.deck.id} summary={s} />
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-ink">Am I forgetting less over time?</h3>
            <p className="text-xs text-muted">
              Share of answers that were Again · {bucket === 'day' ? '7-day rolling average' : `per ${bucket}`} · lower is better
            </p>
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
                tickFormatter={(k: string) => formatBucketTick(k, bucket)}
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
                    title={typeof label === 'string' ? formatBucketTitle(label, bucket) : ''}
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
