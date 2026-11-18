// Uploads the phone's snapshot to your own Firebase project (free Spark plan), so the phone can read it with the Mac
// asleep. It only ever sends what phoneAccess.ts already allows the phone to see: the snapshot with the note text removed.
// The sign-in password lives in the macOS Keychain, never in a file or the repo; data/cloud.json holds only the project's
// public web settings and the email. Nothing here runs unless `npm run cloud -- login` has been done.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CloudError, defaultNet, freshSession, putSnapshot, signIn, type FirebaseConfig, type Net, type Session } from '../src/lib/firebaseRest.ts'
import { phoneSnapshot } from './phoneAccess.ts'
import { readSnapshotFile } from './snapshot.ts'

export const CLOUD_SETTINGS_FILE = fileURLToPath(new URL('../data/cloud.json', import.meta.url))
export const CLOUD_STATUS_FILE = fileURLToPath(new URL('../data/cloud-status.json', import.meta.url))
export const RULES_FILE = fileURLToPath(new URL('../data/firestore.rules', import.meta.url))
export const KEYCHAIN_SERVICE = 'anki-analytics-firebase'

export interface CloudSettings extends FirebaseConfig {
  email: string
}

const PROJECT_ID = /^[a-z][a-z0-9-]{3,29}$/
const API_KEY = /^[A-Za-z0-9_-]{20,80}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The settings if they're all there and well formed. They go into URLs, so nothing else gets through. */
export function parseCloudSettings(raw: unknown): CloudSettings | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { projectId, apiKey, email } = raw as Record<string, unknown>
  return typeof projectId === 'string' && PROJECT_ID.test(projectId) && typeof apiKey === 'string' && API_KEY.test(apiKey) && typeof email === 'string' && EMAIL.test(email)
    ? { projectId, apiKey, email }
    : null
}

