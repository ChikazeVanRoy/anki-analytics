// Reads the stats in a worker thread, so a slow read leaves the server free to answer: the saved snapshot, the status
// and the pages. One thread per read: it starts in well under a second, and nothing is left running between reads.

import { Worker } from 'node:worker_threads'
import type { AnkiData } from '../src/data/types.ts'
import { DeckConfigError } from './deckGroups.ts'

type Reply = { ok: true; data: AnkiData } | { ok: false; message: string; config: boolean }

export function readStatsInWorker(collectionPath: string, script = new URL('./statsWorker.ts', import.meta.url)): Promise<AnkiData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: collectionPath })
    let answered = false
    worker.once('message', (reply: Reply) => {
      answered = true
      if (reply.ok) resolve(reply.data)
      else reject(reply.config ? new DeckConfigError(reply.message) : new Error(reply.message))
    })
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (!answered) reject(new Error(`The stats reader stopped without an answer (exit code ${code}).`))
    })
  })
}
