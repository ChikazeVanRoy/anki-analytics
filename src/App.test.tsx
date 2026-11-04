// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { mockData } from './data/mockData'
import { messages } from './i18n'
import { formatCopiedAt } from './lib/format'
import { SNAPSHOT_VERSION } from './lib/snapshot'

// The clock the page reads, so a test can cross midnight without stepping real intervals
const clock = vi.hoisted(() => ({ now: null as number | null }))
vi.mock('./app/useNow', () => ({ useNow: () => clock.now ?? Date.now() }))

function respondWith(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  cleanup()
  clock.now = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a saved snapshot', () => {
  const stats = { ...mockData, source: 'anki', generatedAt: '2026-11-01T09:00:00.000Z' }
  const noApi = (snapshot: () => Response) =>
    vi.fn(async (url: string) => {
      if (url === '/snapshot.json') return snapshot()
      throw new TypeError('Failed to fetch')
    })

  it('is shown with its age when the API can’t answer, and never as sample data', async () => {
    vi.stubGlobal('fetch', noApi(() => new Response(JSON.stringify({ version: SNAPSHOT_VERSION, data: stats }))))
    render(<App />)
    expect(await screen.findByText(messages.data.snapshotTitle)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(messages.data.lastUpdated(formatCopiedAt(stats.generatedAt)))
    expect(screen.queryByText(messages.data.sampleTitle)).toBeNull()
  })

  it('offers no refresh that can’t work, and no talk of servers, when the Mac can’t be reached', async () => {
    vi.stubGlobal('fetch', noApi(() => new Response(JSON.stringify({ version: SNAPSHOT_VERSION, data: stats }))))
    render(<App />)
    await screen.findByText(messages.data.snapshotTitle)
    expect(screen.queryByRole('button', { name: messages.data.refresh })).toBeNull()
    expect(screen.queryByText(new RegExp(messages.data.apiDown.slice(0, 12)))).toBeNull()
  })

  it('looks again when the app comes back into view: a newer snapshot, then live data', async () => {
    const newer = { ...stats, generatedAt: '2026-11-02T09:00:00.000Z' }
    let saved = stats
    let apiUp = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/snapshot.json') return new Response(JSON.stringify({ version: SNAPSHOT_VERSION, data: saved }))
        if (url === '/api/stats' && apiUp) return new Response(JSON.stringify(newer))
        if (url === '/api/status') return new Response('{}')
        throw new TypeError('Failed to fetch')
      }),
    )
    render(<App />)
    await screen.findByText(messages.data.snapshotTitle)
    saved = newer
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(messages.data.lastUpdated(formatCopiedAt(newer.generatedAt))))
    apiUp = true
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(screen.queryByText(messages.data.snapshotTitle)).toBeNull())
  })

  it('keeps the snapshot if looking again finds nothing, rather than turning to sample data', async () => {
    let up = true
    vi.stubGlobal('fetch', noApi(() => (up ? new Response(JSON.stringify({ version: SNAPSHOT_VERSION, data: stats })) : new Response('{}', { status: 404 }))))
    render(<App />)
    await screen.findByText(messages.data.snapshotTitle)
    up = false
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await act(async () => {})
    expect(screen.getByText(messages.data.snapshotTitle)).toBeTruthy()
    expect(screen.queryByText(messages.data.sampleTitle)).toBeNull()
  })

  it('still says why live data failed, so a broken config can be fixed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/snapshot.json' ? new Response(JSON.stringify({ version: SNAPSHOT_VERSION, data: stats })) : new Response('{"error":"Bad deck config"}', { status: 500 }),
      ),
    )
    render(<App />)
    expect(await screen.findByText(messages.data.sampleReason('Bad deck config'))).toBeTruthy()
  })

  it('leaves the last visit alone, as a snapshot can be older than it', async () => {
    const lastVisit = JSON.stringify({ reviews: 999_999, seconds: 0, started: 0, proven: 0, day: '2026-11-04', before: 0, streak: 0, badges: [] })
    localStorage.setItem('anki-analytics:last-visit', lastVisit)
    vi.stubGlobal('fetch', noApi(() => new Response(JSON.stringify({ version: SNAPSHOT_VERSION, data: stats }))))
    render(<App />)
    await screen.findByText(messages.data.snapshotTitle)
    await act(async () => {})
    expect(localStorage.getItem('anki-analytics:last-visit')).toBe(lastVisit)
    localStorage.removeItem('anki-analytics:last-visit')
  })

  it('isn’t used while the API answers', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(url === '/api/status' ? '{}' : JSON.stringify(stats)))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await screen.findAllByText(messages.data.live)
    expect(screen.queryByText(messages.data.snapshotTitle)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalledWith('/snapshot.json', expect.anything())
  })

  it('gives way to live data once a refresh works', async () => {
    let apiUp = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/snapshot.json') return new Response(JSON.stringify({ version: SNAPSHOT_VERSION, data: stats }))
        if (url === '/api/refresh' && apiUp) return new Response(JSON.stringify({ ...stats, generatedAt: new Date().toISOString() }))
        return new Response('{"error":"Bad deck config"}', { status: 500 })
      }),
    )
    render(<App />)
    await screen.findByText(messages.data.snapshotTitle)
    apiUp = true
    fireEvent.click(screen.getByRole('button', { name: messages.data.refresh }))
    await waitFor(() => expect(screen.queryByText(messages.data.snapshotTitle)).toBeNull())
  })

  it('falls back to labelled sample data when a snapshot is missing or from another version', async () => {
    for (const response of [new Response('{}', { status: 404 }), new Response(JSON.stringify({ version: SNAPSHOT_VERSION + 1, data: stats }))]) {
      vi.stubGlobal('fetch', noApi(() => response))
      render(<App />)
      expect(await screen.findByText(messages.data.sampleTitle)).toBeTruthy()
      cleanup()
    }
  })
})

