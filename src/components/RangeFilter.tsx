import { messages } from '../i18n'
import { RANGE_OPTIONS, type RangeKey } from '../lib/stats'

interface RangeFilterProps {
  value: RangeKey
  onChange: (value: RangeKey) => void
}

/** Segmented control for the time range (7d … All). */
export function RangeFilter({ value, onChange }: RangeFilterProps) {
  return (
    <div role="radiogroup" aria-label={messages.activity.rangeLabel} className="inline-flex rounded-2xl bg-surface-2 p-1">
      {RANGE_OPTIONS.map((option) => {
        const selected = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.description}
            onClick={() => onChange(option.key)}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${
              selected ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
