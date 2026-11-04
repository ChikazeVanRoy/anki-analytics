import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDeckColor } from '../data/deckColors'
import type { Deck, FsrsData } from '../data/types'
import { messages } from '../i18n'
import { dayNumber } from '../lib/dates'
import { formatBucketTick, formatInt, formatLongDate } from '../lib/format'
import { knowledgeCurve, paramsSourceOf } from '../lib/fsrsStats'
import { chart } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'
import { SourceBadge } from './ui'

const m = messages.activity

/** Cards you'd expect to remember on each past day. A model's estimate, so its lines are dashed. */
export function KnowledgeChart({ fsrs, decks }: { fsrs: FsrsData; decks: Deck[] }) {
  const deckColor = useDeckColor()
  const curve = useMemo(() => knowledgeCurve(fsrs.knowledge ?? []), [fsrs])
  if (curve.rows.length < 2) return null
  const shown = decks.filter((d) => curve.rows.some((r) => d.id in r))
  const first = String(curve.rows[0].date)
  const last = String(curve.rows[curve.rows.length - 1].date)
  const bucket = dayNumber(last) - dayNumber(first) > 180 ? 'month' : 'day'
  return (
    <Panel
      title={m.knowledgeTitle}
      eyebrow={m.knowledgeEyebrow}
      subtitle={`${m.knowledgeSub(curve.recalled, curve.started)}${paramsSourceOf(fsrs) === 'default' ? ` ${m.knowledgeDefault}` : ''}`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {shown.map((d) => (
            <LegendItem key={d.id} color={deckColor(d.id)} label={d.name} />
          ))}
          <SourceBadge kind="mixed" />
        </div>
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve.rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
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
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  title={typeof label === 'string' ? `${formatLongDate(label)}: ${m.knowledgeTooltip}` : ''}
                  rows={(payload ?? []).map((p) => ({
                    color: deckColor(String(p.dataKey)),
                    label: shown.find((d) => d.id === p.dataKey)?.name ?? String(p.dataKey),
                    value: formatInt(Number(p.value)),
                  }))}
                />
              )}
            />
            {shown.map((d) => (
              <Line key={d.id} dataKey={d.id} stroke={deckColor(d.id)} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