describe('fresh data when Anki closes', () => {
  const live = () => JSON.stringify({ ...mockData, source: 'anki', generatedAt: new Date().toISOString() })
  const updates = { ankiRunning: false, updateAvailable: true, sourceModified: 100 }
  const server = (refresh: () => Response) =>
    vi.fn(async (url: string) => {
      if (url === '/api/status') return new Response(JSON.stringify(updates))
      return url === '/api/refresh' ? refresh() : new Response(live())
    })

  it('refreshes by itself, once, with no offer to press', async () => {
    const refresh = vi.fn(() => new Response(live()))
    const fetchMock = server(refresh)
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    await act(async () => {})
    expect(screen.queryByRole('button', { name: new RegExp(messages.data.updateNow) })).toBeNull()
  })

  it('refreshes again when a new day arrives, even if the collection hasn’t changed since', async () => {
    const yesterday = JSON.stringify({ ...mockData, source: 'anki', generatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    let status = updates
    const refresh = vi.fn(() => new Response(yesterday))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/status') return new Response(JSON.stringify(status))
        return url === '/api/refresh' ? refresh() : new Response(yesterday)
      }),
    )
    render(<App />)
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    status = { ...updates, updateAvailable: false }
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  })

  it('lets a refresh already running bring the update in, rather than copying twice', async () => {
    let status = { ...updates, updateAvailable: false, sourceModified: null as number | null }
    let finish = () => {}
    const refresh = vi.fn(() => new Promise<Response>((resolve) => (finish = () => resolve(new Response(live())))))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/status') return new Response(JSON.stringify(status))
        return url === '/api/refresh' ? refresh() : new Response(live())
      }),
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(messages.data.refresh) }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    status = updates
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await act(async () => finish())
    await act(async () => {})
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('falls back to the offer if that refresh fails, without trying again', async () => {
    const refresh = vi.fn(() => new Response(JSON.stringify({ error: 'Anki is running.' }), { status: 409 }))
    vi.stubGlobal('fetch', server(refresh))
    render(<App />)
    expect(await screen.findByRole('button', { name: new RegExp(messages.data.updateNow) })).toBeTruthy()
    expect(refresh).toHaveBeenCalledOnce()
  })
})

