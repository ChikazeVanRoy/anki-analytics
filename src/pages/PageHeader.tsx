import type { ReactNode } from 'react'

/** Title block at the top of each section page. */
export function PageHeader({ title, subtitle, badge, actions }: { title: string; subtitle: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="animate-rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">{title}</h1>
          {badge}
        </div>
        <p className="mt-1.5 max-w-2xl text-base text-muted">{subtitle}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
