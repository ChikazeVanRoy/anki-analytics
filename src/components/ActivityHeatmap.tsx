import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { messages } from '../i18n'
import { formatInt, formatLongDate, formatShortDate } from '../lib/format'
import { buildWeeks, lastWeekPage, level, replayStarts, revealedAt, runningTotals, thresholds, weeksThatFit, weekWindow, type HeatCell, type HeatmapView } from '../lib/heatmap'
import { prefersReducedMotion } from '../lib/motion'
import type { DayTotal } from '../lib/stats'
import { heatmapLevels } from '../lib/theme'
import { ChevronIcon, PlayIcon, StopIcon } from './icons'
import { Panel } from './Panel'

const CELL = 12
const GAP = 3
const STEP = CELL + GAP
const LABELS = 32 // weekday labels and the gap after them
const REPLAY_MS = 3200
const m = messages.activity
const PAGE_BUTTON =
  'inline-flex items-center gap-1 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-ink-2 transition-colors hover:bg-brand-soft hover:text-brand-strong disabled:opacity-40'
const c = m.calendar

interface ActivityHeatmapProps {
  byDate: Map<string, DayTotal>
  today: Date
  /** Years with reviews, newest first. */
  years: number[]
}

export function ActivityHeatmap({ byDate, today, years }: ActivityHeatmapProps) {
  const [view, setView] = useState<HeatmapView>('last12')
  const allWeeks = useMemo(() => buildWeeks(byDate, view, today), [byDate, view, today])

  // As many weeks as fit, with no sideways scrolling; Earlier and Later page through the rest
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(Infinity)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [page, setPage] = useState(0)
  const capacity = weeksThatFit(width, STEP, GAP, LABELS)
  const { weeks, older, newer } = useMemo(() => weekWindow(allWeeks, capacity, page), [allWeeks, capacity, page])
  const cells = useMemo(() => weeks.flat().filter((c): c is HeatCell => c !== null), [weeks])
  const paged = older || newer

  // Memoized: the replay re-renders on every animation frame
  const { t, total, activeDays } = useMemo(
    () => ({
      // Colours come from the whole view, so a day keeps its shade on every page
      t: thresholds(allWeeks.flat().flatMap((c) => (c ? [c.reviews] : []))),
      total: cells.reduce((n, c) => n + c.reviews, 0),
      activeDays: cells.filter((c) => c.reviews > 0).length,
    }),
    [allWeeks, cells],
  )

  // Replay: fill the calendar day by day, oldest first. `shown` is how many days are revealed (null = all).
  const [reduced] = useState(prefersReducedMotion)
  const [shown, setShown] = useState<number | null>(null)
  const running = useMemo(() => runningTotals(cells), [cells])
  const starts = useMemo(() => replayStarts(cells), [cells])
  const order = useMemo(() => new Map(cells.map((c, i) => [c.date, i])), [cells])
  // Date formatting is slow; done once per view, not on every replay frame
  const dateLabels = useMemo(() => new Map(cells.map((c) => [c.date, formatLongDate(c.date)])), [cells])
  const playing = shown !== null
  useEffect(() => {
    if (!playing) return
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / REPLAY_MS)
      setShown(revealedAt(starts, p))
      if (p < 1) frame = requestAnimationFrame(tick)
      else setShown(null)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, starts])
  const changeView = (v: HeatmapView) => {
    setShown(null)
    setPage(0)
    setView(v)
  }
  const turnPage = (by: number) => {
    setShown(null)
    // A wider window has fewer pages, so a page kept from before can be past the end
    setPage(Math.min(page, lastWeekPage(allWeeks.length, capacity)) + by)
  }
  const replayDay = playing && shown > 0 ? cells[shown - 1] : null

  const [hover, setHover] = useState<{ cell: HeatCell; x: number; y: number } | null>(null)

  // Label the first column of each month (by the month of the column's first visible day)
  const monthLabels: { i: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, i) => {
    const first = week.find((c) => c !== null)
    const month = first ? Number(first.date.slice(5, 7)) - 1 : -1
    if (first && month !== lastMonth) {
      monthLabels.push({ i, label: c.months[month] })
      lastMonth = month
    }
  })

  const gridWidth = weeks.length * STEP - GAP
  const range = cells.length ? m.calendarRange(formatShortDate(cells[0].date), formatShortDate(cells[cells.length - 1].date)) : ''
  const period = paged ? c.from(range) : view === 'last12' ? c.overLastYear : c.inYear(view)
  const views: HeatmapView[] = ['last12', ...years]

  return (
    <Panel
      title={c.title}
      eyebrow={c.eyebrow}
      subtitle={
        replayDay ? (
          <span>
            <span className="font-bold text-ink tabular-nums">{formatInt(running[shown! - 1])}</span>{' '}
            {m.replayTotal(dateLabels.get(replayDay.date)!)}
          </span>
        ) : (
          c.summary(total, period, activeDays)
        )
      }
      actions={
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted" aria-hidden>
          {c.less}
          {heatmapLevels.map((c) => (
            <span key={c} className="rounded-[4px]" style={{ width: CELL, height: CELL, background: c }} />
          ))}
          {c.more}
        </div>
      }
    >
      <div className="-mt-1 mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label={c.viewLabel} className="flex flex-wrap gap-1.5">
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={v === view}
              onClick={() => changeView(v)}
              className={`rounded-xl px-3 py-1 text-xs font-bold transition-colors ${
                v === view ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {v === 'last12' ? c.last12 : v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {paged && (
            <>
              <button type="button" disabled={!older} onClick={() => turnPage(1)} className={PAGE_BUTTON}>
                <ChevronIcon size={14} className="rotate-180" /> {m.earlier}
              </button>
              <button type="button" disabled={!newer} onClick={() => turnPage(-1)} className={PAGE_BUTTON}>
                {m.later} <ChevronIcon size={14} />
              </button>
            </>
          )}
          {!reduced && total > 0 && (
            <button type="button" onClick={() => setShown(playing ? null : 0)} className={PAGE_BUTTON}>
              {playing ? <StopIcon size={14} /> : <PlayIcon size={14} />}
              {playing ? m.stopReplay : m.replay}
            </button>
          )}
        </div>
      </div>

      <div ref={boxRef} className="relative pb-1">
        <div className="relative flex gap-2" style={{ width: gridWidth + LABELS }}>
          <div className="flex flex-col pt-5 text-[10px] text-muted" style={{ gap: GAP, width: 24 }} aria-hidden>
            {c.weekdays.map((d, i) => (
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
            <div className="flex" style={{ gap: GAP }} role="grid" aria-label={c.gridLabel(period)}>
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }} role="row">
                  {week.map((cell, d) =>
                    cell ? (
                      <div
                        key={d}
                        role="gridcell"
                        aria-label={c.cell(dateLabels.get(cell.date)!, cell.reviews)}
                        className="rounded-[4px] outline-offset-1 transition-transform hover:scale-125 hover:outline-2 hover:outline-brand"
                        style={{
                          width: CELL,
                          height: CELL,
                          background: heatmapLevels[playing && order.get(cell.date)! >= shown ? 0 : level(cell.reviews, t)],
                        }}
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
            {/* No tooltip mid-replay: it would show counts for days the replay hasn't reached */}
            {hover && !playing && (
              <div
                className="pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-1.5 text-xs whitespace-nowrap shadow-pop"
                style={{ left: Math.min(Math.max(hover.x, 120), window.innerWidth - 120), top: hover.y - 6 }}
              >
                <span className="font-bold text-ink">{c.tip(hover.cell.reviews)}</span>
                <span className="text-muted"> · {formatLongDate(hover.cell.date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}
