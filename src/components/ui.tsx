// Small shared UI pieces: tooltips, badges, controls, metric tiles, disclosure, empty/loading states.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { messages } from '../i18n'
import { prefersReducedMotion } from '../lib/motion'
import { tipPosition } from '../lib/tooltip'
import { ChevronIcon, InfoIcon } from './icons'

/**
 * "i" icon with an explanation on hover, tap or keyboard focus. Escape hides it (WCAG 1.4.13).
 * The tip lives in a portal with fixed coordinates, so a card's `overflow-hidden` or transform can't clip it,
 * and it is kept inside the viewport at any width.
 */
export function InfoTip({ children, label = 'More info' }: { children: ReactNode; label?: string }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()
  const shown = (hovered || focused) && !dismissed

  // A dismissed tip stays hidden until the pointer and focus have both left.
  // Listen on the document, so Escape works for a tip opened by hover while focus is elsewhere
  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDismissed(true)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shown])

  // Layout effect: placed before the browser paints, so the tip never flashes in the wrong spot
  useLayoutEffect(() => {
    if (!shown) return
    const place = () => {
      if (!buttonRef.current || !tipRef.current) return
      const root = document.documentElement
      setPosition(tipPosition(buttonRef.current.getBoundingClientRect(), tipRef.current.getBoundingClientRect(), root.clientWidth))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [shown])

  return (
    <span
      className="relative inline-flex align-middle"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        if (!focused) setDismissed(false)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (!hovered) setDismissed(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={tipId}
        // The ::before halo makes the touch target 28px (the icon stays 20px); small enough not to cover neighbours
        className="relative ml-1 inline-grid size-5 place-items-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:text-brand focus:text-brand focus:outline-none"
      >
        <InfoIcon size={15} />
      </button>
      {createPortal(
        <span
          ref={tipRef}
          role="tooltip"
          id={tipId}
          style={position ?? undefined}
          className={`pointer-events-none fixed z-50 w-64 max-w-[calc(100vw-16px)] rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left text-xs leading-relaxed font-medium text-ink-2 shadow-pop ${shown ? 'block' : 'hidden'}`}
        >
          {children}
        </span>,
        document.body,
      )}
    </span>
  )
}

/**
 * A sideways-scrolling area. It only becomes a keyboard stop and a named region while its content really
 * overflows, so keyboard users can scroll it on a phone-sized window and skip past it on a wide one.
 */
export function ScrollRegion({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const check = () => setOverflows(el.scrollWidth > el.clientWidth)
    const observer = new ResizeObserver(check)
    observer.observe(el)
    // The content can change width without the box resizing
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={box} className={`overflow-x-auto ${className}`} {...(overflows ? { tabIndex: 0, role: 'region', 'aria-label': label } : {})}>
      {children}
    </div>
  )
}

/** Marks a section as measured history, a model projection, or sample data. Shape differs, not just colour. */
export function SourceBadge({ kind }: { kind: 'measured' | 'projection' | 'sample' | 'mixed' }) {
  const m = messages.badges
  if (kind === 'mixed') {
    return (
      <span
        title={m.mixedTip}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink-2"
      >
        <span className="size-2 rounded-full bg-ink-2" aria-hidden />
        <span className="size-2 rounded-full border-[1.5px] border-ink-2" aria-hidden /> {m.mixed}
      </span>
    )
  }
  if (kind === 'measured') {
    return (
      <span
        title={m.measuredTip}
        className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink-2"
      >
        <span className="size-2 rounded-full bg-ink-2" aria-hidden /> {m.measured}
      </span>
    )
  }
  if (kind === 'sample') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-bold text-warning">
        <span className="size-2 rotate-45 bg-warning" aria-hidden /> {m.sample}
      </span>
    )
  }
  return (
    <span
      title={m.projectionTip}
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-fc-known/70 bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand-strong"
    >
      <span className="size-2 rounded-full border-[1.5px] border-current" aria-hidden /> {m.projection}
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
  size?: 'md' | 'lg'
}

export function Slider({ label, value, min, max, step = 1, format = String, onChange, hint, size = 'md' }: SliderProps) {
  // Not a wrapping <label>: it would name the first control inside it, which is the tip's button, not the slider
  const id = useId()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink-2">
        <span>
          <label htmlFor={id}>{label}</label>
          {hint && <InfoTip label={`About ${label}`}>{hint}</InfoTip>}
        </span>
        <span className={`font-extrabold text-ink tabular-nums ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-6 w-full cursor-pointer"
      />
    </div>
  )
}

interface SegmentedProps<T extends string | number> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  hideLabel?: boolean
}

export function Segmented<T extends string | number>({ label, value, options, onChange, hideLabel }: SegmentedProps<T>) {
  return (
    <div>
      {!hideLabel && <p className="mb-1.5 text-sm font-semibold text-ink-2">{label}</p>}
      <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-2xl bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${
              o.value === value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
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
export function Metric({
  label,
  value,
  sub,
  tip,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tip?: ReactNode
  tone?: 'good' | 'warning'
}) {
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="text-xs font-bold text-muted">
        {label}
        {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
      </p>
      <p
        className={`mt-1 text-2xl font-extrabold tracking-tight tabular-nums ${
          tone === 'good' ? 'text-good' : tone === 'warning' ? 'text-warning' : 'text-ink'
        }`}
      >
        {value}
      </p>
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

/** Progressive disclosure: a summary row that expands to show detail. Native <details>, so it's accessible. */
export function Disclosure({
  title,
  subtitle,
  children,
  defaultOpen = false,
  className = '',
}: {
  title: string
  subtitle?: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <details open={defaultOpen} className={`group rounded-2xl border border-line bg-surface-2/40 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 select-none hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-muted transition-transform group-open:rotate-90">
          <ChevronIcon size={16} />
        </span>
        <span>
          <span className="block text-sm font-bold text-ink">{title}</span>
          {subtitle && <span className="block text-xs text-muted">{subtitle}</span>}
        </span>
      </summary>
      <div className="px-4 pt-1 pb-4">{children}</div>
    </details>
  )
}

/** Friendly empty state: an icon, a title, an explanation and an optional action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="animate-rise flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-brand-soft text-brand">{icon}</div>
      <h2 className="mt-4 text-lg font-extrabold text-ink">{title}</h2>
      <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Number that counts up from 0 on first show. Screen readers get the final value only. */
export function CountUp({ value, format, duration = 700 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [reduced] = useState(prefersReducedMotion)
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced) return
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(begin + (value - begin) * eased)
      if (p < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduced])
  return (
    <>
      <span aria-hidden>{format(reduced ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  )
}

/** Rounded progress bar that grows in. `value` is 0-1. */
export function ProgressBar({ value, color = 'var(--color-brand)', label }: { value: number; color?: string; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-2.5 overflow-hidden rounded-full bg-surface-2"
    >
      <div className="animate-grow h-full origin-left rounded-full" style={{ width: `${Math.max(value * 100, value > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  )
}

/** Tinted note with an icon, for caveats and warnings inside a section. */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <p
      role="note"
      className={`flex gap-2.5 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        tone === 'warning' ? 'bg-warning-soft text-ink-2' : 'bg-brand-soft text-ink-2'
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${tone === 'warning' ? 'text-warning' : 'text-brand'}`}>
        <InfoIcon size={16} />
      </span>
      <span>{children}</span>
    </p>
  )
}
