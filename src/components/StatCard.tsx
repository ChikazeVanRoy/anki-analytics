import type { ReactNode } from 'react'
import { InfoTip } from './ui'

interface Delta {
  text: string
  /** Whether this change is an improvement (e.g. a lower Again rate is good). */
  good: boolean
}

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** A small chart under the number. */
  visual?: ReactNode
  delta?: Delta
  tip?: ReactNode
  icon?: ReactNode
  /** Tint behind the icon, e.g. var(--color-sun-soft). */
  tint?: string
  className?: string
  style?: React.CSSProperties
}

/** Headline number with a label, an optional change and a short explanation. */
export function StatCard({ label, value, hint, visual, delta, tip, icon, tint, className = '', style }: StatCardProps) {
  return (
    <div className={`animate-rise rounded-3xl border border-line bg-surface p-5 shadow-card ${className}`} style={style}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-2xl" style={{ background: tint ?? 'var(--color-surface-2)' }}>
            {icon}
          </span>
        )}
        <p className="text-sm font-bold text-muted">
          {label}
          {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
        </p>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
      {visual}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta && (
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${delta.good ? 'bg-good-soft text-good' : 'bg-critical-soft text-critical'}`}
          >
            {/* Arrow + text, so meaning isn't carried by colour alone */}
            {delta.text}
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  )
}
