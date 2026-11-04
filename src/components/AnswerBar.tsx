import { messages } from '../i18n'
import { formatInt } from '../lib/format'

const m = messages.answers

/**
 * How scheduled reviews were answered, as one stacked bar. Each part keeps a sliver of width and a count beside
 * it, so a handful of Again answers among hundreds stays visible and nothing relies on colour alone.
 */
export function AnswerBar({ again, hard, good }: { again: number; hard: number; good: number }) {
  const parts = [
    { label: m.good, value: good, color: 'var(--color-answer-good)' },
    { label: m.hard, value: hard, color: 'var(--color-answer-hard)' },
    { label: m.again, value: again, color: 'var(--color-answer-again)' },
  ]
  return (
    <div className="mt-2">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} className="animate-grow origin-left" style={{ flexGrow: p.value, flexBasis: 0, minWidth: 3, background: p.color }} />
          ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-ink-2">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="font-bold text-ink tabular-nums">{formatInt(p.value)}</span> {p.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
