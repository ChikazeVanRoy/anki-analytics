// Keeps the saved snapshot (what the phone shows) up to date while the server runs in the background, so it no longer
// depends on a browser tab being open on the Mac. It only reads: when Anki has closed cleanly with newer data than the
// copy, it takes a fresh copy (collection.ts refuses while Anki runs) and saves a snapshot from it. It never opens Anki.

export const AUTO_SNAPSHOT_EVERY_MS = 5 * 60_000

export interface AutoSnapshotDeps {
  hasSnapshot: () => boolean
  /** Whether Anki has closed cleanly with newer data than the copy (ankiStatus().updateAvailable) */
  updateAvailable: () => boolean
  save: () => void
  log: (message: string) => void
}

/** One check. Returns whether a snapshot was saved. A failure is logged and left for the next check. */
export function refreshSnapshotIfStale({ hasSnapshot, updateAvailable, save, log }: AutoSnapshotDeps): boolean {
  try {
    if (hasSnapshot() && !updateAvailable()) return false
    save()
    log('snapshot: saved a fresh one for the phone')
    return true
  } catch (err) {
    log(`snapshot: not refreshed (${err instanceof Error ? err.message : String(err)})`)
    return false
  }
}
