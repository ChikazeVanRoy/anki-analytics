import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRightIcon } from '../components/icons'
import { Mascot } from '../components/Mascot'
import { SourceBadge } from '../components/ui'
import type { AnkiData } from '../data/types'
import { LOCALE, messages } from '../i18n'
import { parseDateKey, toDateKey } from '../lib/dates'
import { formatInt, formatLongDate, formatMinutes, formatPct } from '../lib/format'
import { ankiToday } from '../lib/stats'
import { defaultMonth, monthWrapped, wrappedMonths } from '../lib/wrapped'
import { PageHeader } from './PageHeader'

const m = messages.wrapped
const monthName = (month: string) => parseDateKey(`${month}-01`).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })

function Slide({ tint, kicker, big, children }: { tint: string; kicker: string; big: string; children?: ReactNode }) {
  return (
    <section className="flex h-80 w-[85%] max-w-md shrink-0 snap-center flex-col justify-center rounded-3xl p-6 text-center" style={{ background: tint }}>
      <p className="text-sm font-extrabold tracking-wide text-ink-2 uppercase">{kicker}</p>
      <p className="mt-2 text-5xl font-black tracking-tight break-words text-ink">{big}</p>
      {children && <div className="mt-3 text-base font-semibold text-ink-2">{children}</div>}
    </section>
  )
}

/** Your month as cards to swipe through. */
export function WrappedPage({ data }: { data: AnkiData }) {
  const months = useMemo(() => wrappedMonths(data), [data])
  const todayKey = toDateKey(ankiToday(data))
  const [month, setMonth] = useState(() => defaultMonth(months, todayKey))
  const w = useMemo(() => (month ? monthWrapped(data, month, todayKey) : null), [data, month, todayKey])
  const strip = useRef<HTMLDivElement>(null)
  const move = (direction: 1 | -1) => strip.current?.scrollBy({ left: direction * strip.current.clientWidth * 0.8, behavior: 'smooth' })
  const deckName = data.decks.find((d) => d.id === w?.topDeck?.deckId)?.name
  const tough = data.source === 'anki' ? data.fsrs?.troubleCards?.[0] : undefined
  return (
    <div className="space-y-6">
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        badge={<SourceBadge kind={data.source === 'mock' ? 'sample' : 'measured'} />}
        actions={
          months.length > 0 && (
            <label className="text-sm font-semibold text-ink-2">
              <span className="sr-only">{m.month}</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-line bg-surface-2 px-3 py-2 font-bold text-ink">
                {months.map((x) => (
                  <option key={x} value={x}>
                    {monthName(x)}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      {!w ? (
        <p className="text-sm text-muted">{m.empty}</p>
      ) : (
        <>
          <div ref={strip} tabIndex={0} aria-label={m.stripLabel} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
            <Slide tint="linear-gradient(135deg, var(--color-hero-from), var(--color-hero-to))" kicker={monthName(w.month)} big={formatInt(w.reviews)}>
              {m.reviews}
              {w.change !== null && <p className="mt-1 text-sm">{m.change(formatPct(Math.abs(w.change), 0), w.change >= 0)}</p>}
            </Slide>
            <Slide tint="var(--color-sun-soft)" kicker={m.time} big={formatMinutes(Math.round(w.minutes))}>
              {m.days(w.days)}
            </Slide>
            <Slide tint="var(--color-good-soft)" kicker={m.run} big={m.runDays(w.bestRun)} />
            <Slide tint="var(--color-brand-soft)" kicker={m.busiest} big={formatInt(w.busiest.reviews)}>
              {formatLongDate(w.busiest.date)}
            </Slide>
            {w.topDeck && deckName && (
              <Slide tint="var(--color-sun-soft)" kicker={m.topDeck} big={deckName}>
                {m.topDeckSub(w.topDeck.reviews)}
              </Slide>
            )}
            {tough && (
              <Slide tint="var(--color-good-soft)" kicker={m.tough} big={tough.front || m.toughNoText}>
                {m.toughSub}
              </Slide>
            )}
            <section className="flex h-80 w-[85%] max-w-md shrink-0 snap-center flex-col items-center justify-center rounded-3xl bg-surface-2 p-6 text-center">
              <Mascot mood="cheer" size={96} />
              <p className="mt-3 text-xl font-black text-ink">{m.closing}</p>
            </section>
          </div>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => move(-1)} aria-label={m.previous} className="btn-3d">
              <ArrowRightIcon size={18} className="rotate-180" />
            </button>
            <button type="button" onClick={() => move(1)} aria-label={m.next} className="btn-3d">
              <ArrowRightIcon size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
