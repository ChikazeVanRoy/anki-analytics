import { useId, useState } from 'react'
import { useDeckColor } from '../data/deckColors'
import type { Deck } from '../data/types'
import { LOCALE, messages } from '../i18n'
import { parseDateKey } from '../lib/dates'
import { finishAtDailyNumber, type DeckNewCards } from '../lib/deckPace'
import { formatInt, formatPct } from '../lib/format'
import { journey, pointOnRoad, roadPath, shownProgress } from '../lib/journey'
import { Mascot } from './Mascot'
import { InfoTip, SourceBadge } from './ui'

const m = messages.home.journey

/** Stops sit high and low in turn, so the road winds. */
const stopY = (i: number) => (i % 2 ? 72 : 28)

const storeKey = (deckId: string) => `anki-analytics:new-per-day:${deckId}`

/** Only a convenience: without storage the number simply isn't remembered, and anything unusable is ignored. */
function remembered(deckId: string): string | null {
  try {
    const saved = localStorage.getItem(storeKey(deckId))
    return saved && validPerDay(saved) ? saved : null
  } catch {
    return null
  }
}
function remember(deckId: string, perDay: string | null) {
  try {
    if (perDay === null) localStorage.removeItem(storeKey(deckId))
    else localStorage.setItem(storeKey(deckId), perDay)
  } catch {
    // storage unavailable: nothing to do
  }
}

const validPerDay = (value: string) => /^\d+$/.test(value) && Number(value) > 0

function FinishLine({ deckId, cards, studyDays, today }: { deckId: string; cards: DeckNewCards; studyDays: number; today: Date }) {
  const field = useId()
  // Null follows Anki's limit, so a later change there shows up here
  const [chosen, setChosen] = useState(() => remembered(deckId))
  const shown = chosen ?? (cards.limit > 0 ? String(cards.limit) : '')
  const perDay = validPerDay(shown) ? Number(shown) : 0
  const date = finishAtDailyNumber(cards, perDay, studyDays, today)
  const change = (value: string) => {
    const next = cards.limit > 0 && Number(value) === cards.limit ? null : value
    setChosen(next)
    if (next === null || validPerDay(next)) remember(deckId, next)
  }
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceBadge kind="projection" />
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {chosen !== null && cards.limit > 0 && Number(chosen) !== cards.limit && (
            <button type="button" onClick={() => change(String(cards.limit))} className="text-xs font-bold text-ink-2 underline">
              {m.useAnki(cards.limit)}
            </button>
          )}
          <label htmlFor={field} className="text-xs font-bold text-ink-2">
            {m.perDay}
          </label>
          <input
            id={field}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={shown}
            onChange={(e) => change(e.target.value)}
            className="w-20 rounded-xl border border-line bg-surface-2 px-2 py-1 text-right text-base font-bold text-ink tabular-nums"
          />
        </div>
      </div>
      <div role="status" className="mt-1.5 text-sm text-ink-2">
        {date ? (
          <p className="font-semibold">
            {m.finish(parseDateKey(date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }))}
            <InfoTip label={m.finishTipLabel}>{m.finishTip(perDay, cards.remaining, studyDays)}</InfoTip>
          </p>
        ) : (
          <p>{m.finishNeedsPace}</p>
        )}
      </div>
    </div>
  )
}

function Road({ deck, cards, studyDays, today }: { deck: Deck; cards: DeckNewCards | null; studyDays: number; today: Date }) {
  const deckColor = useDeckColor()
  const clip = useId()
  const j = journey(deck)
  const color = deckColor(deck.id)
  // Across the road, left to right, so distance on screen is distance through the deck
  const roadX = (share: number) => (j.stops.length > 1 ? 6 + 88 * share : 50)
  const points = j.stops.map((s, i) => ({ x: roadX(s.share), y: stopY(i) }))
  const road = roadPath(points)
  const here = pointOnRoad(points, roadX(j.progress))
  const shown = shownProgress(j)
  return (
    <article className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-extrabold text-ink">{deck.name}</h3>
        <p className="text-xs text-ink-2">{j.toGo > 0 ? m.share(formatPct(shown, shown < 0.1 ? 1 : 0)) : j.total > 0 ? m.finished : m.noCards}</p>
      </div>
      <div className="relative mt-6 h-32" role="img" aria-label={m.label(deck.name, j.started, j.total, j.toGo)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <clipPath id={clip}>
            <rect width={here.x} height={100} />
          </clipPath>
          <path d={road} fill="none" stroke="var(--color-surface-3)" strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={road} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${clip})`} />
          <path d={road} fill="none" stroke={color} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {j.stops.map((s, i) => (
          <span
            key={s.at}
            className={`absolute grid h-9 min-w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] bg-surface px-1 text-[11px] font-black text-ink tabular-nums ${s.reached ? '' : 'border-line'}`}
            style={{ left: `${points[i].x}%`, top: `${points[i].y}%`, borderColor: s.reached ? color : undefined }}
            aria-hidden
          >
            {formatInt(s.at)}
          </span>
        ))}
        <span className="absolute z-10 -translate-x-1/2 -translate-y-[150%]" style={{ left: `${here.x}%`, top: `${here.y}%` }} aria-hidden>
          <Mascot mood="happy" size={30} />
        </span>
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs font-bold text-muted">{m.started}</dt>
          <dd className="text-xl font-extrabold text-ink tabular-nums">{formatInt(j.started)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-xs font-bold text-muted">{m.toGo}</dt>
          <dd className="text-xl font-extrabold text-ink tabular-nums">{formatInt(j.toGo)}</dd>
        </div>
      </dl>
      {cards && cards.remaining > 0 && <FinishLine deckId={deck.id} cards={cards} studyDays={studyDays} today={today} />}
    </article>
  )
}

interface Props {
  trips: { deck: Deck; cards: DeckNewCards | null }[]
  studyDays: number
  today: Date
  sample: boolean
}

export function JourneyMap({ trips, studyDays, today, sample }: Props) {
  return (
    <section aria-labelledby="home-journey" className="animate-rise">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 id="home-journey" className="text-xl font-black tracking-tight text-ink">
          {m.title}
        </h2>
        <p className="text-sm text-muted">{m.question}</p>
        {sample && <SourceBadge kind="sample" />}
      </div>
      <div className={`grid gap-4 ${trips.length >= 2 ? 'md:grid-cols-2' : ''}`}>
        {trips.map((t) => (
          <Road key={t.deck.id} deck={t.deck} cards={t.cards} studyDays={studyDays} today={today} />
        ))}
      </div>
    </section>
  )
}
