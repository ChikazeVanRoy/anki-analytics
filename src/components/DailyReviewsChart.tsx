import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Deck } from '../data/types'
import { formatBucketTick, formatBucketTitle, formatInt } from '../lib/format'
import type { Bucket } from '../lib/stats'
import { chart, deckColor } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'

interface DailyReviewsChartProps {
  rows: Record<string, number | string>[]
  decks: Deck[]
  bucket: Bucket
  /** e.g. "last 30 days" */
  period: string
}

const TITLES: Record<Bucket, string> = { day: 'Daily reviews', week: 'Weekly reviews', month: 'Monthly reviews' }

export function DailyReviewsChart({ rows, decks, bucket, period }: DailyReviewsChartProps) {
  const lastDeck = decks[decks.length - 1]?.id
  const dense = rows.length > 30 // thin bars: drop the gaps and outlines

  return (
    <Panel
      title={TITLES[bucket]}
      subtitle={`Reviews per ${bucket} by deck, ${period}`}
      actions={
        <div className="flex flex-wrap gap-3">
          {decks.map((d) => (
            <LegendItem key={d.id} color={deckColor(d.id)} label={d.name} />
          ))}
        </div>
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap={dense ? 1 : '20%'}>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis
              dataKey="date"
              tickFormatter={(k: string) => formatBucketTick(k, bucket)}
              tick={{ fill: chart.muted, fontSize: 12 }}
              axisLine={{ stroke: chart.axis }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tick={{ fill: chart.muted, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={formatInt} />
            <Tooltip
              cursor={{ fill: 'rgb(255 255 255 / 0.05)' }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  title={typeof label === 'string' ? formatBucketTitle(label, bucket) : ''}
                  rows={(payload ?? []).map((p) => ({
                    color: deckColor(String(p.dataKey)),
                    label: decks.find((d) => d.id === p.dataKey)?.name ?? String(p.dataKey),
                    value: formatInt(Number(p.value)),
                  }))}
                  footer={{
                    label: 'Total',
                    value: formatInt((payload ?? []).reduce((n, p) => n + Number(p.value), 0)),
                  }}
                />
              )}
            />
            {decks.map((d) => (
              <Bar
                key={d.id}
                dataKey={d.id}
                stackId="reviews"
                fill={deckColor(d.id)}
                stroke={chart.surface}
                strokeWidth={dense ? 0 : 1}
                radius={d.id === lastDeck ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
