/**
 * Round axis ticks from 0 up to at least `max`: steps of 1, 2 or 5 times a power of ten, about `target` of them,
 * so a chart reads 0/5/10/15% or 0/100/200/300 rather than whatever the data's maximum divides into.
 */
export function niceTicks(max: number, target = 4, minStep = 0): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, Math.max(1, minStep)]
  // minStep: the smallest step the labels can tell apart, such as 1% for whole percentages
  const rough = Math.max(max / target, minStep)
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((f) => f * power).find((s) => s >= rough) ?? 10 * power
  const count = Math.ceil(max / step - 1e-9)
  // Rounded, so 0.1 + 0.2 lands on 0.3 and not 0.30000000000000004
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)))
}

/** The largest number in some chart rows, looking inside [low, high] ranges too. */
export function rowsMax(rows: readonly Record<string, unknown>[], keys?: readonly string[]): number {
  let max = 0
  for (const row of rows)
    for (const [key, value] of Object.entries(row)) {
      if (keys && !keys.includes(key)) continue
      for (const v of Array.isArray(value) ? value : [value]) if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v
    }
  return max
}
