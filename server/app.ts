// The local API's request handling, separate from index.ts (which only starts it) so it can be tested.
//   GET  /api/stats    -> AnkiData from the current copy
//   GET  /api/status   -> whether Anki is open, and whether a refresh would bring in new reviews
//   POST /api/refresh  -> re-copy the collection from Anki, then return fresh AnkiData
//   GET  anything else -> the built app from dist/, when there is one (the launcher runs the app this way)

import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AnkiData } from '../src/data/types.ts'
import { readAnkiData } from './anki.ts'
import { DeckConfigError, loadDeckColors, loadDeckConfig, saveDeckColors } from './deckGroups.ts'
import { ankiStatus, COLLECTION_COPY, copyCollection, CopyError, type AnkiStatus } from './collection.ts'
import { DIST_DIR, serveFile } from './staticFiles.ts'

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
  copy: () => { profile: string; bytes: number }
  status: () => AnkiStatus
  log: (message: string) => void
  distDir: string
}

const defaults: ApiDeps = {
  collectionPath: COLLECTION_COPY,
  // The deck config is read on every request, so edits apply on the next refresh without a restart.
  // Colour slots are remembered so a deck keeps its colour when other decks come and go.
  read: (path) => {
    const previousColors = loadDeckColors()
    const data = readAnkiData(path, Date.now(), { deckConfig: loadDeckConfig(), previousColors })
    saveDeckColors(data.decks, previousColors)
    return data
  },
  copy: copyCollection,
  status: ankiStatus,
  log: console.log,
  distDir: DIST_DIR,
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function createApiServer(overrides: Partial<ApiDeps> = {}): Server {
  const deps = { ...defaults, ...overrides }

  function sendStats(res: ServerResponse) {
    if (!existsSync(deps.collectionPath)) {
      return send(res, 503, { error: 'No collection copy yet. Quit Anki, then press Refresh.' })
    }
    const started = performance.now()
    const data = deps.read(deps.collectionPath)
    deps.log(`stats: ${data.daily.length} rows in ${Math.round(performance.now() - started)}ms`)
    send(res, 200, data)
  }

  function handle(req: IncomingMessage, res: ServerResponse) {
    if (!isAllowedHost(req.headers.host)) return send(res, 403, { error: 'Forbidden host' })

    if (req.method === 'GET' && req.url === '/api/stats') return sendStats(res)

    if (req.method === 'GET' && req.url === '/api/status') return send(res, 200, deps.status())

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
      return sendStats(res)
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
