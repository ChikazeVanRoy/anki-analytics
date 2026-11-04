// Safely copies the Anki collection into ./data (git-ignored).
// The original is only ever read, never modified.
// Used by both `npm run copy-collection` and the API's refresh endpoint.

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ANKI_DIR = join(homedir(), 'Library', 'Application Support', 'Anki2')
const DEST_DIR = fileURLToPath(new URL('../data/', import.meta.url))
export const COLLECTION_COPY = join(DEST_DIR, 'collection.anki2')

/** An expected, user-fixable problem (e.g. Anki is open). Its message is shown in the UI. */
export class CopyError extends Error {}

/** Runs pgrep with fixed arguments. execFileSync passes them directly, with no shell to interpret them. */
function matches(...pgrepArgs: string[]) {
  try {
    execFileSync('pgrep', pgrepArgs, { stdio: 'ignore' })
    return true
  } catch {
    return false // pgrep exits non-zero when nothing matches
  }
}

// Exact process name, or anything launched from Anki.app. A loose "anki" match would also
// hit unrelated processes such as macOS's "voicebankingd".
export const ankiIsRunning = () => matches('-x', '-i', 'anki') || matches('-f', 'Anki\\.app/Contents/')

/** Where this runs against. Tests pass throwaway folders, so they never touch Anki's files or the real copy. */
export interface CopyPlaces {
  ankiDir: string
  copyPath: string
  ankiRunning: () => boolean
}
const REAL_PLACES: CopyPlaces = { ankiDir: ANKI_DIR, copyPath: COLLECTION_COPY, ankiRunning: ankiIsRunning }

const findProfiles = (ankiDir: string) =>
  existsSync(ankiDir) ? readdirSync(ankiDir).filter((name) => existsSync(join(ankiDir, name, 'collection.anki2'))) : []

export interface AnkiStatus {
  ankiRunning: boolean
  /** Anki is closed and its collection is newer than the copy, so a refresh would bring in new reviews. */
  updateAvailable: boolean
  /** When Anki's collection last changed (ms), or null if it can't be found. */
  sourceModified: number | null
}

/** A refresh only helps once Anki is closed, and only if its collection changed after the copy was made. */
export function canUpdate(running: boolean, cleanClose: boolean, sourceModified: number | null, copyModified: number | null) {
  if (running || !cleanClose || sourceModified === null) return false
  return copyModified === null || sourceModified > copyModified
}

const modified = (path: string) => (existsSync(path) ? statSync(path).mtimeMs : null)

/** Whether a refresh is worth offering. Only looks at file dates: it never opens Anki's collection. */
export function ankiStatus(profileName = process.env.ANKI_PROFILE, places = REAL_PLACES): AnkiStatus {
  const ankiRunning = places.ankiRunning()
  const profiles = findProfiles(places.ankiDir)
  const profile = profileName ?? (profiles.length === 1 ? profiles[0] : undefined)
  const source = profile && profiles.includes(profile) ? join(places.ankiDir, profile, 'collection.anki2') : null
  const sourceModified = source ? modified(source) : null
  const cleanClose = !!source && !existsSync(`${source}-wal`)
  return { ankiRunning, sourceModified, updateAvailable: canUpdate(ankiRunning, cleanClose, sourceModified, modified(places.copyPath)) }
}

export function copyCollection(profileName = process.env.ANKI_PROFILE, places = REAL_PLACES): { profile: string; bytes: number } {
  if (places.ankiRunning()) throw new CopyError('Anki is running. Quit Anki completely, then try again.')

  const profiles = findProfiles(places.ankiDir)
  const profile = profileName ?? (profiles.length === 1 ? profiles[0] : undefined)
  if (!profile) throw new CopyError(`Found profiles: ${profiles.join(', ') || 'none'}. Set ANKI_PROFILE=<name>.`)
  // Only accept an existing profile folder name, so ANKI_PROFILE can't point outside Anki's folder (e.g. "../..")
  if (!profiles.includes(profile)) throw new CopyError(`Unknown profile "${profile}". Found: ${profiles.join(', ') || 'none'}.`)

  const source = join(places.ankiDir, profile, 'collection.anki2')
  if (!existsSync(source)) throw new CopyError(`No collection found for profile "${profile}".`)
  // A leftover write-ahead log means Anki didn't close cleanly; the copy could be incomplete.
  if (existsSync(`${source}-wal`)) {
    throw new CopyError('Anki did not close cleanly. Open and quit Anki once, then try again.')
  }

  const { copyPath } = places
  mkdirSync(dirname(copyPath), { recursive: true })
  // Remove SQLite side-files left by reading the previous copy, so they can't be replayed onto the new one
  for (const suffix of ['-wal', '-shm']) rmSync(`${copyPath}${suffix}`, { force: true })
  copyFileSync(source, copyPath)
  return { profile, bytes: statSync(copyPath).size }
}
