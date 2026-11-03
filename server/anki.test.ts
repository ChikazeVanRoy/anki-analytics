// Tests the SQLite reader against a tiny fake collection (never your real data).
// The tables only have the columns the reader uses; settings blobs use Anki's real protobuf format.

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ankiDayKey, dayNumber, keyFromDayNumber } from '../src/lib/dates.ts'
import reference from '../src/lib/fixtures/anki-fsrs-reference.json' with { type: 'json' }
import { DEFAULT_PARAMS, replay, retrievability, toFsrs6Params } from '../src/lib/fsrs.ts'
import { readAnkiData, readDeckTops } from './anki.ts'
import type { DeckConfig } from './deckGroups.ts'
import { readPreset } from './fsrsData.ts'
import { parseProto } from './protobuf.ts'

const dir = mkdtempSync(join(tmpdir(), 'anki-analytics-test-'))
const path = join(dir, 'collection.anki2')
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const NOW = at(2026, 3, 15, 12)
const ROLLOVER = 4
const day = (ms: number) => dayNumber(ankiDayKey(ms, ROLLOVER))

// --- tiny protobuf encoder (enough for the fields Anki uses here) ---
const varint = (n: number) => {
  const out: number[] = []
  while (n >= 128) {
    out.push((n % 128) | 128)
    n = Math.floor(n / 128)
  }
  out.push(n)
  return out
}
const key = (field: number, wire: number) => varint(field * 8 + wire)
const vField = (field: number, n: number) => [...key(field, 0), ...varint(n)]
const fField = (field: number, x: number) => {
  const b = Buffer.alloc(4)
  b.writeFloatLE(x)
  return [...key(field, 5), ...b]
}
const bytesField = (field: number, bytes: number[]) => [...key(field, 2), ...varint(bytes.length), ...bytes]
const packedFloats = (field: number, xs: number[]) => {
  const b = Buffer.alloc(xs.length * 4)
  xs.forEach((x, i) => b.writeFloatLE(x, i * 4))
  return bytesField(field, [...b])
}
const kind = (presetId: number) => Uint8Array.from(bytesField(1, vField(1, presetId)))
const OPTIMISED = DEFAULT_PARAMS.map((w, i) => (i === 3 ? 10 : w)) // a recognisably different parameter set
const preset = (dr: number, newPerDay: number, params?: number[]) =>
  Uint8Array.from([
    ...packedFloats(1, [1, 10]), // learning steps (minutes)
    ...packedFloats(2, [10]), // relearning steps
    ...(params ? packedFloats(6, params) : []), // fsrs_params_6
    ...vField(9, newPerDay),
    ...vField(10, 400),
    ...vField(16, 36500),
    ...fField(37, dr),
  ])

// Card 12's full history, so its stored FSRS state can be checked against a replay
const card12 = [
  { ms: at(2026, 2, 1, 10), rating: 3 as const, type: 0, lastIvl: 0 },
  { ms: at(2026, 2, 1, 10, 10), rating: 3 as const, type: 0, lastIvl: -600 },
  { ms: at(2026, 3, 10, 12), rating: 3 as const, type: 1, lastIvl: 25 },
  { ms: at(2026, 3, 10, 13), rating: 1 as const, type: 1, lastIvl: 25 }, // same day: no prediction
]
const replay12 = replay(card12.map((e) => ({ day: day(e.ms), rating: e.rating })))
const replay13 = replay([{ day: day(at(2026, 3, 11, 3)), rating: 1 }])
const crtSecs = Math.floor(new Date(2026, 0, 1).getTime() / 1000) // collection created 1 Jan 2026 (local)
const crtDay = dayNumber('2026-01-01')

