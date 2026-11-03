// Tiny local API. Listens on 127.0.0.1 only, so it is not reachable from other devices.
//   GET  /api/stats    -> AnkiData from the current copy
//   POST /api/refresh  -> re-copy the collection from Anki, then return fresh AnkiData
// Run with: npm run api   (Node runs this TypeScript file directly, no build step)

import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readAnkiData } from './anki.ts'
import { COLLECTION_COPY, copyCollection, CopyError } from './collection.ts'

const HOST = '127.0.0.1'
const PORT = 5174

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendStats(res: ServerResponse) {
  if (!existsSync(COLLECTION_COPY)) {
    return send(res, 503, { error: 'No collection copy yet. Quit Anki, then press Refresh.' })
  }
  const started = performance.now()
  const data = readAnkiData(COLLECTION_COPY)
  console.log(`stats: ${data.daily.length} rows in ${Math.round(performance.now() - started)}ms`)
  send(res, 200, data)
}

function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET' && req.url === '/api/stats') return sendStats(res)

  if (req.method === 'POST' && req.url === '/api/refresh') {
    // A custom header can't be sent cross-site without a CORS preflight, which this server never
    // approves. So other websites open in your browser can't trigger a refresh.
    if (req.headers['x-requested-by'] !== 'anki-analytics') return send(res, 403, { error: 'Forbidden' })
    try {
      const { profile, bytes } = copyCollection()
      console.log(`refresh: copied profile "${profile}" (${(bytes / 1e6).toFixed(1)} MB)`)
    } catch (err) {
      if (err instanceof CopyError) return send(res, 409, { error: err.message })
      throw err
    }
    return sendStats(res)
  }

  send(res, 404, { error: 'Not found' })
}

const server = createServer((req, res) => {
  try {
    handle(req, res)
  } catch (err) {
    console.error(err)
    send(res, 500, { error: 'Failed to read the collection copy' })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Anki API on http://${HOST}:${PORT}  (GET /api/stats, POST /api/refresh)`)
})
