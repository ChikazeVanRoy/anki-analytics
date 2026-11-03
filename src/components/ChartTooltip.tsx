interface Row {
  color: string
  label: string
  value: string
}

interface ChartTooltipProps {
  active?: boolean
  title: string
  rows: Row[]
  footer?: { label: string; value: string }
}

/** Shared tooltip body for Recharts charts, styled to match the dashboard. */
export function ChartTooltip({ active, title, rows, footer }: ChartTooltipProps) {
  if (!active || rows.length === 0) return null
  return (
    <div className="min-w-44 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-bold text-ink">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="size-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="font-bold text-ink tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="mt-1.5 flex justify-between border-t border-line pt-1.5">
          <span className="text-muted">{footer.label}</span>
          <span className="font-bold text-ink tabular-nums">{footer.value}</span>
        </div>
      )}
    </div>
  )
}
