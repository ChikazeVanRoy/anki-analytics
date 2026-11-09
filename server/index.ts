// Starts the local API. Listens on 127.0.0.1 only, so it is not reachable from other devices.
// Run with: npm run api   (Node runs this TypeScript file directly, no build step)

import { existsSync } from 'node:fs'
import { readCurrentStats } from './anki.ts'
import { createApiServer } from './app.ts'
import { AUTO_SNAPSHOT_EVERY_MS, refreshSnapshotIfStale } from './autoSnapshot.ts'
import { ankiStatus, COLLECTION_COPY, copyCollection } from './collection.ts'
import { makeSnapshot, SNAPSHOT_FILE, writeSnapshot } from './snapshot.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.ANKI_ANALYTICS_PORT) || 5174

createApiServer().listen(PORT, HOST, () => {
  console.log(`Anki API on http://${HOST}:${PORT}  (GET /api/stats, POST /api/refresh)`)
  const check = () =>
    refreshSnapshotIfStale({
      hasSnapshot: () => existsSync(SNAPSHOT_FILE),
      updateAvailable: () => ankiStatus().updateAvailable,
      save: () => void makeSnapshot({ collectionPath: COLLECTION_COPY, copy: copyCollection, read: readCurrentStats, write: (data) => writeSnapshot(data) }),
      log: console.log,
    })
  check()
  setInterval(check, AUTO_SNAPSHOT_EVERY_MS).unref()
})
