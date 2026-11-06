// The local API's request handling, separate from index.ts (which only starts it) so it can be tested.
//   GET  /api/stats    -> AnkiData from the current copy
//   GET  /api/status   -> whether Anki is open, whether a refresh would bring in new reviews, how the last sync went
//   POST /api/refresh  -> re-copy the collection from Anki, then return fresh AnkiData
//   GET  /api/version  -> the commit this server started from, and whether the checkout has moved on since
//   POST /api/update   -> git fetch + fast-forward from GitHub (takes effect when the launcher is opened again)
//   GET  /snapshot.json -> the stats saved by `npm run snapshot`, if any
//   GET  anything else -> the built app from dist/, when there is one (the launcher runs the app this way)
// A request from your phone (see phoneAccess.ts) only gets the app and a snapshot without note text.

import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AnkiData } from '../src/data/types.ts'
import { readCurrentStats } from './anki.ts'
import { readSyncStatus, type SyncStatus } from './ankiSync.ts'
import { DeckConfigError } from './deckGroups.ts'
import { ankiStatus, COLLECTION_COPY, copyCollection, CopyError, type AnkiStatus } from './collection.ts'
import { isForwarded, isPhoneRequest, loadPhoneHost, phoneSnapshot } from './phoneAccess.ts'
import { readSnapshotFile, SNAPSHOT_FILE, writeSnapshot } from './snapshot.ts'
import { DIST_DIR, serveFile } from './staticFiles.ts'
import { gitIn, readVersion, updateFromGitHub, type UpdateResult, type VersionInfo } from './version.ts'

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
  read: (path: string) => AnkiData
  snapshotPath: string
  saveSnapshot: (data: AnkiData) => void
  phoneHost: () => string | null
  copy: () => { profile: string; bytes: number }
  status: () => AnkiStatus
  sync: () => SyncStatus | null
  version: () => VersionInfo
  update: () => Promise<UpdateResult>
  log: (message: string) => void
  distDir: string
}

const REPO_DIR = new URL('..', import.meta.url).pathname

const defaults: ApiDeps = {
  collectionPath: COLLECTION_COPY,
  read: readCurrentStats,
  snapshotPath: SNAPSHOT_FILE,
  saveSnapshot: writeSnapshot,
  phoneHost: loadPhoneHost,
  copy: copyCollection,
  status: ankiStatus,
  sync: readSyncStatus,
  version: () => readVersion(REPO_DIR),
  update: () => updateFromGitHub(gitIn(REPO_DIR), () => readVersion(REPO_DIR)),
  log: console.log,
  distDir: DIST_DIR,
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

  function sendStats(res: ServerResponse, { save = false } = {}) {
    if (!existsSync(deps.collectionPath)) {
      return send(res, 503, { error: 'No collection copy yet. Quit Anki, then press Refresh.' })
    }
    const started = performance.now()
    const data = deps.read(deps.collectionPath)
    deps.log(`stats: ${data.daily.length} rows in ${Math.round(performance.now() - started)}ms`)
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

    if (req.method === 'GET' && req.url === '/api/status') return send(res, 200, { ...deps.status(), sync: deps.sync() })

    if (req.method === 'GET' && req.url === '/api/version') {
      const current = deps.version()
      return send(res, 200, { ...running, restartNeeded: current.commit !== running.commit })
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
    try {
      handle(req, res)
    } catch (err) {
      console.error(err)
      // A broken config file is the user's to fix, so say exactly what's wrong with it
      send(res, 500, { error: err instanceof DeckConfigError ? err.message : 'Failed to read the collection copy' })
    }
  })
}
