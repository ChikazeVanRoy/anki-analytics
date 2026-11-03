// Saves the dashboard's own deck grouping, so anki_export.py compares exactly the cards the app shows
// instead of repeating its rules (config patterns, exclusions, first match wins, largest decks).
//
//   node scripts/fsrs-validation/deck_plan.ts
//
// Reads data/collection.anki2 (read-only) and the optional deck config. Writes
// data/fsrs-validation/deck-plan.json (git-ignored with the rest of /data/).

import { mkdirSync, writeFileSync } from 'node:fs'
import { readDeckTops } from '../../server/anki.ts'
import { loadDeckConfig } from '../../server/deckGroups.ts'

const OUT = 'data/fsrs-validation/deck-plan.json'
mkdirSync('data/fsrs-validation', { recursive: true })
const tops = readDeckTops('data/collection.anki2', loadDeckConfig())
writeFileSync(OUT, `${JSON.stringify(tops, null, 1)}\n`)
console.log(`Saved ${Object.keys(tops).length} deck group(s) to ${OUT}`)
