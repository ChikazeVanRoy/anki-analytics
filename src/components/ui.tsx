// Small shared UI pieces for the FSRS and forecast sections.
import type { ReactNode } from 'react'

/** "?" icon with an explanation on hover or keyboard focus. */
export function InfoTip({ children, label = 'More info' }: { children: ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="ml-1 inline-grid size-4 place-items-center rounded-full border border-line text-[10px] leading-none text-muted hover:text-ink focus:text-ink focus:outline-none"
      >
        ?
      </button>
      <span
        role="tooltip"
        // `hidden` (display: none) rather than invisible: a hidden tooltip near the screen edge must not widen the page
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 max-w-[70vw] -translate-x-1/2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed font-normal text-ink-2 shadow-xl group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  )
}

/** Badge that marks a section as measured history or as a model projection. */
export function SourceBadge({ kind }: { kind: 'measured' | 'projection' }) {
  return kind === 'measured' ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
      <span className="size-1.5 rounded-full bg-ink-2" /> Measured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-2/60 px-2 py-0.5 text-[11px] font-medium text-ink-2">
      <span className="size-1.5 rounded-full border border-ink-2" /> Projection
    </span>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
  hint?: ReactNode
}

export function Slider({ label, value, min, max, step = 1, format = String, onChange, hint }: SliderProps) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span>
          {label}
          {hint && <InfoTip label={`About ${label}`}>{hint}</InfoTip>}
        </span>
        <span className="font-semibold text-ink tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#9085e9]"
      />
    </label>
  )
}

interface SegmentedProps<T extends string | number> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              o.value === value ? 'bg-surface-2 text-ink shadow-sm' : 'text-muted hover:text-ink-2'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Compact metric tile used inside panels. */
export function Metric({ label, value, sub, tip }: { label: string; value: string; sub?: ReactNode; tip?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-4">
      <p className="text-xs text-muted">
        {label}
        {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

/** SVG hatch pattern for estimated (modelled) series. Put inside a chart's <defs>. */
export function HatchPattern({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={color} fillOpacity="0.55" />
      <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="3" />
    </pattern>
  )
}
