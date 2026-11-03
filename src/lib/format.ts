import { parseDateKey } from './dates'
import type { Bucket } from './stats'

const int = new Intl.NumberFormat('en-GB')

export const formatInt = (n: number) => int.format(Math.round(n))
export const formatPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`

export const formatShortDate = (key: string) =>
  parseDateKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const formatLongDate = (key: string) =>
  parseDateKey(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** Axis tick for a chart point: "3 Nov" for days/weeks, "Nov 25" for months. */
export const formatBucketTick = (key: string, bucket: Bucket) =>
  bucket === 'month'
    ? parseDateKey(key).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    : formatShortDate(key)

/** Tooltip title for a chart point. */
export function formatBucketTitle(key: string, bucket: Bucket) {
  if (bucket === 'day') return formatLongDate(key)
  const d = parseDateKey(key)
  if (bucket === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60)
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`
}
