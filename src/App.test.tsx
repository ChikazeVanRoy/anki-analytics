// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { mockData } from './data/mockData'
import { messages } from './i18n'

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

  it('aborts the request and reports a timeout when the API never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))),
    )
    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
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
