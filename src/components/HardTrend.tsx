import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { messages } from '../i18n'
import { formatBucketTick, formatBucketTitle, formatPct } from '../lib/format'
import type { Bucket, HardShareRow } from '../lib/stats'
import { chart } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { Panel } from './Panel'
import { SourceBadge } from './ui'

const m = messages.activity
const HARD = 'var(--color-answer-hard)'

interface HardTrendProps {
  rows: HardShareRow[]
  /** Share of scheduled reviews answered Hard over the whole period, or null with none. */
  share: number | null
  bucket: Bucket
  period: string
  sample: boolean
}

export function HardTrend({ rows, share, bucket, period, sample }: HardTrendProps) {
  const empty = rows.every((r) => r.share === null)
  return (
    <Panel
      title={m.hardTitle}
      eyebrow={m.hardEyebrow}
      subtitle={share === null ? m.hardNone : m.hardSub(formatPct(share, 0), period, bucket === 'day' ? m.hardRolling : m.hardPer(bucket))}
      actions={<SourceBadge kind={sample ? 'sample' : 'measured'} />}
    >
      {empty ? (
        <p className="text-sm text-muted">{m.hardThin}</p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
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
                content={({ active, payload, label }) => {
                  const row = payload?.[0]?.payload as HardShareRow | undefined
                  return (
                    <ChartTooltip
                      active={active && row?.share != null}
                      title={typeof label === 'string' ? formatBucketTitle(label, bucket) : ''}
                      rows={row?.share != null ? [{ color: HARD, label: m.hardLabel, value: m.hardValue(formatPct(row.share), row.reviews) }] : []}
                    />
                  )
                }}
              />
              <Line
                dataKey="share"
                type="monotone"
                stroke={HARD}
                strokeWidth={2}
                dot={bucket !== 'day'}
                activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
