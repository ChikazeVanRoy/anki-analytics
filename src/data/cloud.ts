// The phone's way to its stats when the Mac can't be reached: your own Firebase project, signed in with an email and password.
// On Firebase Hosting the project's public web settings are served at /__/firebase/init.json, so nothing about the project
// is built into the app. Anywhere else (the Mac's own server, dev) that address answers 404 and none of this is used.

import { CloudError, defaultNet, freshSession, getSnapshot, signIn, type CloudErrorKind, type FirebaseConfig, type Net, type Session } from '../lib/firebaseRest'
import { parseSnapshot } from '../lib/snapshot'
import type { AnkiData } from './types'

const SESSION_KEY = 'anki-analytics:cloud-session'
/** The service worker's snapshot cache (src/sw.js). A snapshot kept there is what opens the app with no connection. */
const SNAPSHOT_CACHE = 'anki-analytics-snapshot'
const SNAPSHOT_URL = '/snapshot.json'
const CONFIG_TIMEOUT_MS = 3_000
/** The phone has a snapshot of its own to show, so Firebase gets a short wait: each request, and the whole of it. */
const REQUEST_TIMEOUT_MS = 6_000
const DEADLINE_MS = 8_000

let knownConfig: FirebaseConfig | null = null

/** The project this app is hosted by, or null when it isn't on Firebase Hosting (or can't be asked right now). */
export async function loadFirebaseConfig(): Promise<FirebaseConfig | null> {
  if (knownConfig) return knownConfig
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS)
  try {
    const res = await fetch('/__/firebase/init.json', { signal: controller.signal })
    const body = res.ok ? ((await res.json()) as Partial<FirebaseConfig>) : null
    if (body && typeof body.apiKey === 'string' && body.apiKey && typeof body.projectId === 'string' && body.projectId) {
      knownConfig = { apiKey: body.apiKey, projectId: body.projectId }
    }
  } catch {
    // Offline, or not JSON (a dev server answers every address with the page): not on Firebase
  } finally {
    clearTimeout(timer)
  }
  return knownConfig
}

/** For tests: forget the project and the session. */
export function forgetCloud() {
  knownConfig = null
  clearSession()
}

// Storage is only a convenience: without it you'd sign in each time.
function readSession(): Session | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<Session> | null
    return saved && typeof saved.idToken === 'string' && typeof saved.refreshToken === 'string' && typeof saved.uid === 'string' && typeof saved.expiresAt === 'number' ? (saved as Session) : null
  } catch {
    return null
  }
}

function saveSession(session: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // storage unavailable: nothing to do
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // storage unavailable: nothing to do
  }
}

/** Keeps the snapshot where the service worker looks for it, so the app opens offline with the latest one received. */
async function keepForOffline(text: string) {
  try {
    const cache = await caches.open(SNAPSHOT_CACHE)
    await cache.put(SNAPSHOT_URL, new Response(text, { headers: { 'Content-Type': 'application/json' } }))
  } catch {
    // No Cache API (plain http, private mode): it just won't open offline
  }
}

export type CloudLoad =
  | { status: 'ok'; data: AnkiData }
  | { status: 'sign-in' }
  /** `kind`: why, for when there's nothing else to show. 'empty': signed in, but nothing has been uploaded yet. */
  | { status: 'unavailable'; kind?: CloudErrorKind | 'empty' }

/** The newest snapshot in your Firebase project. Offline is "unavailable", never a reason to sign you out. */
export async function loadCloudSnapshot(net: Net = { ...defaultNet(), timeoutMs: REQUEST_TIMEOUT_MS }): Promise<CloudLoad> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const tooSlow = new Promise<CloudLoad>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'unavailable', kind: 'network' }), DEADLINE_MS)
  })
  try {
    return await Promise.race([readFromCloud(net), tooSlow])
  } finally {
    clearTimeout(timer)
  }
}

async function readFromCloud(net: Net): Promise<CloudLoad> {
  const config = await loadFirebaseConfig()
  if (!config) return { status: 'unavailable' }
  const kept = readSession()
  if (!kept) return { status: 'sign-in' }
  try {
    const session = await freshSession(config, kept, net)
    saveSession(session)
    const stored = await getSnapshot(config, session, net)
    if (!stored) return { status: 'unavailable', kind: 'empty' }
    const data = parseSnapshot<AnkiData>(JSON.parse(stored.text))
    if (!data) return { status: 'unavailable', kind: 'server' }
    await keepForOffline(stored.text)
    return { status: 'ok', data }
  } catch (err) {
    if (err instanceof CloudError) {
      if (err.kind === 'credentials') {
        clearSession()
        return { status: 'sign-in' }
      }
      return { status: 'unavailable', kind: err.kind }
    }
    return { status: 'unavailable', kind: 'server' }
  }
}

/** Signs in and remembers it. Returns why not, or null. */
export async function signInToCloud(email: string, password: string, net: Net = defaultNet()): Promise<CloudErrorKind | null> {
  const config = await loadFirebaseConfig()
  if (!config) return 'network'
  try {
    saveSession(await signIn(config, email.trim(), password, net))
    return null
  } catch (err) {
    return err instanceof CloudError ? err.kind : 'server'
  }
}

/** Forgets the account and the snapshot kept for offline use. */
export async function signOutOfCloud() {
  clearSession()
  try {
    await (await caches.open(SNAPSHOT_CACHE)).delete(SNAPSHOT_URL)
  } catch {
    // nothing kept
  }
}
