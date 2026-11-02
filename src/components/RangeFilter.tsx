import { RANGE_OPTIONS, type RangeDays } from '../lib/stats'

interface RangeFilterProps {
  value: RangeDays
  onChange: (value: RangeDays) => void
}

/** Segmented control for the 7 / 30 / 90-day period. */
export function RangeFilter({ value, onChange }: RangeFilterProps) {
  return (
    <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-lg border border-line bg-surface p-1">
      {RANGE_OPTIONS.map((days) => {
        const selected = days === value
        return (
          <button
            key={days}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(days)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              selected ? 'bg-surface-2 text-ink shadow-sm' : 'text-muted hover:text-ink-2'
            }`}
          >
            {days} days
          </button>
        )
      })}
    </div>
  )
}
