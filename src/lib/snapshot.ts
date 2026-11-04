// A saved copy of the API's stats, for showing when the live API can't answer. No imports, as the Node server uses
// this too. A file can outlive the app that wrote it, so anything this version can't read is refused, not guessed at.

/** Raise this when AnkiData changes in a way an older snapshot can't satisfy. */
export const SNAPSHOT_VERSION = 1

export interface StatsSnapshot<T> {
  version: number
  data: T
}

export const wrapSnapshot = <T>(data: T): StatsSnapshot<T> => ({ version: SNAPSHOT_VERSION, data })

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The stats in a snapshot, or null unless it's a current one holding real data: sample data must never pass as yours. */
export function parseSnapshot<T>(body: unknown): T | null {
  if (!isObject(body) || body.version !== SNAPSHOT_VERSION || !isObject(body.data)) return null
  const { source, generatedAt, dayStartHour, decks, daily } = body.data
  const valid =
    source === 'anki' &&
    typeof generatedAt === 'string' &&
    !Number.isNaN(Date.parse(generatedAt)) &&
    typeof dayStartHour === 'number' &&
    Array.isArray(decks) &&
    Array.isArray(daily)
  return valid ? (body.data as T) : null
}
