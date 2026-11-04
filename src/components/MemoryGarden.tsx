import { useState, type KeyboardEvent } from 'react'
import type { Deck } from '../data/types'
import { messages } from '../i18n'
import { formatRate } from '../lib/format'
import type { GardenBed, Plant, PlantStage } from '../lib/garden'

const m = messages.home.garden

/** One small plant. Stages differ by shape, not only by colour. */
function PlantIcon({ stage, color }: { stage: PlantStage; color: string }) {
  const leaf = stage === 'wilt' ? 'var(--color-warning)' : 'var(--color-good)'
  return (
    <svg viewBox="0 0 24 30" width={22} height={28} aria-hidden>
      <ellipse cx={12} cy={27} rx={8} ry={2.5} fill="var(--color-surface-3)" />
      {stage === 'wilt' ? (
        <>
          <path d="M12 27 C12 19 13 14 19 13" stroke={leaf} strokeWidth={2} strokeLinecap="round" fill="none" />
          <path d="M19 13 C22 15 22 20 20 22 C17 20 17 15 19 13 Z" fill={leaf} />
          <path d="M12 22 C9 22 6 24 5 27 C8 27 11 26 12 22 Z" fill={leaf} opacity={0.8} />
        </>
      ) : (
        <path d="M12 27 V13" stroke={leaf} strokeWidth={2} strokeLinecap="round" />
      )}
      {stage === 'sprout' && (
        <>
          <path d="M12 19 C7 19 5 15 5 13 C9 13 12 15 12 19 Z" fill={leaf} />
          <path d="M12 16 C16 16 19 13 19 10 C15 10 12 12 12 16 Z" fill={leaf} opacity={0.8} />
        </>
      )}
      {stage === 'bud' && (
        <>
          <path d="M12 22 C8 22 6 19 6 17 C9 17 12 19 12 22 Z" fill={leaf} />
          <path d="M12 4 C16 8 16 13 12 15 C8 13 8 8 12 4 Z" fill={color} />
          <path d="M8.5 13 C10 16 14 16 15.5 13 C14 14 10 14 8.5 13 Z" fill={leaf} />
        </>
      )}
      {stage === 'flower' && (
        <>
          <path d="M12 22 C8 22 6 19 6 17 C9 17 12 19 12 22 Z" fill={leaf} />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={12} cy={6.5} rx={2.6} ry={3.6} fill={color} transform={`rotate(${a} 12 10)`} />
          ))}
          <circle cx={12} cy={10} r={2.4} fill="var(--color-sun)" />
        </>
      )}
    </svg>
  )
}

function describe(p: Plant, unit: number) {
  if (!p.card) return m.stage[p.stage]
  const { front, recall, dueIn } = p.card
  return m.plantGroup(m.plant(front || m.plantNoText, m.living[p.stage], formatRate(recall), dueIn <= 0 ? m.dueNow : m.dueIn(dueIn)), unit)
}

/** A deck's studied cards as a bed of plants. One tab stop: tap, hover or the arrow keys pick the plant to read. */
export function GardenPlot({ deck, bed, color }: { deck: Deck; bed: GardenBed; color: string }) {
  const [picked, setPicked] = useState<number | null>(null)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return setPicked(null)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step || !bed.plants.length) return
    e.preventDefault()
    setPicked((p) => Math.max(0, Math.min(bed.plants.length - 1, (p ?? -1) + step)))
  }
  return (
    <div>
      <div
        role="group"
        tabIndex={bed.plants.length ? 0 : undefined}
        onKeyDown={onKey}
        aria-label={m.bedLabel(deck.name, bed.counts, bed.unit)}
        className="flex min-h-14 flex-wrap items-end gap-x-0.5 rounded-2xl px-2 pt-3 pb-1"
        style={{ background: 'linear-gradient(180deg, var(--color-brand-soft), var(--color-good-soft))' }}
      >
        {bed.plants.length === 0 && <p className="self-center px-1 text-xs text-muted">{m.empty}</p>}
        {bed.plants.map((p, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => setPicked(i)}
            className={`animate-pop inline-block origin-bottom cursor-pointer rounded-lg transition-transform hover:scale-125 ${picked === i ? 'bg-surface/70 ring-2 ring-brand' : ''}`}
            style={{
              transform: `translateY(${p.lift}px) rotate(${p.tilt}deg) scale(${p.scale})`,
              animationDelay: `${Math.min(i * 12, 600)}ms`,
            }}
          >
            <PlantIcon stage={p.stage} color={color} />
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-1.5 min-h-8 text-xs font-semibold text-ink-2">
        {picked !== null && bed.plants[picked] ? describe(bed.plants[picked], bed.unit) : bed.plants.length > 0 && <span className="font-normal text-muted">{m.hint}</span>}
      </p>
      {bed.counts.wilt > 0 && <p className="text-xs font-bold text-warning">{m.thirsty(bed.counts.wilt)}</p>}
    </div>
  )
}

/** What the plants mean. One unit for every bed, so beds compare by eye. */
export function GardenLegend({ unit, living = false }: { unit: number; living?: boolean }) {
  const stages: PlantStage[] = living ? ['flower', 'bud', 'sprout', 'wilt'] : ['flower', 'sprout']
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {stages.map((s) => (
        <li key={s} className="inline-flex items-center gap-1">
          <PlantIcon stage={s} color="var(--color-brand)" />
          {(living ? m.living : m.stage)[s]}
        </li>
      ))}
      <li className="text-muted">{m.unit(unit)}</li>
    </ul>
  )
}
