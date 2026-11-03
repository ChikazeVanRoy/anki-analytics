import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatInt, formatLongDate } from '../lib/format'
import { buildWeeks, level, thresholds, type HeatCell, type HeatmapView } from '../lib/heatmap'
import type { DayTotal } from '../lib/stats'
import { heatmapLevels } from '../lib/theme'
import { Panel } from './Panel'

const CELL = 12
const GAP = 3
const STEP = CELL + GAP
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface ActivityHeatmapProps {
  byDate: Map<string, DayTotal>
  today: Date
  /** Years with reviews, newest first. */
  years: number[]
}

export function ActivityHeatmap({ byDate, today, years }: ActivityHeatmapProps) {
  const [view, setView] = useState<HeatmapView>('last12')
  const weeks = useMemo(() => buildWeeks(byDate, view, today), [byDate, view, today])
  const cells = weeks.flat().filter((c): c is HeatCell => c !== null)
  const t = thresholds(cells.map((c) => c.reviews))
  const total = cells.reduce((n, c) => n + c.reviews, 0)
  const activeDays = cells.filter((c) => c.reviews > 0).length

  const [hover, setHover] = useState<{ cell: HeatCell; x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // On narrow screens the grid scrolls horizontally; show the most recent weeks first.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [view])

  // Label the first column of each month (by the month of the column's first visible day)
  const monthLabels: { i: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const first = week.find((c) => c !== null)
    const month = first ? Number(first.date.slice(5, 7)) - 1 : -1
    if (first && month !== lastMonth) {
      monthLabels.push({ i, label: MONTHS[month] })
      lastMonth = month
    }
  })

  const width = weeks.length * STEP - GAP
  const period = view === 'last12' ? 'over the last year' : `in ${view}`
  const views: HeatmapView[] = ['last12', ...years]

  return (
    <Panel
      title="When did I study?"
      eyebrow="Study calendar"
      subtitle={`${formatInt(total)} reviews ${period} · ${activeDays} active days`}
      actions={
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted" aria-hidden>
          Less
          {heatmapLevels.map((c) => (
            <span key={c} className="rounded-[4px]" style={{ width: CELL, height: CELL, background: c }} />
          ))}
          More
        </div>
      }
    >
      <div role="radiogroup" aria-label="Heatmap period" className="-mt-1 mb-4 flex flex-wrap gap-1.5">
        {views.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === view}
            onClick={() => setView(v)}
            className={`rounded-xl px-3 py-1 text-xs font-bold transition-colors ${
              v === view ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {v === 'last12' ? 'Last 12 months' : v}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="relative overflow-x-auto pb-1">
        <div className="relative flex gap-2" style={{ width: width + 32 }}>
          <div className="flex flex-col pt-5 text-[10px] text-muted" style={{ gap: GAP, width: 24 }} aria-hidden>
            {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
              <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>
                {d}
              </span>
            ))}
          </div>
          <div className="relative">
            <div className="relative mb-2 h-3 text-[10px] text-muted" aria-hidden>
              {monthLabels.map(({ i, label }) => (
                <span key={i} className="absolute" style={{ left: i * STEP }}>
                  {label}
                </span>
              ))}
            </div>
            <div className="flex" style={{ gap: GAP }} role="grid" aria-label={`Daily reviews ${period}`}>
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }} role="row">
                  {week.map((cell, d) =>
                    cell ? (
                      <div
                        key={d}
                        role="gridcell"
                        aria-label={`${formatLongDate(cell.date)}: ${cell.reviews} reviews`}
                        className="rounded-[4px] outline-offset-1 transition-transform hover:scale-125 hover:outline-2 hover:outline-brand"
                        style={{ width: CELL, height: CELL, background: heatmapLevels[level(cell.reviews, t)] }}
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setHover({ cell, x: r.left + r.width / 2, y: r.top })
                        }}
                        onMouseLeave={() => setHover(null)}
                      />
                    ) : (
                      <div key={d} style={{ width: CELL, height: CELL }} />
                    ),
                  )}
                </div>
              ))}
            </div>
            {hover && (
              <div
                className="pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-1.5 text-xs whitespace-nowrap shadow-pop"
                style={{ left: Math.min(Math.max(hover.x, 120), window.innerWidth - 120), top: hover.y - 6 }}
              >
                <span className="font-bold text-ink">{formatInt(hover.cell.reviews)} reviews</span>
                <span className="text-muted"> · {formatLongDate(hover.cell.date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}
