// @vitest-environment jsdom
// The phone's way in: the app hosted on Firebase, stats read from your own Firebase project after signing in.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { forgetCloud } from './data/cloud'
import { mockData } from './data/mockData'
import { messages } from './i18n'
import { defaultNet, putSnapshot, signIn } from './lib/firebaseRest'
import { SNAPSHOT_VERSION } from './lib/snapshot'
import { fakeFirebase } from './test/fakeFirebase'

vi.mock('./app/useAnkiDay', async () => {
  const { ankiDayKey } = await vi.importActual<typeof import('./lib/dates')>('./lib/dates')
  return { useAnkiDay: (dayStartHour: number) => ankiDayKey(Date.now(), dayStartHour) }
})

const stats = { ...mockData, source: 'anki', generatedAt: '2026-11-18T09:00:00.000Z' }

/** A phone: no local API, the app hosted on Firebase, Google reachable (or not), and what the service worker kept. */
function phone({ hosted = true, offline = false, kept = null as string | null } = {}) {
  const google = fakeFirebase({ hosts: defaultNet().hosts })
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url)
    // The service worker answers /snapshot.json from what it kept, even with no connection
    if (address === '/snapshot.json' && kept) return new Response(kept)
    if (offline) throw new TypeError('Failed to fetch')
    if (address === '/__/firebase/init.json') return hosted ? new Response(JSON.stringify(google.config)) : new Response('{}', { status: 404 })
    if (address.startsWith('https://')) return google.net.fetch(address, init)
    return new Response('{"error":"Not found"}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('caches', { open: async () => ({ put: async () => {}, delete: async () => true }) })
  const upload = async (data: object = stats) => {
    const session = await signIn(google.config, google.email, google.password, google.net)
    await putSnapshot(google.config, session, JSON.stringify({ version: SNAPSHOT_VERSION, data }), stats.generatedAt, google.net)
  }
  return { google, upload }
}

async function signInAs(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText(messages.cloud.email), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(messages.cloud.password), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: messages.cloud.signIn }))
}

beforeEach(() => forgetCloud())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the app on Firebase, on a phone', () => {
  it('asks you to sign in first, and never shows sample data in the meantime', async () => {
    phone()
    render(<App />)
    expect(await screen.findByRole('heading', { name: messages.cloud.signInTitle })).toBeTruthy()
    expect(screen.queryByText(messages.data.sampleTitle)).toBeNull()
  })

  it('shows your stats once you’re signed in, with their age, no Refresh, and a way to sign out', async () => {
    const { google, upload } = phone()
    await upload()
    render(<App />)
    await signInAs(google.email, google.password)
    expect(await screen.findByText(messages.data.snapshotTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: messages.data.refresh })).toBeNull()
    expect(screen.getByText(new RegExp(messages.cloud.footer))).toBeTruthy()
    expect(screen.getByRole('button', { name: messages.cloud.signOut })).toBeTruthy()
  })

  it('says when the email or password is wrong, and stays on the form', async () => {
    const { google } = phone()
    render(<App />)
    await signInAs(google.email, 'wrong')
    expect((await screen.findByRole('alert')).textContent).toContain(messages.cloud.errors.credentials)
    expect(screen.getByRole('button', { name: messages.cloud.signIn })).toBeTruthy()
  })

  it('goes straight to your stats next time, without asking again', async () => {
    const { google, upload } = phone()
    await upload()
    const first = render(<App />)
    await signInAs(google.email, google.password)
    await screen.findByText(messages.data.snapshotTitle)
    first.unmount()
    render(<App />)
    expect(await screen.findByText(messages.data.snapshotTitle)).toBeTruthy()
    expect(screen.queryByLabelText(messages.cloud.email)).toBeNull()
  })

  it('signs out, and asks again', async () => {
    const { google, upload } = phone()
    await upload()
    render(<App />)
    await signInAs(google.email, google.password)
    fireEvent.click(await screen.findByRole('button', { name: messages.cloud.signOut }))
    expect(await screen.findByRole('heading', { name: messages.cloud.signInTitle })).toBeTruthy()
  })

  it('opens with no connection from the snapshot the phone kept, not the sign-in form', async () => {
    const { google, upload } = phone()
    await upload()
    const online = render(<App />)
    await signInAs(google.email, google.password)
    await screen.findByText(messages.data.snapshotTitle)
    online.unmount()
    phone({ offline: true, kept: JSON.stringify({ version: SNAPSHOT_VERSION, data: stats }) })
    render(<App />)
    expect(await screen.findByText(messages.data.snapshotTitle)).toBeTruthy()
    expect(screen.queryByLabelText(messages.cloud.email)).toBeNull()
  })

  it('explains when nothing has been uploaded yet, rather than showing sample data as if it were yours', async () => {
    const { google } = phone()
    render(<App />)
    await signInAs(google.email, google.password)
    expect(await screen.findByText(messages.data.sampleTitle)).toBeTruthy()
    expect(screen.getByText(messages.data.sampleReason(messages.cloud.reasons.empty))).toBeTruthy()
    expect(screen.getByText(messages.data.sampleNext.cloud)).toBeTruthy()
  })

  it('asks again when the password was changed, instead of showing old stats', async () => {
    const { google, upload } = phone()
    await upload()
    render(<App />)
    await signInAs(google.email, google.password)
    await screen.findByText(messages.data.snapshotTitle)
    cleanup()
    const stored = JSON.parse(localStorage.getItem('anki-analytics:cloud-session')!)
    localStorage.setItem('anki-analytics:cloud-session', JSON.stringify({ ...stored, expiresAt: 0 }))
    google.revokeRefreshTokens()
    render(<App />)
    expect(await screen.findByRole('heading', { name: messages.cloud.signInTitle })).toBeTruthy()
  })
})

