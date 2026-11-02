import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** The rounded card every dashboard section sits in. */
export function Panel({ title, subtitle, actions, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
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
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}
