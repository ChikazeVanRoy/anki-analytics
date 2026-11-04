// CLI: npm run sync    One sync (see ankiSync.ts). The launcher runs this each time it starts.
// Its result goes to data/sync-status.json, which the page reads. A problem only you can fix also shows a macOS notification.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { readCurrentStats } from './anki.ts'
import { SYNC_STATUS_FILE, syncOnce, type SyncOutcome } from './ankiSync.ts'
import { ankiIsRunning, COLLECTION_COPY, copyCollection, profileProblem } from './collection.ts'
import { makeSnapshot, writeSnapshot } from './snapshot.ts'

const NEEDS_YOU: SyncOutcome[] = ['stuck', 'failed']

/** Fixed arguments and no shell. */
const run = (command: string, ...args: string[]) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })

function succeeds(command: string, ...args: string[]) {
  try {
    run(command, ...args)
    return true
  } catch {
    return false
  }
}

const result = await syncOnce({
  ankiRunning: ankiIsRunning,
  blocker: profileProblem,
  // Only asks this Mac whether it has a route out; nothing is sent anywhere
  online: () => succeeds('route', '-n', 'get', 'default'),
  // Anki brings itself to the front whatever `open` is told, so it shows for the length of the sync
  openAnki: () => void run('open', '-a', 'Anki'),
  quitAnki: () => void run('osascript', '-e', 'tell application "Anki" to quit'),
  snapshot: () =>
    makeSnapshot({ collectionPath: COLLECTION_COPY, copy: copyCollection, read: readCurrentStats, write: (data) => writeSnapshot(data) }),
  sleep,
})

mkdirSync(dirname(SYNC_STATUS_FILE), { recursive: true })
writeFileSync(SYNC_STATUS_FILE, JSON.stringify({ ...result, at: new Date().toISOString() }), { mode: 0o600 })
console.log(`${new Date().toISOString()} ${result.outcome}: ${result.message}`)
if (NEEDS_YOU.includes(result.outcome)) {
  // Passed as arguments, so a message can't change the script
  succeeds('osascript', '-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title "Anki Analytics"', '-e', 'end run', result.message)
  process.exitCode = 1
}