export function loadCloudSettings(path = CLOUD_SETTINGS_FILE): CloudSettings | null {
  try {
    return parseCloudSettings(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

function writePrivate(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, { mode: 0o600 })
}

export const saveCloudSettings = (settings: CloudSettings, path = CLOUD_SETTINGS_FILE) => writePrivate(path, JSON.stringify(settings, null, 2))

/**
 * The security rules for the snapshot document: only your account may read or write it, and nothing else in the database
 * is open to anyone. Anyone can *create* an account with the project's public API key, so the rules name your account's id
 * rather than just asking for a signed-in user.
 */
export function firestoreRules(uid: string): string {
  if (!/^[A-Za-z0-9]{10,40}$/.test(uid)) throw new Error('That doesn’t look like a Firebase account id.')
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /snapshots/latest {
      allow read, write: if request.auth != null && request.auth.uid == '${uid}';
    }
  }
}
`
}

// --- the password, kept by macOS ---

export interface Keychain {
  read: (email: string) => string | null
  /** Asks you for the password itself, so this program never sees it typed. */
  save: (email: string) => void
  remove: (email: string) => void
}

/** Fixed arguments and no shell. */
const security = (args: string[], stdio: 'inherit' | 'pipe' = 'pipe') =>
  execFileSync('security', args, { encoding: 'utf8', stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'ignore'] })

export const macKeychain: Keychain = {
  read(email) {
    try {
      return security(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', email, '-w']).replace(/\n$/, '') || null
    } catch {
      return null // no such item
    }
  },
  // `-w` last, with no value, makes `security` prompt for the password (and again to confirm it)
  save: (email) => void security(['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', email, '-w'], 'inherit'),
  remove(email) {
    try {
      security(['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', email])
    } catch {
      // Wasn't there
    }
  },
}

// --- what happened last ---

export interface CloudStatus {
  /** The snapshot (by its generatedAt) that's up there now. */
  generatedAt?: string
  uploadedAt?: string
  problem?: { kind: string; message: string; at: string }
}

export function readCloudStatus(path = CLOUD_STATUS_FILE): CloudStatus {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CloudStatus
    return typeof raw === 'object' && raw !== null ? raw : {}
  } catch {
    return {}
  }
}

export const writeCloudStatus = (status: CloudStatus, path = CLOUD_STATUS_FILE) => writePrivate(path, JSON.stringify(status))

/** For the page: is the upload set up, and has it been failing. */
export function cloudInfo(settings = loadCloudSettings(), status = readCloudStatus()): { uploadedAt?: string; problem?: { message: string; at: string } } | null {
  return settings ? { uploadedAt: status.uploadedAt, problem: status.problem && { message: status.problem.message, at: status.problem.at } } : null
}

// --- the upload ---

export type UploadOutcome = 'off' | 'no-snapshot' | 'unchanged' | 'uploaded' | 'failed'

export interface UploadResult {
  outcome: UploadOutcome
  message: string
}

export interface CloudDeps {
  settings: () => CloudSettings | null
  keychain: Pick<Keychain, 'read'>
  /** The saved snapshot file's text. */
  snapshot: () => string | null
  net: Net
  readStatus: () => CloudStatus
  writeStatus: (status: CloudStatus) => void
  /** Kept between uploads, so signing in happens once rather than every time. */
  session: { current: Session | null }
}

/** After a failure only you can fix (wrong password, rules, size), trying again every few minutes would just hammer Google. */
const BACKOFF_MS = 60 * 60_000
const NEEDS_YOU: string[] = ['credentials', 'denied', 'too-big']

async function signedIn(deps: CloudDeps, settings: CloudSettings): Promise<Session> {
  const kept = deps.session.current
  if (kept) {
    try {
      return (deps.session.current = await freshSession(settings, kept, deps.net))
    } catch (err) {
      if (!(err instanceof CloudError && err.kind === 'credentials')) throw err
      deps.session.current = null // the refresh token stopped working: sign in again below
    }
  }
  const password = deps.keychain.read(settings.email)
  if (!password) throw new CloudError('credentials', 'No password is saved. Run: npm run cloud -- login')
  return (deps.session.current = await signIn(settings, settings.email, password, deps.net))
}

export async function uploadSnapshot(deps: CloudDeps, { force = false } = {}): Promise<UploadResult> {
  const settings = deps.settings()
  if (!settings) return { outcome: 'off', message: 'Cloud upload isn’t set up.' }
  const saved = deps.snapshot()
  if (saved === null) return { outcome: 'no-snapshot', message: 'There’s no snapshot to upload yet.' }

  let text: string
  let generatedAt: string
  try {
    text = phoneSnapshot(saved)
    generatedAt = (JSON.parse(text) as { data: { generatedAt: string } }).data.generatedAt
    if (typeof generatedAt !== 'string') throw new Error('No date')
  } catch {
    return { outcome: 'failed', message: 'The saved snapshot couldn’t be read.' }
  }

  const status = deps.readStatus()
  if (!force && !status.problem && status.generatedAt === generatedAt) return { outcome: 'unchanged', message: 'Already up to date.' }
  const { problem } = status
  if (!force && problem && NEEDS_YOU.includes(problem.kind) && deps.net.now() - Date.parse(problem.at) < BACKOFF_MS) return { outcome: 'failed', message: problem.message }

  try {
    let session = await signedIn(deps, settings)
    try {
      await putSnapshot(settings, session, text, generatedAt, deps.net)
    } catch (err) {
      if (!(err instanceof CloudError && err.kind === 'credentials')) throw err
      // The token was refused (say the account was signed out everywhere): one fresh sign-in, then it's final
      deps.session.current = null
      session = await signedIn(deps, settings)
      await putSnapshot(settings, session, text, generatedAt, deps.net)
    }
    deps.writeStatus({ generatedAt, uploadedAt: new Date(deps.net.now()).toISOString() })
    return { outcome: 'uploaded', message: 'Uploaded the latest snapshot for your phone.' }
  } catch (err) {
    const problem = err instanceof CloudError ? err : new CloudError('server', err instanceof Error ? err.message : String(err))
    const message = describe(problem)
    deps.writeStatus({ ...status, problem: { kind: problem.kind, message, at: new Date(deps.net.now()).toISOString() } })
    return { outcome: 'failed', message }
  }
}

/** What to tell you, and what to do about it. */
function describe(err: CloudError): string {
  switch (err.kind) {
    case 'credentials':
      return `Firebase sign-in failed (${err.message}). Run: npm run cloud -- login`
    case 'denied':
      return 'Firebase refused the upload. The security rules may not be deployed yet: run npm run cloud -- deploy'
    case 'too-big':
      return 'The snapshot is too big for one Firestore document.'
    case 'network':
      return 'Couldn’t reach Firebase. Will try again.'
    default:
      return `Firebase said: ${err.message}`
  }
}

const memory: { current: Session | null } = { current: null }

/** The real thing: your settings, your Keychain, the saved snapshot, Google. */
export const realCloudDeps = (): CloudDeps => ({
  settings: loadCloudSettings,
  keychain: macKeychain,
  snapshot: readSnapshotFile,
  net: defaultNet(),
  readStatus: readCloudStatus,
  writeStatus: writeCloudStatus,
  session: memory,
})

export function removeCloudFiles() {
  for (const file of [CLOUD_SETTINGS_FILE, CLOUD_STATUS_FILE, RULES_FILE]) rmSync(file, { force: true })
}
