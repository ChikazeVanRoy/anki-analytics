// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultNet, putSnapshot, signIn } from '../lib/firebaseRest'
import { SNAPSHOT_VERSION } from '../lib/snapshot'
import { fakeFirebase } from '../test/fakeFirebase'
import { forgetCloud, loadCloudSnapshot, loadFirebaseConfig, signInToCloud, signOutOfCloud } from './cloud'

const stats = { source: 'anki', generatedAt: '2026-11-18T10:00:00.000Z', dayStartHour: 4, decks: [], daily: [] }
const snapshotText = (data: object = stats) => JSON.stringify({ version: SNAPSHOT_VERSION, data })

/** Google, with its real addresses, and a page hosted on Firebase (or not). */
function setup({ hosted = true } = {}) {
  const google = fakeFirebase({ hosts: defaultNet().hosts })
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url)
    if (address === '/__/firebase/init.json') {
      return hosted ? new Response(JSON.stringify(google.config)) : new Response('<!doctype html>', { status: 200 })
    }
    if (address.startsWith('https://')) return google.net.fetch(address, init)
    return new Response('{"error":"Not found"}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  const kept = new Map<string, string>()
  const cache = {
    put: vi.fn(async (key: string, response: Response) => void kept.set(key, await response.text())),
    delete: vi.fn(async (key: string) => kept.delete(key)),
  }
  vi.stubGlobal('caches', { open: async () => cache })
  /** The Mac's upload. */
  const upload = async (text = snapshotText()) => {
    const session = await signIn(google.config, google.email, google.password, google.net)
    await putSnapshot(google.config, session, text, stats.generatedAt, google.net)
  }
  return { google, fetchMock, cache, kept, upload }
}

beforeEach(() => forgetCloud())
afterEach(() => vi.unstubAllGlobals())

