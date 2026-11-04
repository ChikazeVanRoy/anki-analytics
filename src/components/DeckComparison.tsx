import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDeckColor } from '../data/deckColors'
import type { Deck } from '../data/types'
import { messages } from '../i18n'
import { MIN_MATURE_SAMPLE, type Bucket, type DeckSummary } from '../lib/stats'
import { formatBucketTick, formatBucketTitle, formatInt, formatMinutes, formatPct, formatRate, formatShortDate } from '../lib/format'
import { chart } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'
import { Notice } from './ui'

const c = messages.activity.compare

function DeckCard({ summary, sinceChange }: { summary: DeckSummary; sinceChange?: number }) {
  const deckColor = useDeckColor()
  const { deck } = summary
  const color = deckColor(deck.id)
  // New -> young -> mature as one hue at increasing strength (an ordered scale)
  const segments = [
    { label: c.notStarted, value: deck.newCards, opacity: 0.3 },
    { label: c.learning, value: deck.youngCards, opacity: 0.65 },
    { label: messages.home.garden.stage.flower, value: deck.matureCards, opacity: 1 },
  ]

  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: color }} />
        <h3 className="font-extrabold text-ink">{deck.name}</h3>
        <span className="ml-auto text-xs text-muted">
          {messages.home.decks.cards(deck.totalCards)}
          {deck.suspendedCards > 0 && ` · ${messages.home.decks.suspended(deck.suspendedCards)}`}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Metric label={c.reviews} value={formatInt(summary.reviews)} />
        <Metric label={c.perDay} value={formatInt(summary.avgPerDay)} />
        <Metric label={messages.activity.forgot} value={formatPct(summary.againRate)} />
        <Metric label={c.studyTime} value={formatMinutes(summary.minutes)} />
        <RetentionMetric label={c.remembered} {...summary.retention.reviewCards} />
        <RetentionMetric label={c.rememberedKnown} minReviews={MIN_MATURE_SAMPLE} {...summary.retention.mature} />
      </dl>

      {sinceChange !== undefined && <p className="mt-2 text-xs font-semibold text-ink-2">{messages.activity.deckShiftRate(formatRate(sinceChange))}</p>}

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
  if (reviews === 0) return <Metric label={label} value="—" note={c.noReviews} />
  if (reviews < minReviews) return <Metric label={label} value="—" note={messages.activity.deckThin(reviews)} />
  return <Metric label={label} value={formatRate(rate)} note={c.ofReviews(reviews)} />
}

interface DeckComparisonProps {
  summaries: DeckSummary[]
  /** The day a grading change falls inside this period, if one does. */
  shiftDate?: string
  /** Each deck's Remembered rate since that change. */
  sinceChange?: Record<string, number>
  againRows: Record<string, number | string | null>[]
  decks: Deck[]
  bucket: Bucket
  /** e.g. "last 30 days" */
  period: string
}

export function DeckComparison({ summaries, againRows, decks, bucket, period, shiftDate, sinceChange = {} }: DeckComparisonProps) {
  const deckColor = useDeckColor()
  return (
    <Panel title={c.title} eyebrow={c.eyebrow} subtitle={c.subtitle(period)}>
      {shiftDate && (
        <div className="mb-4">
          <Notice>{messages.activity.deckShift(formatShortDate(shiftDate))}</Notice>
        </div>
      )}
      <div className={`grid gap-4 ${summaries.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {summaries.map((s) => (
          <DeckCard key={s.deck.id} summary={s} sinceChange={sinceChange[s.deck.id]} />
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-ink">{c.forgetTitle}</h3>
            <p className="text-xs text-muted">{c.forgetSub(bucket)}</p>
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
