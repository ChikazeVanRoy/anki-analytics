// Saves the stats the API would send to one file, so they can be shown without the API or the collection.
// The file holds personal data, so it lives in the git-ignored data/ folder and only this user can read it.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AnkiData } from '../src/data/types.ts'
import { wrapSnapshot } from '../src/lib/snapshot.ts'
import { CopyError } from './collection.ts'

export const SNAPSHOT_FILE = fileURLToPath(new URL('../data/snapshot.json', import.meta.url))

/** Swaps the finished file in, so a reader sees the old snapshot or the new one and never half of one. */
export function writeSnapshot(data: AnkiData, path = SNAPSHOT_FILE) {
  mkdirSync(dirname(path), { recursive: true })
  const unfinished = `${path}.${process.pid}.tmp` // per process, so two runs at once can't share a half-written file
  writeFileSync(unfinished, JSON.stringify(wrapSnapshot(data)), { mode: 0o600 })
  renameSync(unfinished, path)
}

/** The saved file's text, or null if there isn't one. */
export function readSnapshotFile(path = SNAPSHOT_FILE) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

export interface SnapshotDeps {
  collectionPath: string
  copy: () => unknown
  read: (path: string) => AnkiData
  write: (data: AnkiData) => void
}

/**
 * Copies the latest collection and saves a snapshot of it. While the copy can't be made (say Anki is open), the
 * existing copy is used instead: its stats are still true, and the snapshot records when that copy was made.
 * Returns why the copy was skipped, if it was. Throws the CopyError when there is no copy to fall back on.
 */
export function makeSnapshot({ collectionPath, copy, read, write }: SnapshotDeps): { data: AnkiData; skippedCopy?: string } {
  let skippedCopy: string | undefined
  try {
    copy()
  } catch (err) {
    if (!(err instanceof CopyError) || !existsSync(collectionPath)) throw err
    skippedCopy = err.message
  }
  const data = read(collectionPath)
  write(data)
  return { data, skippedCopy }
}