describe('the app on the Mac', () => {
  const live = JSON.stringify({ ...stats, generatedAt: new Date().toISOString() })
  const mac = (cloud: object | null) =>
    vi.fn(async (url: string) => (url === '/api/status' ? new Response(JSON.stringify({ ankiRunning: false, updateAvailable: false, sourceModified: null, cloud })) : new Response(live)))

  it('never asks to sign in to Firebase, and keeps saying it’s all local when uploads are off', async () => {
    vi.stubGlobal('fetch', mac(null))
    render(<App />)
    expect(await screen.findByText(new RegExp(messages.data.footerLive))).toBeTruthy()
    expect(screen.queryByLabelText(messages.cloud.email)).toBeNull()
  })

  it('says honestly that a copy goes to Firebase, once uploads are on', async () => {
    vi.stubGlobal('fetch', mac({ uploadedAt: '2026-11-18T10:00:00.000Z' }))
    render(<App />)
    expect(await screen.findByText(new RegExp(messages.cloud.footerLive))).toBeTruthy()
    expect(screen.queryByText(new RegExp(`${messages.data.footerLive.slice(0, 20)}.*Nothing leaves`))).toBeNull()
  })

  it('shows when uploading has stopped working, until dismissed', async () => {
    vi.stubGlobal('fetch', mac({ problem: { message: 'Firebase sign-in failed.', at: '2026-11-18T11:00:00.000Z' } }))
    render(<App />)
    const banner = await screen.findByText(messages.cloud.problem('Firebase sign-in failed.'))
    expect(banner).toBeTruthy()
    fireEvent.click(banner.parentElement!.querySelector('button')!)
    await waitFor(() => expect(screen.queryByText(messages.cloud.problem('Firebase sign-in failed.'))).toBeNull())
    await act(async () => void window.dispatchEvent(new Event('focus')))
    expect(screen.queryByText(messages.cloud.problem('Firebase sign-in failed.'))).toBeNull() // the same failure stays dismissed
  })

  it('keeps a dismissed upload problem dismissed when a retry fails the same way a few minutes later', async () => {
    let retries = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url !== '/api/status') return new Response(live)
        retries += 1
        return new Response(JSON.stringify({ ankiRunning: false, updateAvailable: false, sourceModified: null, cloud: { problem: { message: 'Couldn’t reach Firebase. Will try again.', at: `2026-11-18T11:0${retries}:00.000Z` } } }))
      }),
    )
    render(<App />)
    const banner = await screen.findByText(messages.cloud.problem('Couldn’t reach Firebase. Will try again.'))
    fireEvent.click(banner.parentElement!.querySelector('button')!)
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await act(async () => {})
    expect(retries).toBeGreaterThan(1)
    expect(screen.queryByText(messages.cloud.problem('Couldn’t reach Firebase. Will try again.'))).toBeNull()
  })
})
