// Keeps the saved snapshot (what the phone shows) up to date while the server runs in the background, so it no longer
// depends on a browser tab being open on the Mac. It only reads: when Anki has closed cleanly with newer data than the
// copy, it takes a fresh copy (collection.ts refuses while Anki runs) and saves a snapshot from it. It never opens Anki.

export const AUTO_SNAPSHOT_EVERY_MS = 5 * 60_000

export interface AutoSnapshotDeps {
  hasSnapshot: () => boolean
  /** Whether Anki has closed cleanly with newer data than the copy (ankiStatus().updateAvailable) */
  updateAvailable: () => boolean
  /** May take a while: the stats are read in a worker thread. */
  save: () => void | Promise<void>
  log: (message: string) => void
}

/** One check. Resolves to whether a snapshot was saved. A failure is logged and left for the next check. */
export async function refreshSnapshotIfStale({ hasSnapshot, updateAvailable, save, log }: AutoSnapshotDeps): Promise<boolean> {
  try {
    if (hasSnapshot() && !updateAvailable()) return false
    await save()
    log('snapshot: saved a fresh one for the phone')
    return true
  } catch (err) {
    log(`snapshot: not refreshed (${err instanceof Error ? err.message : String(err)})`)
    return false
  }
}
