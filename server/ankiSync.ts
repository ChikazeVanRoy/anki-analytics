// One sync at launch: opens Anki so it syncs with AnkiWeb, asks it to quit (it syncs again as it closes), then
// saves a new snapshot. Anki does all the writing to its own files. Anki is only ever asked to quit, never forced:
// if it won't close, a sync may be running or a dialog may need an answer, and that isn't this job's to decide.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SYNC_STATUS_FILE = fileURLToPath(new URL('../data/sync-status.json', import.meta.url))

export type SyncOutcome =
  | 'updated' // synced, and the snapshot is new
  | 'offline' // no network, so the snapshot only has what this Mac already knew
  | 'skipped' // Anki was already open, or isn't set up for this: nothing was touched
  | 'stuck' // Anki didn't close in time, and probably needs an answer
  | 'failed' // the snapshot couldn't be made, or came from an old copy

export interface SyncResult {
  outcome: SyncOutcome
  message: string
}

/** What the last sync did, as sync-anki.ts saves it. */
export interface SyncStatus extends SyncResult {
  at: string
}

/** The saved outcome, or null if there isn't a readable one: there's simply nothing to report. */
export function readSyncStatus(path = SYNC_STATUS_FILE): SyncStatus | null {
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8')) as Partial<SyncStatus>
    return typeof saved?.outcome === 'string' && typeof saved.message === 'string' && typeof saved.at === 'string' ? (saved as SyncStatus) : null
  } catch {
    return null
  }
}

export interface SyncDeps {
  ankiRunning: () => boolean
  /** Why Anki can't be opened unattended (say several profiles, which opens a chooser), or null. */
  blocker: () => string | null
  online: () => boolean
  openAnki: () => void
  quitAnki: () => void
  /** Saves a snapshot; says why if it had to use the old copy. */
  snapshot: () => { skippedCopy?: string }
  sleep: (ms: number) => Promise<void>
}

export const TIMING = {
  /** How long Anki gets to start. */
  startMs: 30_000,
  /** How long Anki gets to sync after opening. It syncs again on closing, so this needn't cover everything. */
  settleMs: 25_000,
  /** How long Anki gets to sync and close: a big media sync can take minutes. */
  quitMs: 180_000,
  pollMs: 1_000,
}

/** Waits until `done`, checking regularly. False if time ran out. */
async function waitFor(done: () => boolean, timeoutMs: number, { sleep, pollMs }: { sleep: SyncDeps['sleep']; pollMs: number }) {
  for (let waited = 0; waited < timeoutMs; waited += pollMs) {
    if (done()) return true
    await sleep(pollMs)
  }
  return done()
}

function saveSnapshot(deps: SyncDeps, success: SyncResult): SyncResult {
  try {
    const { skippedCopy } = deps.snapshot()
    return skippedCopy ? { outcome: 'failed', message: `Saved from the old copy: ${skippedCopy}` } : success
  } catch (err) {
    return { outcome: 'failed', message: err instanceof Error ? err.message : String(err) }
  }
}

async function runSync(deps: SyncDeps, timing: typeof TIMING): Promise<SyncResult> {
  if (deps.ankiRunning()) return { outcome: 'skipped', message: 'Anki is open, so it was left alone.' }
  const blocker = deps.blocker()
  if (blocker) return { outcome: 'skipped', message: blocker }
  if (!deps.online()) return saveSnapshot(deps, { outcome: 'offline', message: 'No network, so Anki wasn’t opened. Saved what this Mac has.' })

  const wait = { sleep: deps.sleep, pollMs: timing.pollMs }
  deps.openAnki()
  if (!(await waitFor(deps.ankiRunning, timing.startMs, wait))) return { outcome: 'failed', message: 'Anki didn’t start.' }

  await deps.sleep(timing.settleMs)

  try {
    deps.quitAnki()
  } catch {
    // Anki answers a quit with "User cancelled" (-128) even as it closes, so only its closing can say what happened
  }
  const closed = await waitFor(() => !deps.ankiRunning(), timing.quitMs, wait)
  if (!closed) return { outcome: 'stuck', message: 'Anki didn’t close. It may be asking you something, or this Mac may not allow asking it to quit.' }
  return saveSnapshot(deps, { outcome: 'updated', message: 'Synced and saved a new snapshot.' })
}

/** Always reports back: the launcher carries on, and a silent failure could leave Anki open and hidden. */
export async function syncOnce(deps: SyncDeps, timing = TIMING): Promise<SyncResult> {
  try {
    return await runSync(deps, timing)
  } catch (err) {
    return { outcome: 'failed', message: err instanceof Error ? err.message : String(err) }
  }
}
