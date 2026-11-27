// The local API's request handling, separate from index.ts (which only starts it) so it can be tested.
//   GET  /api/stats    -> AnkiData from the current copy
//   GET  /api/status   -> whether Anki is open, whether a refresh would bring in new reviews, how the last sync went
//   POST /api/refresh  -> re-copy the collection from Anki, then return fresh AnkiData
//   GET  /api/version  -> the commit this server started from, and whether the checkout has moved on since
//   POST /api/update   -> git fetch + fast-forward from GitHub (takes effect when the launcher is opened again)
//   GET  /snapshot.json -> the stats saved by `npm run snapshot`, if any
//   GET  anything else -> the built app from dist/, when there is one (the launcher runs the app this way)
// A request from your phone (see phoneAccess.ts) only gets the app and a snapshot without note text.

import { existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AnkiData } from '../src/data/types.ts'
import { readSyncStatus, type SyncStatus } from './ankiSync.ts'
import { cloudInfo } from './cloud.ts'
import { CONFIG_PATH, DeckConfigError } from './deckGroups.ts'
import { ankiStatus, COLLECTION_COPY, copyCollection, CopyError, type AnkiStatus } from './collection.ts'
import { isForwarded, isPhoneRequest, loadPhoneHost, phoneSnapshot } from './phoneAccess.ts'
import { readStatsInWorker } from './readStats.ts'
import { readSnapshotFile, SNAPSHOT_FILE, writeSnapshot } from './snapshot.ts'
import { DIST_DIR, serveFile } from './staticFiles.ts'
import { gitIn, pagesOutdated, readVersion, serverCodeChanged, startedBy, updateFromGitHub, type UpdateResult, type VersionInfo } from './version.ts'

const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Only answer requests addressed to this machine by name. Binding to 127.0.0.1 is not enough on its
 * own: with "DNS rebinding", a website can make its own domain resolve to 127.0.0.1 and then read the
 * response as same-origin. Such requests carry the attacker's domain in the Host header, so we refuse them.
 */
export function isAllowedHost(host: string | undefined): boolean {
  if (!host) return false
  try {
    return ALLOWED_HOSTNAMES.has(new URL(`http://${host}`).hostname)
  } catch {
    return false
  }
}

export interface ApiDeps {
  collectionPath: string
  /** Reads the stats: in a worker thread by default, as a read can take a minute on a busy Mac. */
  read: (path: string) => AnkiData | Promise<AnkiData>
  /**
   * What the stats depend on, so a read can be reused, or null to read every time: `source` (the copy and the deck
   * config) and `window`, the five-minute stretch the read belongs to. A read stays good while its source does; once its
   * window has passed it's still answered with, while a new one is read in the background.
   */
  statsKey: (collectionPath: string) => { source: string; window: number } | null
  snapshotPath: string
  saveSnapshot: (data: AnkiData) => void
  phoneHost: () => string | null
  copy: () => { profile: string; bytes: number }
  status: () => AnkiStatus
  sync: () => SyncStatus | null
  /** Whether snapshots go to your Firebase project, and how that's going (null: they don't). */
  cloud: () => ReturnType<typeof cloudInfo>
  version: () => VersionInfo
  /** Whether what runs is behind the checkout: the server's code changed since it started, or the pages need building. */
  outOfDate: (running: string | null, current: string | null) => boolean
  /** 'service' when launchd runs this as the background service, so restarting means `npm run service -- restart`. */
  startedBy: () => 'service' | 'other'
  update: () => Promise<UpdateResult>
  log: (message: string) => void
  distDir: string
}

const REPO_DIR = new URL('..', import.meta.url).pathname

const defaults: ApiDeps = {
  collectionPath: COLLECTION_COPY,
  read: readStatsInWorker,
  statsKey,
  snapshotPath: SNAPSHOT_FILE,
  saveSnapshot: writeSnapshot,
  phoneHost: loadPhoneHost,
  copy: copyCollection,
  status: ankiStatus,
  sync: readSyncStatus,
  cloud: () => cloudInfo(),
  version: () => readVersion(REPO_DIR),
  outOfDate: (running, current) =>
    running !== current && (running === null || current === null || serverCodeChanged(REPO_DIR, running, current) || pagesOutdated(REPO_DIR)),
  startedBy: () => startedBy(),
  update: () => updateFromGitHub(gitIn(REPO_DIR), () => readVersion(REPO_DIR)),
  log: (message) => console.log(message), // looked up when called, so the timestamps index.ts adds apply
  distDir: DIST_DIR,
}

/** Stats change slowly with the clock (recall now, what's due), so reuse a read for at most this long. */
export const STATS_REUSE_MS = 5 * 60_000

/**
 * The copy (its time and size), the deck config, and the current five-minute window. Windows are counted from the
 * epoch, and every time zone's hours start on one, so an Anki day's rollover always starts a new read.
 */