describe('loadFirebaseConfig', () => {
  it('reads the project from the address Firebase Hosting serves', async () => {
    const { google } = setup()
    expect(await loadFirebaseConfig()).toEqual(google.config)
  })

  it('is null anywhere else: a 404, a page where JSON should be, or no connection', async () => {
    setup({ hosted: false })
    expect(await loadFirebaseConfig()).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    expect(await loadFirebaseConfig()).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await loadFirebaseConfig()).toBeNull()
  })

  it('asks only once it has an answer', async () => {
    const { fetchMock } = setup()
    await loadFirebaseConfig()
    await loadFirebaseConfig()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('signing in', () => {
  it('remembers you for next time', async () => {
    const { google } = setup()
    expect(await signInToCloud(` ${google.email} `, google.password)).toBeNull()
    expect(localStorage.getItem('anki-analytics:cloud-session')).toContain('refreshToken')
  })

  it('says why not for a wrong password, and remembers nothing', async () => {
    const { google } = setup()
    expect(await signInToCloud(google.email, 'wrong')).toBe('credentials')
    expect(localStorage.getItem('anki-analytics:cloud-session')).toBeNull()
  })

  it('can’t be done off Firebase Hosting', async () => {
    setup({ hosted: false })
    expect(await signInToCloud('me@example.com', 'x')).toBe('network')
  })
})

describe('loadCloudSnapshot', () => {
  it('does nothing off Firebase Hosting, so the Mac’s own app never asks', async () => {
    setup({ hosted: false })
    expect(await loadCloudSnapshot()).toEqual({ status: 'unavailable' })
  })

  it('asks you to sign in before anything else', async () => {
    setup()
    expect(await loadCloudSnapshot()).toEqual({ status: 'sign-in' })
  })

  it('gives the uploaded stats once signed in, and keeps them for opening offline', async () => {
    const { google, upload, kept } = setup()
    await upload()
    await signInToCloud(google.email, google.password)
    expect(await loadCloudSnapshot()).toEqual({ status: 'ok', data: stats })
    expect(JSON.parse(kept.get('/snapshot.json')!).data.generatedAt).toBe(stats.generatedAt)
  })

  it('says so when nothing has been uploaded yet', async () => {
    const { google } = setup()
    await signInToCloud(google.email, google.password)
    expect(await loadCloudSnapshot()).toEqual({ status: 'unavailable', kind: 'empty' })
  })

  it('refreshes a session that ran out, and keeps the new one', async () => {
    const { google, upload } = setup()
    await upload()
    await signInToCloud(google.email, google.password)
    const old = JSON.parse(localStorage.getItem('anki-analytics:cloud-session')!)
    localStorage.setItem('anki-analytics:cloud-session', JSON.stringify({ ...old, expiresAt: Date.now() - 1000 }))
    google.expireTokens()
    expect((await loadCloudSnapshot()).status).toBe('ok')
    expect(JSON.parse(localStorage.getItem('anki-analytics:cloud-session')!).idToken).not.toBe(old.idToken)
  })

  it('asks you to sign in again once it can’t be refreshed, and forgets the old session', async () => {
    const { google, upload } = setup()
    await upload()
    await signInToCloud(google.email, google.password)
    const old = JSON.parse(localStorage.getItem('anki-analytics:cloud-session')!)
    localStorage.setItem('anki-analytics:cloud-session', JSON.stringify({ ...old, expiresAt: Date.now() - 1000 }))
    google.revokeRefreshTokens()
    expect(await loadCloudSnapshot()).toEqual({ status: 'sign-in' })
    expect(localStorage.getItem('anki-analytics:cloud-session')).toBeNull()
  })

  it('being offline doesn’t sign you out', async () => {
    const { google } = setup()
    await signInToCloud(google.email, google.password)
    google.state.offline = true
    expect(await loadCloudSnapshot()).toEqual({ status: 'unavailable', kind: 'network' })
    expect(localStorage.getItem('anki-analytics:cloud-session')).not.toBeNull()
  })

  it('is refused for another account, and says so', async () => {
    const { google, upload } = setup()
    await upload()
    await signInToCloud(google.email, google.password)
    google.state.rulesDeployed = false
    expect(await loadCloudSnapshot()).toEqual({ status: 'unavailable', kind: 'denied' })
  })

  it('never takes sample data for your stats', async () => {
    const { google, upload } = setup()
    await upload(snapshotText({ ...stats, source: 'mock' }))
    await signInToCloud(google.email, google.password)
    expect(await loadCloudSnapshot()).toEqual({ status: 'unavailable', kind: 'server' })
  })

  it('still works where the Cache API is missing', async () => {
    const { google, upload } = setup()
    vi.stubGlobal('caches', undefined)
    await upload()
    await signInToCloud(google.email, google.password)
    expect((await loadCloudSnapshot()).status).toBe('ok')
  })
})

describe('a stalled connection', () => {
  it('gives up after a few seconds, so the saved snapshot can be shown, and keeps you signed in', async () => {
    const { google } = setup()
    await signInToCloud(google.email, google.password)
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => (String(url) === '/__/firebase/init.json' ? new Response(JSON.stringify(google.config)) : new Promise<Response>(() => {}))))
    const result = loadCloudSnapshot()
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await result).toEqual({ status: 'unavailable', kind: 'network' })
    expect(localStorage.getItem('anki-analytics:cloud-session')).not.toBeNull()
    vi.useRealTimers()
  })
})

describe('signing out', () => {
  it('forgets you and the snapshot kept for offline use', async () => {
    const { google, upload, kept } = setup()
    await upload()
    await signInToCloud(google.email, google.password)
    await loadCloudSnapshot()
    await signOutOfCloud()
    expect(localStorage.getItem('anki-analytics:cloud-session')).toBeNull()
    expect(kept.has('/snapshot.json')).toBe(false)
    expect(await loadCloudSnapshot()).toEqual({ status: 'sign-in' })
  })
})
