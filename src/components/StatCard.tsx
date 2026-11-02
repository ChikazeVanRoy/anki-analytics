interface Delta {
  text: string
  /** Whether this change is an improvement (e.g. a lower Again rate is good). */
  good: boolean
}

interface StatCardProps {
  label: string
  value: string
  hint?: string
  delta?: Delta
}

export function StatCard({ label, value, hint, delta }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta && (
          <span className={`font-medium ${delta.good ? 'text-good' : 'text-critical'}`}>
            {/* Arrow + text, so meaning isn't carried by colour alone */}
            {delta.text}
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  )
}
