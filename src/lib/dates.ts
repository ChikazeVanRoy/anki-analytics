// Date helpers shared by the frontend and the Node API (no imports, so both can use it).

/** Local calendar date as YYYY-MM-DD (toISOString would shift to UTC). */
export function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Days since 1970-01-01 for a YYYY-MM-DD key (calendar arithmetic, immune to DST). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** YYYY-MM-DD key for a day number from `dayNumber`. */
export function keyFromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10)
}

/** A date on the Anki day of a timestamp. Compares clock hours, as Anki does, so a clock change can't move a review's day. */
export function ankiDate(ms: number, dayStartHour: number): Date {
  const date = new Date(ms)
  if (date.getHours() < dayStartHour) date.setDate(date.getDate() - 1)
  return date
}

/** Anki day (YYYY-MM-DD) of a timestamp, given the hour at which Anki starts a new day. */
export const ankiDayKey = (ms: number, dayStartHour: number) => toDateKey(ankiDate(ms, dayStartHour))
