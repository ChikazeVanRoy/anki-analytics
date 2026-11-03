// Tests the SQLite reader against a tiny fake collection (never your real data).
// The tables only have the columns the reader uses.

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAnkiData } from './anki.ts'

const dir = mkdtempSync(join(tmpdir(), 'anki-analytics-test-'))
const path = join(dir, 'collection.anki2')
const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime()

beforeAll(() => {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE config (key TEXT PRIMARY KEY, val BLOB);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, did INTEGER, type INTEGER, ivl INTEGER);
    CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER, time INTEGER, type INTEGER, lastIvl INTEGER);
    INSERT INTO config VALUES ('rollover', CAST('4' AS BLOB));  -- Anki day starts at 4am
    INSERT INTO decks VALUES
      (1, 'Chinese🇨🇳'), (2, 'Chinese🇨🇳' || char(31) || 'Spoonfed'),
      (3, 'Portuguese🇧🇷'), (4, 'Redundant' || char(31) || 'French'), (5, 'Japanese');
    -- cards: type 0 new, 1 learning, 2 review (ivl >= 21 is mature)
    INSERT INTO cards VALUES
      (11, 1, 0, 0), (12, 2, 2, 30), (13, 2, 1, 0),
      (21, 3, 2, 5),
      (41, 4, 2, 100),
      (51, 5, 0, 0);
  `)
  const insert = db.prepare('INSERT INTO revlog VALUES (?, ?, ?, ?, ?, ?)')
  insert.run(at(2026, 3, 10, 12), 12, 3, 8000, 1, 25) // Chinese: mature review, passed
  insert.run(at(2026, 3, 10, 13), 12, 1, 4000, 1, 25) // Chinese: mature review, Again
  insert.run(at(2026, 3, 11, 3), 13, 1, 2000, 0, -60) // Chinese: learning, Again, 3am -> counts as 10 Mar
  insert.run(at(2026, 3, 11, 12), 21, 4, 5000, 1, 3) // Portuguese: young review, passed
  insert.run(at(2026, 3, 11, 13), 21, 0, 0, 4, 0) // Portuguese: manual reschedule -> ignored
  insert.run(at(2026, 3, 11, 14), 41, 3, 5000, 1, 50) // Redundant -> excluded
  insert.run(at(2026, 3, 11, 15), 99, 3, 5000, 1, 50) // deleted card -> skipped
  insert.run(at(2026, 3, 12, 12), 51, 3, 3000, 0, 0) // Japanese -> "Other decks"
  db.close()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('readAnkiData', () => {
  it('never modifies the collection file', () => {
    const hash = () => createHash('sha256').update(readFileSync(path)).digest('hex')
    const before = hash()
    readAnkiData(path)
    expect(hash()).toBe(before)
  })

  it('reads the rollover hour', () => {
    expect(readAnkiData(path).dayStartHour).toBe(4)
  })

  it('groups decks by top-level name and leaves out Redundant', () => {
    const decks = readAnkiData(path).decks
    expect(decks.map((d) => d.id)).toEqual(['mandarin', 'portuguese', 'other'])
    expect(decks[0]).toMatchObject({ totalCards: 3, newCards: 1, youngCards: 1, matureCards: 1 }) // incl. subdeck
    expect(decks[1]).toMatchObject({ totalCards: 1, youngCards: 1 })
    expect(decks[2]).toMatchObject({ name: 'Other decks', totalCards: 1 })
  })

  it('counts real reviews per Anki day, honouring the rollover hour', () => {
    const daily = readAnkiData(path).daily
    expect(daily).toEqual([
      expect.objectContaining({ date: '2026-03-10', deckId: 'mandarin', reviews: 3, again: 2, studySeconds: 14 }),
      expect.objectContaining({ date: '2026-03-11', deckId: 'portuguese', reviews: 1, again: 0 }),
      expect.objectContaining({ date: '2026-03-12', deckId: 'other', reviews: 1 }),
    ])
  })

  it('counts retention from review cards only, split by maturity', () => {
    const [mandarin, portuguese] = readAnkiData(path).daily
    expect(mandarin).toMatchObject({ reviewCardReviews: 2, reviewCardPassed: 1, matureReviews: 2, maturePassed: 1 })
    expect(portuguese).toMatchObject({ reviewCardReviews: 1, reviewCardPassed: 1, matureReviews: 0 })
  })
})
