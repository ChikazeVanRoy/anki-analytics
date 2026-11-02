// Safely copies the Anki collection into ./data (git-ignored).
// The original is only ever read, never modified.
// Usage: npm run copy-collection            (auto-detects a single profile)
//        ANKI_PROFILE=Name npm run copy-collection

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ANKI_DIR = join(homedir(), 'Library', 'Application Support', 'Anki2')
const DEST_DIR = fileURLToPath(new URL('../data/', import.meta.url))

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function ankiIsRunning() {
  try {
    execSync('pgrep -i anki', { stdio: 'ignore' })
    return true
  } catch {
    return false // pgrep exits non-zero when nothing matches
  }
}

if (ankiIsRunning()) fail('Anki is running. Quit Anki completely, then try again.')

const profiles = readdirSync(ANKI_DIR).filter((name) => existsSync(join(ANKI_DIR, name, 'collection.anki2')))
const profile = process.env.ANKI_PROFILE ?? (profiles.length === 1 ? profiles[0] : undefined)
if (!profile) fail(`Found profiles: ${profiles.join(', ') || 'none'}. Set ANKI_PROFILE=<name>.`)

const source = join(ANKI_DIR, profile, 'collection.anki2')
if (!existsSync(source)) fail(`No collection at ${source}`)
// A leftover write-ahead log means Anki didn't close cleanly; the copy could be incomplete.
if (existsSync(`${source}-wal`)) fail('Found collection.anki2-wal. Open and quit Anki once so it closes cleanly.')

mkdirSync(DEST_DIR, { recursive: true })
const dest = join(DEST_DIR, 'collection.anki2')
copyFileSync(source, dest)
console.log(`✓ Copied profile "${profile}" (${(statSync(dest).size / 1e6).toFixed(1)} MB) -> data/collection.anki2`)