beforeAll(() => {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE col (crt INTEGER);
    CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT, kind BLOB);
    CREATE TABLE deck_config (id INTEGER PRIMARY KEY, name TEXT, config BLOB);
    CREATE TABLE config (key TEXT PRIMARY KEY, val BLOB);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, did INTEGER, odid INTEGER DEFAULT 0, type INTEGER, queue INTEGER, due INTEGER, odue INTEGER DEFAULT 0, ivl INTEGER, data TEXT);
    CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER, time INTEGER, type INTEGER, lastIvl INTEGER, factor INTEGER);
    INSERT INTO config VALUES ('rollover', CAST('${ROLLOVER}' AS BLOB)), ('fsrs', CAST('true' AS BLOB));
  `)
  db.prepare('INSERT INTO col VALUES (?)').run(crtSecs)
  db.prepare('INSERT INTO deck_config VALUES (?, ?, ?)').run(100, 'Castilian preset', preset(0.85, 15))
  db.prepare('INSERT INTO deck_config VALUES (?, ?, ?)').run(200, 'German preset', preset(0.9, 30, OPTIMISED))
  // A truncated blob (cut mid-float), as a damaged or unexpected settings record would be
  db.prepare('INSERT INTO deck_config VALUES (?, ?, ?)').run(300, 'Damaged preset', preset(0.8, 20).slice(0, -2))
  const deck = db.prepare('INSERT INTO decks VALUES (?, ?, ?)')
  deck.run(1, 'Castilian🇨🇳', kind(100))
  deck.run(2, 'Castilian🇨🇳\x1fSpoonfed', kind(100))
  deck.run(3, 'German🇩🇪', kind(200))
  deck.run(4, 'Archive\x1fFrench', kind(100))
  deck.run(5, 'Japanese', kind(300))
  deck.run(6, 'Filtered study', Uint8Array.from(bytesField(2, []))) // filtered deck: DeckKind field 2, no preset

  const card = db.prepare('INSERT INTO cards (id, did, type, queue, due, ivl, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const data = (s: number, d: number, ms: number) => JSON.stringify({ s, d, dr: 0.9, decay: 0.1542, lrt: Math.floor(ms / 1000) })
  card.run(11, 1, 0, 0, 1, 0, '{}') // new
  // Review card: due day number counted from the collection's creation day
  card.run(12, 2, 2, 2, dayNumber('2026-04-09') - crtDay, 30, data(replay12.state!.stability, replay12.state!.difficulty, card12[3].ms))
  // Intraday learning card: due is a Unix timestamp in seconds
  card.run(13, 2, 1, 1, Math.floor(at(2026, 3, 15, 13) / 1000), 0, data(replay13.state!.stability, replay13.state!.difficulty, at(2026, 3, 11, 3)))
  card.run(14, 1, 0, -1, 2, 0, '{}') // suspended new card
  card.run(98, 1, 2, -1, 100, 30, '{}') // suspended mature card
  card.run(15, 1, 2, 2, dayNumber('2026-03-20') - crtDay, 5, data(99, 5, at(2026, 3, 1, 12))) // stored state that won't match its replay
  card.run(21, 3, 2, 2, dayNumber('2026-03-16') - crtDay, 5, data(5, 5, at(2026, 3, 11, 12)))
  card.run(41, 4, 2, 2, 100, 100, data(100, 5, at(2026, 3, 11, 14)))
  card.run(51, 5, 0, 0, 3, 0, '{}')
  // Buried intraday-learning card: queue -2, but due is still a Unix timestamp
  card.run(16, 1, 1, -2, Math.floor(at(2026, 3, 16, 9) / 1000), 0, data(1, 6, at(2026, 3, 14, 12)))
  // Studied card without an FSRS memory state
  card.run(18, 1, 2, 2, dayNumber('2026-03-18') - crtDay, 3, '{}')
  // Card data that is valid JSON but not an object: one bad card must not hide all FSRS sections
  card.run(52, 5, 2, 2, dayNumber('2026-03-18') - crtDay, 3, 'null')
  // Valid memory state, but a due value that can't be a date
  card.run(53, 5, 2, 2, -5, 3, data(3, 5, at(2026, 3, 10, 12)))
  // Card in a filtered deck: its home deck is odid and its real due day is odue; due is a queue position
  db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    17, 6, 1, 2, 2, -100000, dayNumber('2026-03-25') - crtDay, 10, data(12, 4, at(2026, 3, 13, 12)),
  )

  const rev = db.prepare('INSERT INTO revlog VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const e of card12) rev.run(e.ms, 12, e.rating, e.type === 1 ? (e.rating === 1 ? 4000 : 8000) : 1000, e.type, e.lastIvl, 0)
  rev.run(at(2026, 3, 11, 3), 13, 1, 2000, 0, -60, 0) // learning, Again, 3am -> counts as 10 Mar
  rev.run(at(2026, 2, 20, 12), 15, 0, 0, 4, 0, 0) // "Forget" reset: history before it is ignored
  rev.run(at(2026, 3, 1, 12), 15, 4, 1000, 0, 0, 0)
  rev.run(at(2026, 3, 11, 12), 21, 2, 5000, 1, 3, 2500) // German: young review, Hard (history incomplete)
  rev.run(at(2026, 3, 11, 13), 21, 0, 0, 4, 0, 2500) // manual reschedule -> ignored
  rev.run(at(2026, 3, 11, 14), 41, 3, 5000, 1, 50, 2500) // Archive -> excluded
  rev.run(at(2026, 3, 11, 15), 99, 3, 5000, 1, 50, 2500) // deleted card -> skipped
  rev.run(at(2026, 3, 12, 12), 51, 3, 3000, 0, 0, 0) // Japanese -> "Other decks"
  db.close()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// The deck grouping these fixtures were written for (each test collection names its decks this way)
const DECKS: DeckConfig = {
  groups: [
    { name: 'Spanish', decks: ['Castilian*', 'Spanish*'] },
    { name: 'German', decks: ['German*'] },
  ],
  exclude: ['Archive'],
  maxDecks: 2,
}

describe('readAnkiData', () => {
  it('never modifies the collection file', () => {
    const hash = () => createHash('sha256').update(readFileSync(path)).digest('hex')
    const before = hash()
    readAnkiData(path, NOW, { deckConfig: DECKS })
    expect(hash()).toBe(before)
  })

  it('reads the rollover hour', () => {
    expect(readAnkiData(path, NOW, { deckConfig: DECKS }).dayStartHour).toBe(4)
  })

  it('groups decks by top-level name and leaves out Archive', () => {
    const decks = readAnkiData(path, NOW, { deckConfig: DECKS }).decks
    expect(decks.map((d) => d.id)).toEqual(['spanish', 'german', 'other'])
    // incl. the subdeck and the card currently in a filtered deck (counted in its home deck)
    // Suspended cards are counted on their own, not in the total or a stage
    expect(decks[0]).toMatchObject({ totalCards: 7, newCards: 1, youngCards: 5, matureCards: 1, suspendedCards: 2 })
    expect(decks[1]).toMatchObject({ totalCards: 1, youngCards: 1 })
    expect(decks[2]).toMatchObject({ name: 'Other decks', totalCards: 3 })
  })

  it('without a config, shows the most-studied top-level decks and keeps every section consistent', () => {
    const data = readAnkiData(path, NOW)
    const ids = data.decks.map((d) => d.id)
    expect(data.decks.map((d) => [d.name, d.color, d.totalCards])).toEqual([
      ['Castilian🇨🇳', 1, 7],
      ['German🇩🇪', 2, 1],
      ['Japanese', 3, 3], // its own deck now, instead of "Other decks"
      ['Other decks', undefined, 1], // Archive isn't excluded without a config
    ])
    // Every review, card state and preset belongs to a deck the dashboard shows
    const shown = (deckIds: string[]) => deckIds.every((id) => ids.includes(id))
    expect(shown(data.daily.map((s) => s.deckId))).toBe(true)
    expect(shown(data.fsrs!.cards.map((c) => c.deckId))).toBe(true)
    expect(shown(data.fsrs!.presets.map((p) => p.deckId))).toBe(true)
    // Nothing is lost: the same cards and reviews as with the config, minus the excluded deck
    const total = (d: typeof data) => d.decks.reduce((n, x) => n + x.totalCards, 0)
    const reviews = (d: typeof data) => d.daily.reduce((n, x) => n + x.reviews, 0)
    const configured = readAnkiData(path, NOW, { deckConfig: DECKS })
    expect(total(data)).toBe(total(configured) + 1) // + Archive's card
    expect(reviews(data)).toBe(reviews(configured) + 1) // + Archive's review
  })

  it('counts real reviews per Anki day, honouring the rollover hour', () => {
    const march = readAnkiData(path, NOW, { deckConfig: DECKS }).daily.filter((s) => s.date >= '2026-03-10')
    expect(march).toEqual([
      expect.objectContaining({ date: '2026-03-10', deckId: 'spanish', reviews: 3, again: 2, studySeconds: 14 }),
      expect.objectContaining({ date: '2026-03-11', deckId: 'german', reviews: 1, again: 0 }),
      expect.objectContaining({ date: '2026-03-12', deckId: 'other', reviews: 1 }),
    ])
  })

  it('lists each dashboard deck’s top-level Anki decks for the validation scripts', () => {
    const tops = readDeckTops(path, DECKS)
    expect(Object.keys(tops).sort()).toEqual(['german', 'spanish'])
    expect(Object.values(tops).flat()).not.toContain('Archive')
  })

  it('counts retention from review cards only, split by maturity', () => {
    const daily = readAnkiData(path, NOW, { deckConfig: DECKS }).daily
    expect(daily.find((s) => s.date === '2026-03-10')).toMatchObject({
      reviewCardReviews: 2,
      reviewCardPassed: 1,
      reviewCardHard: 0,
      matureReviews: 2,
      maturePassed: 1,
    })
    expect(daily.find((s) => s.date === '2026-03-11')).toMatchObject({ reviewCardReviews: 1, reviewCardPassed: 1, reviewCardHard: 1, matureReviews: 0 })
  })
})

describe('FSRS data', () => {
  const fsrs = () => readAnkiData(path, NOW, { deckConfig: DECKS }).fsrs!

  it('reads whether FSRS is enabled', () => {
    expect(fsrs().enabled).toBe(true)
  })

  it('decodes each deck group’s preset from its protobuf blob', () => {
    const [zh, pt] = fsrs().presets
    expect(zh).toMatchObject({ deckId: 'spanish', presetName: 'Castilian preset', newPerDay: 15, reviewsPerDay: 400, maxInterval: 36500 })
    expect(zh.desiredRetention).toBeCloseTo(0.85, 5)
    expect(zh.learnSteps).toEqual([1, 10])
    expect(zh.relearnSteps).toEqual([10])
    expect(zh.paramsSource).toBe('default')
    expect(zh.params).toEqual([...DEFAULT_PARAMS])
    expect(pt.paramsSource).toBe('optimised')
    expect(pt.params[3]).toBeCloseTo(10, 5)
  })

  it('converts due numbers to dates: day count from the collection’s creation, or a timestamp for intraday learning', () => {
    const cards = fsrs().cards
    expect(cards.find((c) => c.interval === 30)).toMatchObject({ deckId: 'spanish', due: '2026-04-09', state: 'review' })
    expect(cards.find((c) => c.state === 'learning')).toMatchObject({ due: '2026-03-15', lastReview: '2026-03-10' })
  })

  it('uses Anki’s stored memory state and excludes new, suspended and Archive cards', () => {
    const f = fsrs()
    expect(f.cards).toHaveLength(6) // 12, 13, 15, 16, 17 (spanish) + 21 (german); 18 has no state
    const c12 = f.cards.find((c) => c.interval === 30)!
    expect(c12.stability).toBeCloseTo(replay12.state!.stability, 6)
    expect(c12.lastReview).toBe('2026-03-10')
    expect(f.newCards).toEqual({ spanish: 1, other: 1 })
    expect(f.suspended).toEqual({ spanish: 2 })
    expect(f.missingState).toEqual({ spanish: 1, other: 1 }) // '{}' and 'null' card data
    expect(f.invalidDue).toEqual({ other: 1 }) // reported separately: it has a state, but no readable due date
  })

  it('reads a buried learning card’s timestamp due date instead of treating it as a day number', () => {
    expect(fsrs().cards.find((c) => c.stability === 1)).toMatchObject({ due: '2026-03-16', state: 'learning', buried: true })
    expect(fsrs().cards.find((c) => c.stability === 12)).not.toHaveProperty('buried')
  })

  it('puts a card in a filtered deck in its home deck, due on its original date', () => {
    expect(fsrs().cards.find((c) => c.stability === 12)).toMatchObject({ deckId: 'spanish', due: '2026-03-25' })
  })

  it('survives a truncated preset blob, keeping the fields read before the damage', () => {
    const other = fsrs().presets.find((p) => p.deckId === 'other')!
    expect(other).toMatchObject({ presetName: 'Damaged preset', newPerDay: 20, reviewsPerDay: 400 })
    expect(other.desiredRetention).toBe(0.9) // its value was cut off, so the default applies
  })

  it('counts cards reset with "Forget"', () => {
    expect(fsrs().resetCards).toBe(1)
  })

  it('validates the replay against stored states, only for complete histories', () => {
    // 12 and 13 match their replay; 15 deliberately doesn't; 21 has no learning entry (incomplete)
    expect(fsrs().validation).toEqual({ cards: 3, stabilityMatched: 2, difficultyMatched: 2 })
  })

  it('calibrates only review-card reviews with a prior state and at least a day’s gap', () => {
    const cal = fsrs().calibration
    const zh = cal.find((c) => c.deckId === 'spanish')!
    const elapsed = day(card12[2].ms) - day(card12[1].ms)
    const learned = replay(card12.slice(0, 2).map((e) => ({ day: day(e.ms), rating: e.rating }))).state!
    expect(zh).toMatchObject({ month: '2026-03', reviews: 1, passed: 1, matureReviews: 1, maturePassed: 1 })
    expect(zh.predicted).toBeCloseTo(retrievability(elapsed, learned.stability), 6)
    expect(cal.find((c) => c.deckId === 'german')).toBeUndefined() // no prior state for card 21
  })

  it('measures answer behaviour within the window', () => {
    const zh = fsrs().behaviour.find((b) => b.deckId === 'spanish')!
    expect(zh.firstRating).toEqual([1, 0, 1, 1]) // 13 Again, 12 Good, 15 Easy
    expect(zh.newCardsIntroduced).toBe(3)
    expect(zh.learningReviewsPerNewCard).toBeCloseTo(4 / 3) // 2 + 1 + 1 same-day learning answers
    expect(zh.passRating).toEqual([0, 1, 0])
    expect(zh.reviewAgain).toBe(1)
  })

  it('keeps the rest of the dashboard working when FSRS data cannot be read', () => {
    const broken = join(dir, 'no-fsrs-tables.anki2')
    const db = new DatabaseSync(broken)
    db.exec(`CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT);
             CREATE TABLE config (key TEXT PRIMARY KEY, val BLOB);
             CREATE TABLE cards (id INTEGER PRIMARY KEY, did INTEGER, odid INTEGER, type INTEGER, queue INTEGER, ivl INTEGER);
             CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER, time INTEGER, type INTEGER, lastIvl INTEGER);
             INSERT INTO decks VALUES (1, 'Castilian');
             INSERT INTO cards VALUES (1, 1, 0, 2, 2, 5);`)
    db.prepare('INSERT INTO revlog VALUES (?, 1, 3, 5000, 1, 3)').run(at(2026, 3, 10, 12))
    db.close()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = readAnkiData(broken, NOW, { deckConfig: DECKS })
    quiet.mockRestore()
    expect(res.daily).toHaveLength(1)
    expect(res.fsrs).toBeUndefined()
    expect(res.fsrsError).toMatch(/could not be read/)
  })

  it('maps day numbers both ways', () => {
    expect(keyFromDayNumber(dayNumber('2026-03-29'))).toBe('2026-03-29') // across a DST change
  })
})

describe('parseProto', () => {
  it('never throws on truncated or garbage input', () => {
    for (const bytes of [[0x0d, 0x00], [0x12, 0x05, 0x01], [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], [0x09, 1, 2]]) {
      expect(() => parseProto(Uint8Array.from(bytes))).not.toThrow()
    }
  })
  it('returns the fields read before the damage', () => {
    const f = parseProto(Uint8Array.from([...vField(9, 30), 0x2d, 0x00, 0x00])) // field 9 = 30, then a cut float
    expect(f.get(9)?.[0].varint).toBe(30)
    expect(f.has(5)).toBe(false)
  })
})

// Preset blobs written by Anki 26.9.3 for synthetic presets (scripts/fsrs-validation/anki_reference.py)
const ankiBlob = (name: keyof typeof reference.presetBlobs) => Uint8Array.from(Buffer.from(reference.presetBlobs[name], 'base64'))

describe('readPreset on blobs written by Anki', () => {
  it('reads a 0 daily limit as 0: protobuf leaves out fields that hold 0', () => {
    expect(readPreset(ankiBlob('zero-limits'))).toMatchObject({ newPerDay: 0, reviewsPerDay: 0, paramsSource: 'default' })
  })
  it('falls back to Anki’s defaults only when nothing in the blob is readable', () => {
    expect(readPreset(new Uint8Array())).toMatchObject({ newPerDay: 20, reviewsPerDay: 200, maxInterval: 36500, desiredRetention: 0.9 })
  })
  it('reads FSRS-6 parameters from fsrs_params_6', () => {
    const p = readPreset(ankiBlob('fsrs6-custom'))
    expect(p.paramsSource).toBe('optimised')
    p.params.forEach((w, i) => expect(w).toBeCloseTo(reference.presets['fsrs6-custom'].params[i], 5))
  })
  it('upgrades FSRS-4.5 parameters (17) instead of replacing them with the defaults', () => {
    const p = readPreset(ankiBlob('fsrs45'))
    expect(p.paramsSource).toBe('optimised')
    const expected = toFsrs6Params(reference.presets.fsrs45.params)!
    expect(p.params).toHaveLength(21)
    p.params.forEach((w, i) => expect(w).toBeCloseTo(expected[i], 4))
  })
})

describe('FSRS data with mixed presets and incomplete histories', () => {
  const mixed = join(dir, 'mixed.anki2')
  const custom = readPreset(ankiBlob('fsrs6-custom')).params
  const fsrs45 = readPreset(ankiBlob('fsrs45')).params
  const ms = (d: number, h = 12) => at(2026, 2, d, h)
  // Same answers in both Castilian decks; the subdeck's own preset gives a different memory state
  const history = [
    { ms: ms(1, 10), rating: 3 as const, type: 0 },
    { ms: ms(1, 11), rating: 3 as const, type: 0 },
    { ms: ms(3), rating: 3 as const, type: 1 },
    { ms: ms(12), rating: 2 as const, type: 1 },
  ]
  const replayed = (w: readonly number[]) => replay(history.map((e) => ({ day: day(e.ms), rating: e.rating })), w).state!

  beforeAll(() => {
    const db = new DatabaseSync(mixed)
    db.exec(`
      CREATE TABLE col (crt INTEGER);
      CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT, kind BLOB);
      CREATE TABLE deck_config (id INTEGER PRIMARY KEY, name TEXT, config BLOB);
      CREATE TABLE config (key TEXT PRIMARY KEY, val BLOB);
      CREATE TABLE cards (id INTEGER PRIMARY KEY, did INTEGER, odid INTEGER DEFAULT 0, type INTEGER, queue INTEGER, due INTEGER, odue INTEGER DEFAULT 0, ivl INTEGER, data TEXT);
      CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER, time INTEGER, type INTEGER, lastIvl INTEGER, factor INTEGER);
      INSERT INTO config VALUES ('rollover', CAST('${ROLLOVER}' AS BLOB)), ('fsrs', CAST('true' AS BLOB));
    `)
    db.prepare('INSERT INTO col VALUES (?)').run(crtSecs)
    const conf = db.prepare('INSERT INTO deck_config VALUES (?, ?, ?)')
    conf.run(10, 'Zero limits', ankiBlob('zero-limits'))
    conf.run(20, 'Subdeck preset', ankiBlob('fsrs6-custom'))
    conf.run(30, 'FSRS-4.5 preset', ankiBlob('fsrs45'))
    const deck = db.prepare('INSERT INTO decks VALUES (?, ?, ?)')
    deck.run(1, 'Castilian', kind(10))
    deck.run(2, 'Castilian\x1fOwn preset', kind(20))
    deck.run(3, 'German', kind(30))
    const card = db.prepare('INSERT INTO cards (id, did, type, queue, due, ivl, data) VALUES (?, ?, 2, 2, ?, ?, ?)')
    const data = (st: { stability: number; difficulty: number }) =>
      JSON.stringify({ s: st.stability, d: st.difficulty, lrt: Math.floor(history[3].ms / 1000) })
    const due = dayNumber('2026-03-20') - crtDay
    card.run(1, 1, due, 20, data(replayed(DEFAULT_PARAMS)))
    card.run(2, 1, due, 20, data(replayed(DEFAULT_PARAMS)))
    card.run(3, 2, due, 20, data(replayed(custom))) // the subdeck's card, stored with its own preset's state
    card.run(4, 3, due, 20, data(replayed(fsrs45)))
    card.run(5, 3, due, 20, JSON.stringify({ s: 30, d: 5, lrt: Math.floor(ms(20) / 1000) }))
    const rev = db.prepare('INSERT INTO revlog VALUES (?, ?, ?, 5000, ?, 5, 2500)')
    for (const cid of [1, 2, 3, 4]) history.forEach((e, i) => rev.run(e.ms + cid * 1000 + i, cid, e.rating, e.type))
    // Card 5: history starts with a review (e.g. imported); Anki seeds it from SM-2 values
    for (const [d, rating] of [[2, 3], [8, 3], [20, 1]]) rev.run(ms(d) + 5000, 5, rating, 1)
    db.close()
  })
  const fsrs = () => readAnkiData(mixed, NOW, { deckConfig: DECKS }).fsrs!

  it('replays each card with its own home deck’s preset, as Anki does', () => {
    // If card 3 were replayed with the group’s (majority) preset, its stored state wouldn’t match
    expect(fsrs().validation).toEqual({ cards: 4, stabilityMatched: 4, difficultyMatched: 4 })
    expect(fsrs().presets.find((p) => p.deckId === 'spanish')).toMatchObject({ presetName: 'Zero limits', reviewsPerDay: 0 })
  })

  it('tells the dashboard which preset each card uses (current recall and the forecast use it)', () => {
    const f = fsrs()
    const presetOf = (stability: number) => f.cardPresets![f.cards.find((c) => c.stability === stability)!.preset!]
    expect(presetOf(replayed(custom).stability)).toMatchObject({ presetName: 'Subdeck preset', paramsSource: 'optimised' })
    expect(presetOf(replayed(custom).stability).params).toEqual(custom)
    expect(presetOf(replayed(DEFAULT_PARAMS).stability).presetName).toBe('Zero limits')
    expect(f.presets.find((p) => p.deckId === 'spanish')!.presetId).toBe(10)
  })

  it('leaves cards whose history doesn’t start with learning out of calibration', () => {
    const f = fsrs()
    expect(f.incompleteHistory).toBe(1)
    // Card 4 (complete history): reviews on 3 and 12 Feb are calibrated. Card 5 (starts with a review): none.
    const pt = f.calibration.filter((c) => c.deckId === 'german').reduce((n, c) => n + c.reviews, 0)
    expect(pt).toBe(2) // card 4's two reviews; none of card 5's three
  })
})
