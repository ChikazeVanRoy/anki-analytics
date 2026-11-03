import { parseDateKey } from './dates'
import type { Bucket } from './stats'

const int = new Intl.NumberFormat('en-GB')

export const formatInt = (n: number) => int.format(Math.round(n))
export const formatPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`

/**
 * Whole-number percentage, but never rounds a rate below 100% up to "100%" (or above 0% down to "0%"):
 * 99.9% retention with one lapse must not read as perfect.
 */
export function formatRate(n: number) {
  const whole = Math.round(n * 100)
  if ((whole === 100 && n < 1) || (whole === 0 && n > 0)) return formatPct(n, 1)
  return `${whole}%`
}

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
