// Reads statistics from a COPY of the Anki collection (never the original).
// Uses Node's built-in SQLite module, so there are no native dependencies to install.

import { statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { AnkiData, DailyDeckStat, Deck } from '../src/data/types.ts'
import { toDateKey } from '../src/lib/dates.ts'

// Top-level Anki decks are grouped into the dashboard's decks by name.
// Anything that doesn't match goes into "Other decks".
const GROUPS = [
  { id: 'mandarin', name: 'Mandarin', match: /^(chinese|mandarin)/i },
  { id: 'portuguese', name: 'Portuguese', match: /^portuguese/i },
]
const OTHER = { id: 'other', name: 'Other decks' }

// Top-level decks left out of the dashboard entirely (cards and reviews).
const EXCLUDED_DECKS = [/^redundant$/i]

function groupFor(topLevelName: string | undefined) {
  return GROUPS.find((g) => topLevelName && g.match.test(topLevelName)) ?? OTHER
}

const MATURE_DAYS = 21 // Anki's definition: interval of 21+ days

export function readAnkiData(path: string): AnkiData {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    // Anki stores deck hierarchy as "Parent\x1fChild"; we only need the top level.
    const deckGroup = new Map<number, string>()
    const excludedDecks = new Set<number>()
    for (const row of db.prepare('SELECT id, name FROM decks').all()) {
      const topLevel = String(row.name).split('\x1f')[0]
      deckGroup.set(Number(row.id), groupFor(topLevel).id)
      if (EXCLUDED_DECKS.some((re) => re.test(topLevel))) excludedDecks.add(Number(row.id))
    }

    const rolloverRow = db.prepare("SELECT CAST(val AS TEXT) AS v FROM config WHERE key = 'rollover'").get()
    const dayStartHour = rolloverRow ? Number(JSON.parse(String(rolloverRow.v))) : 4

    // --- Card counts per deck group ---
    // cards.type: 0 = new, 1 = learning, 2 = review, 3 = relearning
    const decks = new Map<string, Deck>()
    for (const g of [...GROUPS, OTHER]) {
      decks.set(g.id, { id: g.id, name: g.name, totalCards: 0, newCards: 0, youngCards: 0, matureCards: 0 })
    }
    const cardRows = db
      .prepare(
        `SELECT did,
                COUNT(*) AS total,
                SUM(type = 0) AS new,
                SUM(type IN (1, 3) OR (type = 2 AND ivl < ${MATURE_DAYS})) AS young,
                SUM(type = 2 AND ivl >= ${MATURE_DAYS}) AS mature
         FROM cards GROUP BY did`,
      )
      .all()
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
        `SELECT r.id AS ts, r.ease, r.time, c.did
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
      const stat = byKey.get(key) ?? { date, deckId, reviews: 0, again: 0, studySeconds: 0 }
      stat.reviews += 1
      if (Number(r.ease) === 1) stat.again += 1
      stat.studySeconds += Number(r.time) / 1000
      byKey.set(key, stat)
    }

    const daily = [...byKey.values()]
      .map((s) => ({ ...s, studySeconds: Math.round(s.studySeconds) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      source: 'anki',
      generatedAt: statSync(path).mtime.toISOString(), // when the copy was made
      dayStartHour,
      // Hide groups with nothing to show (e.g. "Other decks" when every other deck is excluded)
      decks: [...decks.values()].filter((d) => d.totalCards > 0 || daily.some((s) => s.deckId === d.id)),
      daily,
    }
  } finally {
    db.close()
  }
}
