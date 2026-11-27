// Starts the local API. Listens on 127.0.0.1 only, so it is not reachable from other devices.
// Run with: npm run api   (Node runs this TypeScript file directly, no build step)

import { existsSync } from 'node:fs'
import { createApiServer } from './app.ts'
import { AUTO_SNAPSHOT_EVERY_MS, refreshSnapshotIfStale } from './autoSnapshot.ts'
import { ankiStatus, COLLECTION_COPY, copyCollection } from './collection.ts'
import { realCloudDeps, uploadSnapshot } from './cloud.ts'
import { readStatsInWorker } from './readStats.ts'
import { makeSnapshotAsync, SNAPSHOT_FILE, writeSnapshot } from './snapshot.ts'

const HOST = '127.0.0.1'
const PORT = Number(process.env.ANKI_ANALYTICS_PORT) || 5174

createApiServer().listen(PORT, HOST, () => {
  console.log(`Anki API on http://${HOST}:${PORT}  (GET /api/stats, POST /api/refresh)`)
  const check = () =>
    refreshSnapshotIfStale({
      hasSnapshot: () => existsSync(SNAPSHOT_FILE),
      updateAvailable: () => ankiStatus().updateAvailable,
      // The read happens in a worker thread, so the pages and the phone route keep answering while it runs
      save: async () => void (await makeSnapshotAsync({ collectionPath: COLLECTION_COPY, copy: copyCollection, read: readStatsInWorker, write: (data) => writeSnapshot(data) })),
      log: console.log,
    })
  // Sends the latest snapshot to your own Firebase project when that's set up (npm run cloud), and only when it changed
  let lastCloudNote = ''
  let uploading = false
  const upload = async () => {
    if (uploading) return // the last one is still going: a slow connection mustn't stack them up
    uploading = true
    try {
      const { outcome, message } = await uploadSnapshot(realCloudDeps())
      // A failure that keeps repeating is said once, not every five minutes
      if ((outcome === 'uploaded' || outcome === 'failed') && message !== lastCloudNote) console.log(`cloud: ${message}`)
      lastCloudNote = outcome === 'failed' ? message : ''
    } catch (err) {
      // Never let this take the server down: the page and the Tailscale route don't depend on it
      console.error('cloud: the upload failed unexpectedly:', err)
    } finally {
      uploading = false
    }
  }
  let ticking = false
  const tick = async () => {
    if (ticking) return // a slow read can outlast the five minutes between checks
    ticking = true
    try {
      await check()
      await upload() // after the check, so a snapshot it just saved goes straight to the phone
    } finally {
      ticking = false
    }
  }
  void tick()
  setInterval(() => void tick(), AUTO_SNAPSHOT_EVERY_MS).unref()
})
