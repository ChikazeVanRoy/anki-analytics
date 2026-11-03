import { useCallback, useEffect, useState } from 'react'
import { mockData } from './mockData'
import type { AnkiData } from './types'

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: AnkiData; fallbackReason?: string }

export const API_DOWN = 'Local API is not running (npm run dev).'
export const API_TIMEOUT = 'The local API did not answer in time.'
/** The first load must not hang forever; a refresh copies the collection, so it gets longer. */
const LOAD_TIMEOUT_MS = 15_000
const REFRESH_TIMEOUT_MS = 90_000

/** fetch + JSON, turning API errors and proxy failures (API not running) into readable messages. */
async function request(url: string, timeoutMs: number, init?: RequestInit): Promise<AnkiData> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    throw new Error((err as Error).name === 'TimeoutError' ? API_TIMEOUT : API_DOWN)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || !body) throw new Error(body?.error ?? API_DOWN)
  return body as AnkiData
}

/**
 * Loads real stats from the local API, falling back to clearly labelled mock data.
 * `refresh()` asks the API to re-copy the collection from Anki first.
 */
export function useAnkiData() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    request('/api/stats', LOAD_TIMEOUT_MS)
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((err: Error) => !cancelled && setState({ status: 'ready', data: mockData, fallbackReason: err.message }))
    // Cleanup: ignore the response if the component unmounts first
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const data = await request('/api/refresh', REFRESH_TIMEOUT_MS, { method: 'POST', headers: { 'X-Requested-By': 'anki-analytics' } })
      setState({ status: 'ready', data })
    } catch (err) {
      setRefreshError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  const clearRefreshError = useCallback(() => setRefreshError(null), [])

  return { state, refresh, refreshing, refreshError, clearRefreshError }
}
