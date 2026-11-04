import { useDeckColor } from '../data/deckColors'
import type { Deck } from '../data/types'
import { messages } from '../i18n'
import { formatInt } from '../lib/format'
import { journey } from '../lib/journey'
import { Mascot } from './Mascot'
import { SourceBadge } from './ui'

const m = messages.home.journey

/** Stops sit high and low in turn, so the road winds. */
const stopY = (i: number) => (i % 2 ? 72 : 28)

function Road({ deck }: { deck: Deck }) {
  const deckColor = useDeckColor()
  const j = journey(deck)
  const color = deckColor(deck.id)
  const last = j.stops.length - 1
  const x = (i: number) => (last > 0 ? 6 + (88 * i) / last : 50)
  const points = j.stops.map((_, i) => ({ x: x(i), y: stopY(i) }))
  const road = points.reduce((d, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`
    const mid = (points[i - 1].x + p.x) / 2
    return `${d} C${mid} ${points[i - 1].y} ${mid} ${p.y} ${p.x} ${p.y}`
  }, '')
  // The marker stands between the two stops it's between, on the straight line joining them
  const along = j.position * last
  const from = Math.min(Math.floor(along), Math.max(last - 1, 0))
  const t = along - from
  const here = points[from + 1] ? { x: points[from].x + (points[from + 1].x - points[from].x) * t, y: points[from].y + (points[from + 1].y - points[from].y) * t } : points[from]
  return (
    <article className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-extrabold text-ink">{deck.name}</h3>
        <p className="text-xs text-ink-2">{j.toNext > 0 ? m.toNext(j.toNext) : m.finished}</p>
      </div>
      <div className="relative mt-6 h-32" role="img" aria-label={m.label(deck.name, j.started, j.total, j.toNext)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <path d={road} fill="none" stroke="var(--color-surface-3)" strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={road} fill="none" stroke={color} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {j.stops.map((s, i) => (
          <span
            key={s.at}
            className={`absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] bg-surface text-[11px] font-black text-ink tabular-nums ${s.reached ? '' : 'border-line'}`}
            style={{ left: `${points[i].x}%`, top: `${points[i].y}%`, borderColor: s.reached ? color : undefined }}
            aria-hidden
          >
            {s.finish ? '🏁' : formatInt(s.at)}
          </span>
        ))}
        <span className="absolute z-10 -translate-x-1/2 -translate-y-[150%]" style={{ left: `${here.x}%`, top: `${here.y}%` }} aria-hidden>
          <Mascot mood="happy" size={30} />
        </span>
      </div>
    </article>
  )
}

export function JourneyMap({ decks, sample }: { decks: Deck[]; sample: boolean }) {
  return (
    <section aria-labelledby="home-journey" className="animate-rise">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 id="home-journey" className="text-xl font-black tracking-tight text-ink">
          {m.title}
        </h2>
        <p className="text-sm text-muted">{m.question}</p>
        {sample && <SourceBadge kind="sample" />}
      </div>
      <div className={`grid gap-4 ${decks.length >= 2 ? 'md:grid-cols-2' : ''}`}>
        {decks.map((d) => (
          <Road key={d.id} deck={d} />
        ))}
      </div>
    </section>
  )
}