export function statsKey(collectionPath: string, now = Date.now(), configPath = CONFIG_PATH): { source: string; window: number } | null {
  try {
    const copy = statSync(collectionPath)
    const config = existsSync(configPath) ? statSync(configPath).mtimeMs : 0
    return { source: `${copy.mtimeMs}:${copy.size}:${config}`, window: Math.floor(now / STATS_REUSE_MS) }
  } catch {
    return null
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function createApiServer(overrides: Partial<ApiDeps> = {}): Server {
  const deps = { ...defaults, ...overrides }
  // What this process is running: the checkout can move on (an update) without the code in memory changing
  const running = deps.version()
  let updating: Promise<UpdateResult> | null = null
  let lastStats: { source: string; window: number; started: number; data: AnkiData } | null = null
  let reads = 0 // numbers reads in the order they start: a slow older read must not replace a newer one
  /** The read under way, shared by every request that wants it, so a slow read is never started twice. */
  let reading: { source: string | null; done: Promise<AnkiData> } | null = null

  function readNow(key: ReturnType<ApiDeps['statsKey']>): Promise<AnkiData> {
    const source = key?.source ?? null
    if (reading && source !== null && reading.source === source) return reading.done
    const started = performance.now()
    const order = ++reads
    const done = Promise.resolve()
      .then(() => deps.read(deps.collectionPath))
      .then((data) => {
        deps.log(`stats: ${data.daily.length} rows in ${Math.round(performance.now() - started)}ms`)
        // A read that started later may have finished first: keep the newer one
        if (key !== null && (lastStats === null || lastStats.started < order)) lastStats = { ...key, started: order, data }
        return data
      })
      .finally(() => {
        if (reading?.done === done) reading = null
      })
    reading = { source, done }
    return done
  }

  /** The stats for the copy as it is now: reused while it hasn't changed, and refreshed in the background once old. */
  function currentStats(): Promise<AnkiData> {
    const key = deps.statsKey(deps.collectionPath)
    if (key !== null && lastStats?.source === key.source) {
      if (lastStats.window !== key.window && !reading) {
        readNow(key).catch((err) => console.error('The stats could not be read again:', err)) // the last ones still stand
      }
      return Promise.resolve(lastStats.data)
    }
    return readNow(key)
  }

  async function sendStats(res: ServerResponse, { save = false } = {}) {
    if (!existsSync(deps.collectionPath)) {
      return send(res, 503, { error: 'No collection copy yet. Quit Anki, then press Refresh.' })
    }
    const data = await currentStats()
    if (save) {
      try {
        deps.saveSnapshot(data)
      } catch (err) {
        console.error('The snapshot could not be saved:', err) // the stats just read are still good
      }
    }
    send(res, 200, data)
  }

  function sendSnapshot(res: ServerResponse, prepare: (saved: string) => string = (saved) => saved) {
    const saved = readSnapshotFile(deps.snapshotPath)
    if (saved === null) return send(res, 404, { error: 'No snapshot saved yet.' })
    // Before the headers: a file that can't be prepared must still be able to answer with an error
    const body = prepare(saved)
    // Always ask again, so a browser can't keep showing an old snapshot as the latest one
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
    res.end(body)
  }

  /** Your phone: read-only, and no route to live stats, the status or a refresh. */
  function handlePhone(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'GET' && req.url === '/snapshot.json') return sendSnapshot(res, phoneSnapshot)
    if (req.method === 'GET' && !req.url?.startsWith('/api/') && serveFile(req.url ?? '/', deps.distDir, res)) return
    send(res, 404, { error: 'Not found' })
  }

  function handle(req: IncomingMessage, res: ServerResponse) {
    if (isPhoneRequest(req.headers, deps.phoneHost())) return handlePhone(req, res)
    if (!isAllowedHost(req.headers.host) || isForwarded(req.headers)) return send(res, 403, { error: 'Forbidden host' })

    if (req.method === 'GET' && req.url === '/api/stats') return sendStats(res)

    if (req.method === 'GET' && req.url === '/api/status') return send(res, 200, { ...deps.status(), sync: deps.sync(), cloud: deps.cloud() })

    if (req.method === 'GET' && req.url === '/api/version') {
      const current = deps.version()
      // Only when it matters: a commit that changed neither the server nor the pages (once built) needs no restart
      return send(res, 200, { ...running, restartNeeded: deps.outOfDate(running.commit, current.commit), startedBy: deps.startedBy() })
    }

    if (req.method === 'POST' && req.url === '/api/update') {
      if (req.headers['x-requested-by'] !== 'anki-analytics') return send(res, 403, { error: 'Forbidden' })
      // Two clicks at once share one git run
      updating ??= deps.update().finally(() => (updating = null))
      updating.then(
        (result) => send(res, 200, result),
        (err) => {
          console.error(err)
          send(res, 500, { error: 'The update failed.' })
        },
      )
      return
    }

    if (req.method === 'GET' && req.url === '/snapshot.json') return sendSnapshot(res)

    if (req.method === 'POST' && req.url === '/api/refresh') {
      // A custom header can't be sent cross-site without a CORS preflight, which this server never
      // approves. So other websites open in your browser can't trigger a refresh.
      if (req.headers['x-requested-by'] !== 'anki-analytics') return send(res, 403, { error: 'Forbidden' })
      try {
        const { profile, bytes } = deps.copy()
        deps.log(`refresh: copied profile "${profile}" (${(bytes / 1e6).toFixed(1)} MB)`)
      } catch (err) {
        if (err instanceof CopyError) return send(res, 409, { error: err.message })
        throw err
      }
      return sendStats(res, { save: true })
    }

    if (req.method === 'GET' && serveFile(req.url ?? '/', deps.distDir, res)) return

    send(res, 404, { error: 'Not found' })
  }

  return createServer((req, res) => {
    // Some routes answer later (a read in its worker), so their errors arrive as rejections as well as throws
    Promise.resolve()
      .then(() => handle(req, res))
      .catch((err) => {
        console.error(err)
        if (res.headersSent) return res.end()
        // A broken config file is the user's to fix, so say exactly what's wrong with it
        send(res, 500, { error: err instanceof DeckConfigError ? err.message : 'Failed to read the collection copy' })
      })
  })
}
