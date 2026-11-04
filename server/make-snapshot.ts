// CLI: npm run snapshot    Copies the collection if Anki is closed, then saves data/snapshot.json

import { readCurrentStats } from './anki.ts'
import { COLLECTION_COPY, copyCollection, CopyError } from './collection.ts'
import { DeckConfigError } from './deckGroups.ts'
import { makeSnapshot, SNAPSHOT_FILE, writeSnapshot } from './snapshot.ts'

try {
  const { data, skippedCopy } = makeSnapshot({
    collectionPath: COLLECTION_COPY,
    copy: copyCollection,
    read: readCurrentStats,
    write: (stats) => writeSnapshot(stats),
  })
  if (skippedCopy) console.warn(`! ${skippedCopy} Used the existing copy instead.`)
  console.log(`✓ Saved ${SNAPSHOT_FILE} (copied from Anki ${data.generatedAt})`)
} catch (err) {
  if (!(err instanceof CopyError || err instanceof DeckConfigError)) throw err
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
