import { useCallback, useEffect, useState } from 'react'
import { messages } from '../i18n'
import { parseSnapshot } from '../lib/snapshot'
import { mockData } from './mockData'
import type { AnkiData } from './types'

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: AnkiData; fromSnapshot?: boolean; fallbackReason?: string; fallbackKind?: FailureKind }

/** Why real data could not be loaded, so the banner can say what to do about it. */
export type FailureKind = 'api-down' | 'timeout' | 'collection' | 'server'

export class ApiError extends Error {
  readonly kind: FailureKind
  constructor(kind: FailureKind, message: string) {
    super(message)
    this.kind = kind
  }
}
/** The first load must not hang forever; a refresh copies the collection, so it gets longer. */
const LOAD_TIMEOUT_MS = 15_000
const REFRESH_TIMEOUT_MS = 90_000
/** Only tried after the API has failed, so it adds little to that wait. */
const SNAPSHOT_TIMEOUT_MS = 5_000

/** fetch + JSON, turning API errors and proxy failures (API not running) into typed, readable errors. */
async function request(url: string, timeoutMs: number, init?: RequestInit): Promise<unknown> {
  const m = messages.data
  // AbortController + setTimeout rather than AbortSignal.timeout, which older browsers lack
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: controller.signal })
    } catch {
      throw new ApiError(timedOut ? 'timeout' : 'api-down', timedOut ? m.apiTimeout : m.apiDown)
    }
    const body = await res.json().catch(() => null)
    // No JSON body means the dev proxy had nothing to forward to. 503 (no copy yet) and 409 (Anki is open) are
    // fixed by closing Anki and refreshing; any other error comes from the server and is in its terminal.
    if (!body) throw new ApiError('api-down', m.apiDown)
    if (!res.ok) throw new ApiError(res.status === 503 || res.status === 409 ? 'collection' : 'server', body.error ?? m.serverError)
    return body
  } finally {
    clearTimeout(timer)
  }
}

/** The stats saved by `npm run snapshot`, or null if there's none this version of the app can use. */
async function savedSnapshot(): Promise<AnkiData | null> {
  try {
    return parseSnapshot<AnkiData>(await request('/snapshot.json', SNAPSHOT_TIMEOUT_MS))
  } catch {
    return null
  }
}

/**
 * Loads real stats from the local API, falling back to a saved snapshot, then to clearly labelled mock data.
 * `refresh()` asks the API to re-copy the collection from Anki first.
 */
export function useAnkiData() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    request('/api/stats', LOAD_TIMEOUT_MS)
      .then((data) => !cancelled && setState({ status: 'ready', data: data as AnkiData }))
      .catch(async (err: unknown) => {
        const saved = await savedSnapshot()
        if (cancelled) return
        const failure = err instanceof ApiError ? err : new ApiError('server', messages.data.serverError)
        if (saved) return setState({ status: 'ready', data: saved, fromSnapshot: true, fallbackReason: failure.message })
        setState({ status: 'ready', data: mockData, fallbackReason: failure.message, fallbackKind: failure.kind })
      })
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
      setState({ status: 'ready', data: data as AnkiData })
    } catch (err) {
      setRefreshError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  const clearRefreshError = useCallback(() => setRefreshError(null), [])

  return { state, refresh, refreshing, refreshError, clearRefreshError }
}
