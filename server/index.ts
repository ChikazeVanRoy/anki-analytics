// Tiny local API: GET /api/stats -> AnkiData JSON.
// Listens on 127.0.0.1 only, so it is not reachable from other devices.
// Run with: npm run api   (Node runs this TypeScript file directly, no build step)

import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { readAnkiData } from './anki.ts'

const HOST = '127.0.0.1'
const PORT = 5174
const COLLECTION = fileURLToPath(new URL('../data/collection.anki2', import.meta.url))

function send(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/api/stats') return send(res, 404, { error: 'Not found' })

  if (!existsSync(COLLECTION)) {
    return send(res, 503, { error: 'No collection copy found. Quit Anki, then run: npm run copy-collection' })
  }

  try {
    const started = performance.now()
    const data = readAnkiData(COLLECTION)
    console.log(`GET /api/stats  ${data.daily.length} rows  ${Math.round(performance.now() - started)}ms`)
    send(res, 200, data)
  } catch (err) {
    console.error(err)
    send(res, 500, { error: 'Failed to read the collection copy' })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Anki API on http://${HOST}:${PORT}/api/stats`)
})
