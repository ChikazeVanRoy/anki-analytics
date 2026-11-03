// Reads statistics from a COPY of the Anki collection (never the original).
// Uses Node's built-in SQLite module, so there are no native dependencies to install.

import { statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { AnkiData, DailyDeckStat, Deck } from '../src/data/types.ts'
import { toDateKey } from '../src/lib/dates.ts'
import { readConfigJson } from './ankiConfig.ts'
import { OTHER, planDeckGroups, type DeckConfig } from './deckGroups.ts'
import { readFsrsData } from './fsrsData.ts'

const MATURE_DAYS = 21 // Anki's definition: interval of 21+ days

export interface ReadOptions {
  /** How Anki decks are grouped (see deckGroups.ts); without it the most-studied top-level decks show. */
  deckConfig?: DeckConfig
  /** Colour slots remembered from earlier visits, by dashboard deck id. */
  previousColors?: Map<string, number>
}

export function readAnkiData(path: string, now = Date.now(), { deckConfig = {}, previousColors }: ReadOptions = {}): AnkiData {
  const db = new DatabaseSync(path, { readOnly: true })
  try {

    // Hour at which Anki starts a new day; 4 is Anki's default
    const rollover = readConfigJson(db, 'rollover')
    const dayStartHour = Number.isInteger(rollover) && (rollover as number) >= 0 && (rollover as number) < 24 ? (rollover as number) : 4

    // --- Card counts per deck group ---
    // cards.type: 0 = new, 1 = learning, 2 = review, 3 = relearning
    const cardRows = db
      .prepare(
        // A card in a filtered deck keeps its home deck in odid; count it there
        `SELECT CASE WHEN odid != 0 THEN odid ELSE did END AS did,
                COUNT(*) AS total,
                SUM(type = 0) AS new,
                SUM(type IN (1, 3) OR (type = 2 AND ivl < ${MATURE_DAYS})) AS young,
                SUM(type = 2 AND ivl >= ${MATURE_DAYS}) AS mature
         FROM cards GROUP BY 1`,
      )
      .all()

    // Group the Anki decks (hierarchy is stored as "Parent\x1fChild"), most-studied first unless configured
    const plan = planDeckGroups(
      db.prepare('SELECT id, name FROM decks').all().map((r) => ({ id: Number(r.id), name: String(r.name) })),
      new Map(cardRows.map((r) => [Number(r.did), Number(r.young) + Number(r.mature)])),
      deckConfig,
      previousColors,
    )
    if (plan.unmatched.length) {
      console.warn(`anki-analytics.config.json: no deck matches group ${plan.unmatched.map((n) => `"${n}"`).join(', ')}`)
    }
    const { deckGroup, excluded: excludedDecks } = plan
    const decks = new Map<string, Deck>()
    for (const g of plan.groups) {
      decks.set(g.id, {
        id: g.id,
        name: g.name,
        ...(g.color !== undefined && { color: g.color }),
        totalCards: 0,
        newCards: 0,
        youngCards: 0,
        matureCards: 0,
      })
    }
    for (const r of cardRows) {
      if (excludedDecks.has(Number(r.did))) continue
      const deck = decks.get(deckGroup.get(Number(r.did)) ?? OTHER.id)!
      deck.totalCards += Number(r.total)
      deck.newCards += Number(r.new)
      deck.youngCards += Number(r.young)
      deck.matureCards += Number(r.mature)
    }

    // --- Daily review totals ---
    // revlog.id = review timestamp (ms), ease 1 = Again, time = ms spent.
    // type 0-3 are real reviews (learn/review/relearn/filtered); 4+ are manual reschedules.
    const reviews = db
      .prepare(
        `SELECT r.id AS ts, r.ease, r.time, r.type, r.lastIvl, CASE WHEN c.odid != 0 THEN c.odid ELSE c.did END AS did
         FROM revlog r LEFT JOIN cards c ON c.id = r.cid
         WHERE r.type BETWEEN 0 AND 3 AND r.ease BETWEEN 1 AND 4`,
      )
      .all()

    const byKey = new Map<string, DailyDeckStat>()
    const offsetMs = dayStartHour * 3_600_000
    for (const r of reviews) {
      // Skip excluded decks, and reviews of deleted cards (Anki no longer knows their deck)
      if (r.did == null || excludedDecks.has(Number(r.did))) continue
      // Shift by the rollover hour so a 00:30 review counts towards the previous Anki day
      const date = toDateKey(new Date(Number(r.ts) - offsetMs))
      const deckId = deckGroup.get(Number(r.did)) ?? OTHER.id
      const key = `${date}|${deckId}`
      const stat = byKey.get(key) ?? {
        date,
        deckId,
        reviews: 0,
        again: 0,
        studySeconds: 0,
        reviewCardReviews: 0,
        reviewCardPassed: 0,
        matureReviews: 0,
        maturePassed: 0,
      }
      const passed = Number(r.ease) > 1
      stat.reviews += 1
      if (!passed) stat.again += 1
      stat.studySeconds += Number(r.time) / 1000
      // Retention only counts graduated cards (type 1 = review); learning steps are excluded.
      // lastIvl is the interval before this review; negative values are learning steps in seconds.
      if (Number(r.type) === 1) {
        stat.reviewCardReviews += 1
        if (passed) stat.reviewCardPassed += 1
        if (Number(r.lastIvl) >= MATURE_DAYS) {
          stat.matureReviews += 1
          if (passed) stat.maturePassed += 1
        }
      }
      byKey.set(key, stat)
    }

    const daily = [...byKey.values()]
      .map((s) => ({ ...s, studySeconds: Math.round(s.studySeconds) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // FSRS data is optional: if it can't be read (unexpected schema, damaged settings), the rest of the
    // dashboard still works and the page explains why the FSRS sections are missing.
    let fsrs: AnkiData['fsrs']
    let fsrsError: string | undefined
    try {
      fsrs = readFsrsData({
        db,
        deckGroup,
        excludedDecks,
        dayStartHour,
        groupIds: plan.groups.map((g) => g.id),
        now,
      })
    } catch (err) {
      console.error('FSRS data could not be read:', err)
      fsrsError = 'FSRS data could not be read from this collection.'
    }

    return {
      source: 'anki',
      generatedAt: statSync(path).mtime.toISOString(), // when the copy was made
      dayStartHour,
      // Hide groups with nothing to show (e.g. "Other decks" when every other deck is excluded)
      decks: [...decks.values()].filter((d) => d.totalCards > 0 || daily.some((s) => s.deckId === d.id)),
      daily,
      fsrs,
      fsrsError,
    }
  } finally {
    db.close()
  }
}
