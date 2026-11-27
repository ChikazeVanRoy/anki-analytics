// The stats for the copy as it is now, shared by everything in the server that needs them (the API and the automatic
// snapshot), so the same copy is never read twice at once. A read runs in a worker thread (readStats.ts) and can take a
// minute on a busy Mac; meanwhile everything else keeps answering.

import { existsSync, statSync } from 'node:fs'
import type { AnkiData } from '../src/data/types.ts'
import { CONFIG_PATH } from './deckGroups.ts'

/** Stats change slowly with the clock (recall now, what's due), so reuse a read for at most this long. */
export const STATS_REUSE_MS = 5 * 60_000

export type StatsKey = { source: string; window: number } | null

/**
 * What the stats depend on: `source`, the copy (its time and size) and the deck config, and `window`, the current
 * five-minute stretch. Windows are counted from the epoch, and every time zone's hours start on one, so an Anki day's
 * rollover always starts a new read. Null when the copy can't be looked at, which never reuses a read.
 */
export function statsKey(collectionPath: string, now = Date.now(), configPath = CONFIG_PATH): StatsKey {
  try {
    const copy = statSync(collectionPath)
    const config = existsSync(configPath) ? statSync(configPath).mtimeMs : 0
    return { source: `${copy.mtimeMs}:${copy.size}:${config}`, window: Math.floor(now / STATS_REUSE_MS) }
  } catch {
    return null
  }
}

export interface StatsReaderDeps {
  collectionPath: string
  read: (path: string) => AnkiData | Promise<AnkiData>
  statsKey: (collectionPath: string) => StatsKey
  log: (message: string) => void
}

export interface StatsReader {
  /** The stats for the copy as it is now: reused while it hasn't changed, and read again in the background once old. */
  current: () => Promise<AnkiData>
  /** Resolves once no read is under way, so the copy can be replaced without reading it mid-change. */
  idle: () => Promise<void>
}

export function createStatsReader(deps: StatsReaderDeps): StatsReader {
  let last: { source: string; window: number; started: number; data: AnkiData } | null = null
  let reads = 0 // numbers reads in the order they start: a slow older read must not replace a newer one
  /** The read under way, shared by everything that wants it, so a slow read is never started twice. */
  let reading: { source: string | null; done: Promise<AnkiData> } | null = null

  function readNow(key: StatsKey): Promise<AnkiData> {
    const source = key?.source ?? null
    if (reading && reading.source === source) return reading.done
    const started = performance.now()
    const order = ++reads
    const done = Promise.resolve()
      .then(() => deps.read(deps.collectionPath))
      .then((data) => {
        deps.log(`stats: ${data.daily.length} rows in ${Math.round(performance.now() - started)}ms`)
        // A read that started later may have finished first: keep the newer one
        if (key !== null && (last === null || last.started < order)) {
          // Good for five minutes from when it finished: a read slower than that mustn't start the next straight away
          const window = Math.max(key.window, deps.statsKey(deps.collectionPath)?.window ?? key.window)
          last = { source: key.source, window, started: order, data }
        }
        return data
      })
      .finally(() => {
        if (reading?.done === done) reading = null
      })
    reading = { source, done }
    return done
  }

  return {
    current() {
      const key = deps.statsKey(deps.collectionPath)
      if (key !== null && last?.source === key.source) {
        if (last.window < key.window && !reading) {
          readNow(key).catch((err) => console.error('The stats could not be read again:', err)) // the last ones still stand
        }
        return Promise.resolve(last.data)
      }
      return readNow(key)
    },
    async idle() {
      while (reading) await reading.done.catch(() => {}) // a failed read is the reader's to report
    },
  }
}
