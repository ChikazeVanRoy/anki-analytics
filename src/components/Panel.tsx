import type { ReactNode } from 'react'

interface PanelProps {
  /** Plain-English heading; for charts, the question the chart answers. */
  title: string
  subtitle?: ReactNode
  /** Small label above the title, e.g. the section's technical name. */
  eyebrow?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Projections get a dashed edge so they never pass for measured history. */
  variant?: 'default' | 'projection'
  id?: string
}

/** The rounded card every section sits in. */
export function Panel({ title, subtitle, eyebrow, actions, children, className = '', variant = 'default', id }: PanelProps) {
  return (
    <section
      id={id}
      aria-label={title}
      className={`animate-rise rounded-3xl border bg-surface p-5 shadow-card sm:p-6 ${
        variant === 'projection' ? 'border-dashed border-fc-known/45' : 'border-line'
      } ${className}`}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">{eyebrow}</p>}
          <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
