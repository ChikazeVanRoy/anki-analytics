import { useCallback, useEffect, useRef, useState } from 'react'
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
/** The installed app has a snapshot to show, so it shouldn't sit on a blank screen while the Mac sleeps. */
const INSTALLED_LOAD_TIMEOUT_MS = 4_000
const REFRESH_TIMEOUT_MS = 90_000
/** Only tried after the API has failed, so it adds little to that wait. */
const SNAPSHOT_TIMEOUT_MS = 5_000

/** Opened from the home screen, not in a browser tab. iOS only reports this through navigator.standalone. */
function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

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
    // 404: this device has no route to the API, which is how the server answers your phone
    if (!body || res.status === 404) throw new ApiError('api-down', m.apiDown)
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

type Loaded = Extract<State, { status: 'ready' }>

/** The best stats available right now: live, then a saved snapshot, then labelled sample data. */
async function loadBest(): Promise<Loaded> {
  try {
    const data = await request('/api/stats', isInstalled() ? INSTALLED_LOAD_TIMEOUT_MS : LOAD_TIMEOUT_MS)
    return { status: 'ready', data: data as AnkiData }
  } catch (err) {
    const saved = await savedSnapshot()
    const failure = err instanceof ApiError ? err : new ApiError('server', messages.data.serverError)
    const fallback = { fallbackReason: failure.message, fallbackKind: failure.kind }
    return saved ? { status: 'ready', data: saved, fromSnapshot: true, ...fallback } : { status: 'ready', data: mockData, ...fallback }
  }
}

/** What to show after looking again. Unchanged stats keep their object, so the pages don't recalculate for nothing. */
function afterRecheck(current: State, next: Loaded): State {
  if (current.status !== 'ready' || next.data.source === 'mock') return current
  return next.fromSnapshot && current.data.generatedAt === next.data.generatedAt ? current : next
}

/**
 * Loads real stats from the local API, falling back to a saved snapshot, then to clearly labelled mock data.
 * `refresh()` asks the API to re-copy the collection from Anki first. While on a snapshot it looks again each time the
 * app comes back into view: a phone keeps an installed app in memory, so reopening one doesn't reload the page.
 */
export function useAnkiData() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadBest().then((loaded) => !cancelled && setState(loaded))
    // Cleanup: ignore the response if the component unmounts first
    return () => {
      cancelled = true
    }
  }, [])

  const onSnapshot = state.status === 'ready' && !!state.fromSnapshot
  const checking = useRef(false)
  useEffect(() => {
    if (!onSnapshot) return
    const lookAgain = () => {
      if (document.hidden || checking.current) return
      checking.current = true
      void loadBest()
        .then((loaded) => setState((current) => afterRecheck(current, loaded)))
        .finally(() => {
          checking.current = false
        })
    }
    window.addEventListener('focus', lookAgain)
    document.addEventListener('visibilitychange', lookAgain)
    return () => {
      window.removeEventListener('focus', lookAgain)
      document.removeEventListener('visibilitychange', lookAgain)
    }
  }, [onSnapshot])

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
