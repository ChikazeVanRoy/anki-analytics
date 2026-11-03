import type { DatabaseSync } from 'node:sqlite'

/**
 * Reads one JSON value from Anki's `config` table. Returns undefined when the key is missing or its
 * value is not valid JSON, so a damaged setting falls back to a default instead of breaking the API.
 */
export function readConfigJson(db: DatabaseSync, key: string): unknown {
  try {
    const row = db.prepare('SELECT CAST(val AS TEXT) AS v FROM config WHERE key = ?').get(key)
    return row ? JSON.parse(String(row.v)) : undefined
  } catch {
    return undefined
  }
}
