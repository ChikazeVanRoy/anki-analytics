// The worker thread that reads the stats (see readStats.ts). Reading replays the whole review log with synchronous
// SQLite, which on a busy Mac can take a minute; here it doesn't stop the server answering anything else meanwhile.

import { parentPort, workerData } from 'node:worker_threads'
import { readCurrentStats } from './anki.ts'
import { DeckConfigError } from './deckGroups.ts'

try {
  parentPort!.postMessage({ ok: true, data: readCurrentStats(workerData as string) })
} catch (err) {
  // Errors lose their class on the way back, so say which kind it was
  parentPort!.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err), config: err instanceof DeckConfigError })
}
