import { useMemo } from 'react'
import type { Deck } from '../data/types'
import { messages } from '../i18n'
import { gardenBed, plantUnit, type GardenBed, type PlantStage } from '../lib/garden'
import { deckColor } from '../lib/theme'
import { SourceBadge } from './ui'

const m = messages.home.garden

/** One small plant. Stages differ by shape (mound, sprout, flower), not only by colour. */
function PlantIcon({ stage, color }: { stage: PlantStage | 'seed'; color: string }) {
  return (
    <svg viewBox="0 0 24 30" width={22} height={28} aria-hidden>
      <ellipse cx={12} cy={27} rx={8} ry={2.5} fill="var(--color-surface-3)" />
      {stage === 'seed' && <ellipse cx={12} cy={24.5} rx={3} ry={2.2} fill="var(--color-muted)" opacity={0.7} />}
      {stage !== 'seed' && <path d="M12 27 V13" stroke="var(--color-good)" strokeWidth={2} strokeLinecap="round" />}
      {stage === 'sprout' && (
        <>
          <path d="M12 19 C7 19 5 15 5 13 C9 13 12 15 12 19 Z" fill="var(--color-good)" />
          <path d="M12 16 C16 16 19 13 19 10 C15 10 12 12 12 16 Z" fill="var(--color-good)" opacity={0.8} />
        </>
      )}
      {stage === 'flower' && (
        <>
          <path d="M12 22 C8 22 6 19 6 17 C9 17 12 19 12 22 Z" fill="var(--color-good)" />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={12} cy={6.5} rx={2.6} ry={3.6} fill={color} transform={`rotate(${a} 12 10)`} />
          ))}
          <circle cx={12} cy={10} r={2.4} fill="var(--color-sun)" />
        </>
      )}
    </svg>
  )
}

function Bed({ deck, bed }: { deck: Deck; bed: GardenBed }) {
  const color = deckColor(deck.id)
  const label = m.bedLabel(deck.name, bed.counts.flower, bed.counts.sprout, bed.counts.seed, bed.unit)
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="inline-flex items-center gap-2 font-extrabold text-ink">
          <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
          {deck.name}
        </span>
        <span className="text-xs text-muted">{m.bloom(bed.counts.flower, deck.totalCards)}</span>
      </figcaption>
      <div role="img" aria-label={label} className="flex min-h-12 flex-wrap items-end gap-x-0.5 rounded-2xl bg-surface-2 px-2 pt-2 pb-1">
        {bed.plants.length === 0 && <p className="self-center px-1 text-xs text-muted">{m.empty}</p>}
        {bed.plants.map((p, i) => (
          <span
            key={i}
            className="animate-pop inline-block origin-bottom"
            style={{
              transform: `translateY(${p.lift}px) rotate(${p.tilt}deg) scale(${p.scale})`,
              animationDelay: `${Math.min(i * 12, 600)}ms`,
            }}
          >
            <PlantIcon stage={p.stage} color={color} />
          </span>
        ))}
      </div>
      {bed.counts.seed > 0 && (
        <p className="mt-1.5 inline-flex items-center text-xs text-ink-2" aria-hidden>
          <PlantIcon stage="seed" color={color} />
          {m.seeds(bed.counts.seed)}
        </p>
      )}
    </figure>
  )
}

export function MemoryGarden({ decks, sample }: { decks: Deck[]; sample: boolean }) {
  const unit = useMemo(() => plantUnit(decks, 60), [decks])
  const beds = useMemo(() => decks.map((d) => ({ deck: d, bed: gardenBed(d, unit) })), [decks, unit])
  return (
    <section aria-labelledby="home-garden" className="animate-rise rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted uppercase">{m.eyebrow}</p>
          <h2 id="home-garden" className="text-lg font-extrabold tracking-tight text-ink">
            {m.title}
          </h2>
        </div>
        <SourceBadge kind={sample ? 'sample' : 'measured'} />
      </div>

      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        {(['flower', 'sprout'] as const).map((s) => (
          <li key={s} className="inline-flex items-center gap-1">
            <PlantIcon stage={s} color="var(--color-brand)" />
            {m.stage[s]}
          </li>
        ))}
        <li className="text-muted">{m.unit(unit)}</li>
      </ul>

      <div className={`mt-4 grid gap-5 ${beds.length >= 3 ? 'md:grid-cols-3' : beds.length === 2 ? 'md:grid-cols-2' : ''}`}>
        {beds.map(({ deck, bed }) => (
          <Bed key={deck.id} deck={deck} bed={bed} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{m.note}</p>
    </section>
  )
}
