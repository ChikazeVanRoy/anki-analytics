import { RANGE_OPTIONS, type RangeKey } from '../lib/stats'

interface RangeFilterProps {
  value: RangeKey
  onChange: (value: RangeKey) => void
}

/** Segmented control for the time range (7d … All). */
export function RangeFilter({ value, onChange }: RangeFilterProps) {
  return (
    <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-lg border border-line bg-surface p-1">
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
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              selected ? 'bg-surface-2 text-ink shadow-sm' : 'text-muted hover:text-ink-2'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
