import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { messages } from '../i18n'
import { formatBucketTick, formatBucketTitle, formatInt, formatPct } from '../lib/format'
import type { Bucket, workSplit } from '../lib/stats'
import { chart, forecast } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'
import { SourceBadge } from './ui'

const m = messages.activity
const SERIES = [
  { key: 'scheduled', label: m.workScheduled, color: forecast.known },
  { key: 'learning', label: m.workLearning, color: forecast.fresh },
] as const

interface Props {
  split: ReturnType<typeof workSplit>
  bucket: Bucket
  period: string
  sample: boolean
}

/** New cards cost more than the "reviews" total suggests, so their share of the work gets its own chart. */
export function WorkSplitChart({ split, bucket, period, sample }: Props) {
  const none = split.scheduled + split.learning === 0
  return (
    <Panel
      title={m.workTitle}
      eyebrow={m.workEyebrow}
      subtitle={none ? m.workNone : m.workSub(formatPct(split.learningShare, 0), period)}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {SERIES.map((s) => (
            <LegendItem key={s.key} color={s.color} label={s.label} />
          ))}
          <SourceBadge kind={sample ? 'sample' : 'measured'} />
        </div>
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={split.rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap={split.rows.length > 30 ? 1 : '20%'}>
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
              cursor={{ fill: chart.cursor }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  title={typeof label === 'string' ? formatBucketTitle(label, bucket) : ''}
                  rows={SERIES.map((s) => ({
                    color: s.color,
                    label: s.label,
                    value: formatInt(Number(payload?.find((p) => p.dataKey === s.key)?.value ?? 0)),
                  }))}
                />
              )}
            />
            {SERIES.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="work" fill={s.color} stroke={chart.surface} strokeWidth={split.rows.length > 30 ? 0 : 1} radius={i === 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
