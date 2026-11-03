// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

  it('shows no sample banner for live data', async () => {
    respondWith(async () => new Response(JSON.stringify({ ...mockData, source: 'anki' }), { status: 200 }))
    render(<App />)
    await waitFor(() => expect(screen.getByText(messages.data.live)).toBeTruthy())
    expect(screen.queryByText(messages.data.sampleTitle)).toBeNull()
  })
})