describe('App data states', () => {
  it('shows a loading status first', () => {
    respondWith(() => new Promise(() => {}))
    render(<App />)
    expect(screen.getByRole('status').textContent).toBe(messages.loading)
  })

  it('falls back to labelled sample data, telling you to start the API, when it is not running', async () => {
    respondWith(() => Promise.reject(new TypeError('Failed to fetch')))
    render(<App />)
    expect(await screen.findByText(messages.data.sampleTitle)).toBeTruthy()
    expect(screen.getByText(/npm run dev, then reload/)).toBeTruthy()
  })

  it('tells you to quit Anki when the API answers with an error', async () => {
    respondWith(async () => new Response(JSON.stringify({ error: 'No collection copy yet.' }), { status: 503 }))
    render(<App />)
    expect(await screen.findByText(/quit Anki, then press Refresh/)).toBeTruthy()
    expect(screen.getByText(/No collection copy yet\./)).toBeTruthy()
  })

  it('gives up on the API sooner when installed, so a sleeping Mac doesn’t hold up the app', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))),
    )
    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000) // 4 s for the API, then 5 s for the snapshot
    })
    delete (navigator as { standalone?: boolean }).standalone
    expect(await screen.findByText(/did not answer in time/)).toBeTruthy()
  })

  it('aborts the request and reports a timeout when the API never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))),
    )
    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000) // the API's wait, then the snapshot's
    })
    expect(await screen.findByText(/did not answer in time/)).toBeTruthy()
    expect(screen.getByText(/check that npm run dev is still running/)).toBeTruthy()
  })

  it('does not blame the API being down for a server error without a message', async () => {
    respondWith(async () => new Response(JSON.stringify({}), { status: 500 }))
    render(<App />)
    expect(await screen.findByText(/The local API reported an error/)).toBeTruthy()
    expect(screen.queryByText(/is not running/)).toBeNull()
  })

  it('points to the terminal, not Anki, when the server itself fails', async () => {
    respondWith(async () => new Response(JSON.stringify({ error: 'Failed to read the collection copy' }), { status: 500 }))
    render(<App />)
    expect(await screen.findByText(/look at the terminal running npm run dev/)).toBeTruthy()
    expect(screen.queryByText(/quit Anki, then press Refresh/)).toBeNull()
  })

  it('treats a body-less proxy failure as the API not running', async () => {
    respondWith(async () => new Response('', { status: 500 }))
    render(<App />)
    expect(await screen.findByText(/npm run dev, then reload/)).toBeTruthy()
  })

  it('shows no sample banner for live data', async () => {
    respondWith(async () => new Response(JSON.stringify({ ...mockData, source: 'anki' }), { status: 200 }))
    render(<App />)
    await waitFor(() => expect(screen.getByText(messages.data.live)).toBeTruthy())
    expect(screen.queryByText(messages.data.sampleTitle)).toBeNull()
  })

  it('moves to the new day when Anki rolls over with the page left open', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 10, 23, 59) })
    clock.now = Date.now()
    const live = JSON.stringify({ ...mockData, source: 'anki', dayStartHour: 0, generatedAt: new Date().toISOString() })
    respondWith(async () => new Response(live, { status: 200 }))
    const { rerender } = render(<App />)
    const oldCopy = messages.home.status.stale('10 Mar')
    await screen.findByText(/^Tue,? 10 Mar: /)
    expect(screen.queryByText(oldCopy)).toBeNull()
    vi.setSystemTime(new Date(2026, 2, 11, 0, 1))
    clock.now = Date.now()
    rerender(<App />)
    expect(await screen.findByText(oldCopy)).toBeTruthy()
  })

  describe('refresh', () => {
    const live = JSON.stringify({ ...mockData, source: 'anki' })

    it('posts to the refresh endpoint with the guard header and shows the new data', async () => {
      const fetchMock = vi.fn(async () => new Response(live, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(messages.data.refresh) }))
      const refreshCall = () => (fetchMock.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u === '/api/refresh')
      await waitFor(() => expect(refreshCall()).toBeTruthy())
      const [url, init] = refreshCall()!
      expect(url).toBe('/api/refresh')
      expect(init.method).toBe('POST')
      expect((init.headers as Record<string, string>)['X-Requested-By']).toBe('anki-analytics')
    })

    it('shows a dismissable error when the refresh fails, and keeps the current data', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          url === '/api/stats'
            ? new Response(live, { status: 200 })
            : new Response(JSON.stringify({ error: 'Anki is running' }), { status: 409 }),
        ),
      )
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(messages.data.refresh) }))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Anki is running')
      expect(screen.getByText(messages.data.live)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: messages.data.dismiss }))
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})
