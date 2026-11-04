import type { Deck } from '../data/types'
import { messages } from '../i18n'
import type { GardenBed, PlantStage } from '../lib/garden'

const m = messages.home.garden

/** One small plant. Stages differ by shape (sprout, flower), not only by colour. */
function PlantIcon({ stage, color }: { stage: PlantStage; color: string }) {
  return (
    <svg viewBox="0 0 24 30" width={22} height={28} aria-hidden>
      <ellipse cx={12} cy={27} rx={8} ry={2.5} fill="var(--color-surface-3)" />
      <path d="M12 27 V13" stroke="var(--color-good)" strokeWidth={2} strokeLinecap="round" />
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

/** A deck's studied cards as a bed of plants. */
export function GardenPlot({ deck, bed, color }: { deck: Deck; bed: GardenBed; color: string }) {
  return (
    <div
      role="img"
      aria-label={m.bedLabel(deck.name, bed.counts.flower, bed.counts.sprout, bed.counts.seed, bed.unit)}
      className="flex min-h-12 flex-wrap items-end gap-x-0.5 rounded-2xl bg-surface-2 px-2 pt-2 pb-1"
    >
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
  )
}

/** What the plants mean. One unit for every bed, so beds compare by eye. */
export function GardenLegend({ unit }: { unit: number }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {(['flower', 'sprout'] as const).map((s) => (
        <li key={s} className="inline-flex items-center gap-1">
          <PlantIcon stage={s} color="var(--color-brand)" />
          {m.stage[s]}
        </li>
      ))}
      <li className="text-muted">{m.unit(unit)}</li>
    </ul>
  )
}
