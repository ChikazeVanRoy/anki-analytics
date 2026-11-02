import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DayTotal } from '../lib/stats'
import { toDateKey } from '../lib/stats'
import { formatInt, formatLongDate } from '../lib/format'
import { heatmapLevels } from '../lib/theme'
import { Panel } from './Panel'

const CELL = 12
const GAP = 3
const STEP = CELL + GAP
const WEEKS = 53
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Cell {
  date: string
  reviews: number
}

/** Columns of weeks (Mon->Sun) ending with the current week. Future days are null. */
function buildWeeks(byDate: Map<string, DayTotal>, today = new Date()): (Cell | null)[][] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const mondayOffset = (end.getDay() + 6) % 7 // 0 = Monday
  const start = new Date(end)
  start.setDate(end.getDate() - mondayOffset - (WEEKS - 1) * 7)

  const weeks: (Cell | null)[][] = []
  const d = new Date(start)
  for (let w = 0; w < WEEKS; w++) {
    const week: (Cell | null)[] = []
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(d)
      week.push(d > end ? null : { date: key, reviews: byDate.get(key)?.reviews ?? 0 })
      d.setDate(d.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** Quartile thresholds over active days, so the scale adapts to your own volume. */
function thresholds(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return [1, 1, 1]
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))]
  return [q(0.25), q(0.5), q(0.75)]
}

function level(reviews: number, t: number[]): number {
  if (reviews === 0) return 0
  if (reviews <= t[0]) return 1
  if (reviews <= t[1]) return 2
  if (reviews <= t[2]) return 3
  return 4
}

export function ActivityHeatmap({ byDate, today }: { byDate: Map<string, DayTotal>; today: Date }) {
  const weeks = useMemo(() => buildWeeks(byDate, today), [byDate, today])
  const cells = weeks.flat().filter((c): c is Cell => c !== null)
  const t = thresholds(cells.map((c) => c.reviews))
  const total = cells.reduce((n, c) => n + c.reviews, 0)
  const activeDays = cells.filter((c) => c.reviews > 0).length

  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // On narrow screens the grid scrolls horizontally; start at the most recent week.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const monthLabels = weeks.flatMap((week, i) => {
    const first = week.find((c) => c !== null)
    if (!first) return []
    const day = Number(first.date.slice(8))
    // Label a column when a new month starts within its first week
    if (i === 0 || day <= 7) return [{ i, label: MONTHS[Number(first.date.slice(5, 7)) - 1] }]
    return []
  })

  const width = WEEKS * STEP - GAP

  return (
    <Panel
      title="Study activity"
      subtitle={`${formatInt(total)} reviews over the last year · ${activeDays} active days`}
      actions={
        <div className="flex items-center gap-1.5 text-xs text-muted" aria-hidden>
          Less
          {heatmapLevels.map((c) => (
            <span key={c} className="rounded-[3px]" style={{ width: CELL, height: CELL, background: c }} />
          ))}
          More
        </div>
      }
    >
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
            <div className="flex" style={{ gap: GAP }} role="grid" aria-label="Daily reviews over the last year">
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }} role="row">
                  {week.map((cell, d) =>
                    cell ? (
                      <div
                        key={d}
                        role="gridcell"
                        aria-label={`${formatLongDate(cell.date)}: ${cell.reviews} reviews`}
                        className="rounded-[3px] outline-offset-1 hover:outline hover:outline-ink-2"
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
                className="pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
                style={{ left: Math.min(Math.max(hover.x, 120), window.innerWidth - 120), top: hover.y - 6 }}
              >
                <span className="font-semibold text-ink">{formatInt(hover.cell.reviews)} reviews</span>
                <span className="text-muted"> · {formatLongDate(hover.cell.date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}
