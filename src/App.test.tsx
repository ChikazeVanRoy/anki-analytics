// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { mockData } from './data/mockData'
import { messages } from './i18n'

function respondWith(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

  it('falls back with a timeout reason when the API hangs', async () => {
    respondWith(() => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    render(<App />)
    expect(await screen.findByText(/did not answer in time/)).toBeTruthy()
  })

  it('tells you to quit Anki when the API answers with an error', async () => {
    respondWith(async () => new Response(JSON.stringify({ error: 'No collection copy yet.' }), { status: 503 }))
    render(<App />)
    expect(await screen.findByText(/quit Anki, then press Refresh/)).toBeTruthy()
    expect(screen.getByText(/No collection copy yet\./)).toBeTruthy()
  })

  it('sends a real abort signal and reports a timeout when it fires', async () => {
    // Make AbortSignal.timeout fire straight away, and have fetch reject the way a browser does on abort
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const c = new AbortController()
      setTimeout(() => c.abort(new DOMException('timed out', 'TimeoutError')), 0)
      return c.signal
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))),
    )
    render(<App />)
    expect(await screen.findByText(/did not answer in time/)).toBeTruthy()
    expect(screen.getByText(/check that npm run dev is still running/)).toBeTruthy()
    vi.restoreAllMocks()
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

  describe('refresh', () => {
    const live = JSON.stringify({ ...mockData, source: 'anki' })

    it('posts to the refresh endpoint with the guard header and shows the new data', async () => {
      const fetchMock = vi.fn(async (url: string) =>
        url === '/api/stats' ? new Response(live, { status: 200 }) : new Response(live, { status: 200 }),
      )
      vi.stubGlobal('fetch', fetchMock)
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(messages.data.refresh) }))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
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
