import { useEffect, useState } from 'react'
import { mockData } from './mockData'
import type { AnkiData } from './types'

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: AnkiData; fallbackReason?: string }

/** Loads real stats from the local API, falling back to clearly labelled mock data. */
export function useAnkiData(): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/api/stats')
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? `API returned ${res.status}`)
        return body as AnkiData
      })
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((err: Error) => {
        // A proxy error (API not running) surfaces as a JSON parse failure or 5xx
        const reason = err.message.startsWith('API returned') ? 'Local API is not running (npm run api).' : err.message
        if (!cancelled) setState({ status: 'ready', data: mockData, fallbackReason: reason })
      })
    // Cleanup: ignore the response if the component unmounts first
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
