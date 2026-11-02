import { parseDateKey } from './stats'

const int = new Intl.NumberFormat('en-GB')

export const formatInt = (n: number) => int.format(Math.round(n))
export const formatPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`

export const formatShortDate = (key: string) =>
  parseDateKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const formatLongDate = (key: string) =>
  parseDateKey(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60)
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`
}
