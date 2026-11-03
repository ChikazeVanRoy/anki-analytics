// Safely copies the Anki collection into ./data (git-ignored).
// The original is only ever read, never modified.
// Used by both `npm run copy-collection` and the API's refresh endpoint.

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ANKI_DIR = join(homedir(), 'Library', 'Application Support', 'Anki2')
const DEST_DIR = fileURLToPath(new URL('../data/', import.meta.url))
export const COLLECTION_COPY = join(DEST_DIR, 'collection.anki2')

/** An expected, user-fixable problem (e.g. Anki is open). Its message is shown in the UI. */
export class CopyError extends Error {}

function matches(pgrepArgs: string) {
  try {
    execSync(`pgrep ${pgrepArgs}`, { stdio: 'ignore' })
    return true
  } catch {
    return false // pgrep exits non-zero when nothing matches
  }
}

// Exact process name, or anything launched from Anki.app. A loose "anki" match would also
// hit unrelated processes such as macOS's "voicebankingd".
const ankiIsRunning = () => matches('-x -i anki') || matches('-f "Anki\\.app/Contents/"')

export function copyCollection(profileName = process.env.ANKI_PROFILE): { profile: string; bytes: number } {
  if (ankiIsRunning()) throw new CopyError('Anki is running. Quit Anki completely, then try again.')

  const profiles = existsSync(ANKI_DIR)
    ? readdirSync(ANKI_DIR).filter((name) => existsSync(join(ANKI_DIR, name, 'collection.anki2')))
    : []
  const profile = profileName ?? (profiles.length === 1 ? profiles[0] : undefined)
  if (!profile) throw new CopyError(`Found profiles: ${profiles.join(', ') || 'none'}. Set ANKI_PROFILE=<name>.`)

  const source = join(ANKI_DIR, profile, 'collection.anki2')
  if (!existsSync(source)) throw new CopyError(`No collection found for profile "${profile}".`)
  // A leftover write-ahead log means Anki didn't close cleanly; the copy could be incomplete.
  if (existsSync(`${source}-wal`)) {
    throw new CopyError('Anki did not close cleanly. Open and quit Anki once, then try again.')
  }

  mkdirSync(DEST_DIR, { recursive: true })
  // Remove SQLite side-files left by reading the previous copy, so they can't be replayed onto the new one
  for (const suffix of ['-wal', '-shm']) rmSync(`${COLLECTION_COPY}${suffix}`, { force: true })
  copyFileSync(source, COLLECTION_COPY)
  return { profile, bytes: statSync(COLLECTION_COPY).size }
}
