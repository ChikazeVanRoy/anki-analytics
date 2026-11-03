import { LOCALE } from '../i18n'
import { parseDateKey } from './dates'
import type { Bucket } from './stats'

const int = new Intl.NumberFormat(LOCALE)

export const formatInt = (n: number) => int.format(Math.round(n))
export const formatPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`

/**
 * A rate to one decimal, the same on every page. Exactly 0 and 1 stay whole, and nothing else rounds to them:
 * 99.9% retention with one lapse must not read as perfect.
 */
export function formatRate(n: number) {
  if (n <= 0 || n >= 1) return `${n <= 0 ? 0 : 100}%`
  return `${Math.max(0.1, Math.min(99.9, n * 100)).toFixed(1)}%`
}

/** Below this, a change in a count is shown as no change. */
export const SAME_RELATIVE = 0.005
/** Below this, a change in a rate (0.0005 = 0.05 points) is shown as no change. */
export const SAME_POINTS = 0.0005

/**
 * The text and tone of a change between two periods. A change too small to show is never marked as worse.
 * `text` gets the size of the change and whether it went up.
 */
export function changeDelta(
  change: number,
  { tolerance, same, text, lowerIsBetter = false }: { tolerance: number; same: string; text: (size: number, up: boolean) => string; lowerIsBetter?: boolean },
) {
  if (Math.abs(change) < tolerance) return { text: same, good: true }
  return { text: text(Math.abs(change), change >= 0), good: lowerIsBetter ? change <= 0 : change >= 0 }
}

/** When the collection was copied, e.g. "3 Nov 2026, 22:28". */
export const formatCopiedAt = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })

export const formatShortDate = (key: string) =>
  parseDateKey(key).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })

export const formatLongDate = (key: string) =>
  parseDateKey(key).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** Axis tick for a chart point: "3 Nov" for days/weeks, "Nov 25" for months. */
export const formatBucketTick = (key: string, bucket: Bucket) =>
  bucket === 'month'
    ? parseDateKey(key).toLocaleDateString(LOCALE, { month: 'short', year: '2-digit' })
    : formatShortDate(key)

/** Tooltip title for a chart point. */
export function formatBucketTitle(key: string, bucket: Bucket) {
  if (bucket === 'day') return formatLongDate(key)
  const d = parseDateKey(key)
  if (bucket === 'month') return d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
  return `Week of ${d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60)
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`
}
