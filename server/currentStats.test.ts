// The stats survive losing the one file that's only a convenience. Uses a tiny fake collection.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readCurrentStats } from './anki.ts'

vi.mock('./deckGroups.ts', async (original) => ({
  ...(await original<typeof import('./deckGroups.ts')>()),
  loadDeckConfig: () => ({}),
  loadDeckColors: () => new Map(),
  saveDeckColors: () => {
    throw new Error('disk full')
  },
}))

const dir = mkdtempSync(join(tmpdir(), 'anki-analytics-current-'))
const path = join(dir, 'collection.anki2')

beforeAll(() => {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE config (key TEXT PRIMARY KEY, val BLOB);
    CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, did INTEGER, odid INTEGER DEFAULT 0, type INTEGER, queue INTEGER, ivl INTEGER);
    CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER, time INTEGER, type INTEGER, lastIvl INTEGER);
    INSERT INTO decks VALUES (1, 'Language');
    INSERT INTO cards (id, did, type, queue, ivl) VALUES (1, 1, 2, 2, 5);
  `)
  db.close()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('readCurrentStats', () => {
  it('still answers when deck colours can’t be saved', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {}) // also hears that this fixture has no FSRS tables
    expect(readCurrentStats(path).decks.map((d) => d.name)).toEqual(['Language'])
    expect(logged).toHaveBeenCalledWith('Deck colours could not be saved:', expect.any(Error))
    logged.mockRestore()
  })
})
