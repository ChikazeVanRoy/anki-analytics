// HTTP tests for the local API, using fakes instead of the real collection and Anki folder.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnkiData } from '../src/data/types.ts'
import { readConfigJson } from './ankiConfig.ts'
import { createApiServer, isAllowedHost } from './app.ts'
import { canUpdate, CopyError } from './collection.ts'
import { DeckConfigError } from './deckGroups.ts'

const dir = mkdtempSync(join(tmpdir(), 'anki-analytics-api-'))
const existing = join(dir, 'collection.anki2')
writeFileSync(existing, 'not really sqlite') // only its existence matters; `read` is faked
const fakeData = { source: 'anki', daily: [], decks: [] } as unknown as AnkiData

function start(overrides: Parameters<typeof createApiServer>[0]) {
  const server = createApiServer({ log: () => {}, ...overrides })
  return new Promise<{ server: Server; port: number }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port })),
  )
}

/** node:http lets us set any Host header, which is what a DNS-rebinding page would produce. */
function call(port: number, path: string, opts: { method?: string; host?: string; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: { host: opts.host ?? `localhost:${port}`, ...opts.headers } },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(raw) }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('isAllowedHost', () => {
  it('accepts this machine’s names on any port', () => {
    for (const h of ['localhost', 'localhost:5173', '127.0.0.1:5174', '[::1]:5174', 'LOCALHOST:5174']) {
      expect(isAllowedHost(h)).toBe(true)
    }
  })
  it('rejects other domains, including look-alikes', () => {
    for (const h of [undefined, '', 'evil.example', 'evil.example:5174', 'localhost.evil.example', '127.0.0.1.nip.io', '192.168.1.5:5174']) {
      expect(isAllowedHost(h)).toBe(false)
    }
  })
})

describe('local API', () => {
  let port: number
  let server: Server
  const copy = vi.fn(() => ({ profile: 'Test', bytes: 1000 }))
  beforeAll(async () => ({ server, port } = await start({ collectionPath: existing, read: () => fakeData, copy })))
  afterAll(() => server.close())

  it('refuses requests addressed to another domain (DNS rebinding)', async () => {
    expect(await call(port, '/api/stats', { host: `evil.example:${port}` })).toEqual({ status: 403, body: { error: 'Forbidden host' } })
  })

  it('serves stats to localhost, directly or through the Vite proxy', async () => {
    expect((await call(port, '/api/stats')).status).toBe(200)
    expect((await call(port, '/api/stats', { host: 'localhost:5173' })).body).toEqual(fakeData)
  })

  it('requires the custom header to refresh, then copies and returns fresh data', async () => {
    expect((await call(port, '/api/refresh', { method: 'POST' })).status).toBe(403)
    expect(copy).not.toHaveBeenCalled()
    const ok = await call(port, '/api/refresh', { method: 'POST', headers: { 'x-requested-by': 'anki-analytics' } })
    expect(ok.status).toBe(200)
    expect(copy).toHaveBeenCalledOnce()
  })

  it('returns 404 for anything else, including GET /api/refresh', async () => {
    expect((await call(port, '/api/refresh')).status).toBe(404)
    expect((await call(port, '/etc/passwd')).status).toBe(404)
  })
})

describe('local API errors', () => {
  it('returns 503 when there is no collection copy yet', async () => {
    const { server, port } = await start({ collectionPath: join(dir, 'missing.anki2') })
    expect((await call(port, '/api/stats')).status).toBe(503)
    server.close()
  })

  it('shows a user-fixable copy problem (e.g. Anki is open) as 409 with its message', async () => {
    const { server, port } = await start({
      collectionPath: existing,
      copy: () => {
        throw new CopyError('Anki is running.')
      },
    })
    const res = await call(port, '/api/refresh', { method: 'POST', headers: { 'x-requested-by': 'anki-analytics' } })
    expect(res).toEqual({ status: 409, body: { error: 'Anki is running.' } })
    server.close()
  })

  it('hides unexpected errors behind a generic 500', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { server, port } = await start({
      collectionPath: existing,
      read: () => {
        throw new Error('secret internal detail')
      },
    })
    expect(await call(port, '/api/stats')).toEqual({ status: 500, body: { error: 'Failed to read the collection copy' } })
    server.close()
    quiet.mockRestore()
  })

  it('says what’s wrong with a broken deck config file, since that’s for the user to fix', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { server, port } = await start({
      collectionPath: existing,
      read: () => {
        throw new DeckConfigError('anki-analytics.config.json: "exclude" must be a list of deck names')
      },
    })
    expect(await call(port, '/api/stats')).toEqual({
      status: 500,
      body: { error: 'anki-analytics.config.json: "exclude" must be a list of deck names' },
    })
    server.close()
    quiet.mockRestore()
  })
})

describe('readConfigJson', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE config (key TEXT PRIMARY KEY, val BLOB);
           INSERT INTO config VALUES ('rollover', CAST('4' AS BLOB)), ('broken', CAST('{not json' AS BLOB));`)
  it('parses stored JSON', () => expect(readConfigJson(db, 'rollover')).toBe(4))
  it('returns undefined for missing or corrupt values instead of throwing', () => {
    expect(readConfigJson(db, 'missing')).toBeUndefined()
    expect(readConfigJson(db, 'broken')).toBeUndefined()
  })
})

describe('GET /api/status', () => {
  const status = { ankiRunning: false, updateAvailable: true, sourceModified: 1000 }

  it('reports whether a refresh is worth offering', async () => {
    const { server, port } = await start({ status: () => status })
    expect(await call(port, '/api/status')).toEqual({ status: 200, body: status })
    server.close()
  })

  it('refuses other hosts, like every other route', async () => {
    const { server, port } = await start({ status: () => status })
    expect((await call(port, '/api/status', { host: 'evil.example' })).status).toBe(403)
    server.close()
  })
})

describe('canUpdate', () => {
  it('offers a refresh once Anki has closed with newer reviews', () => {
    expect(canUpdate(false, true, 200, 100)).toBe(true)
  })
  it('offers the first copy when there is none', () => {
    expect(canUpdate(false, true, 200, null)).toBe(true)
  })
  it('stays quiet while Anki is open, after an unclean close, or with nothing new', () => {
    expect(canUpdate(true, true, 200, 100)).toBe(false)
    expect(canUpdate(false, false, 200, 100)).toBe(false)
    expect(canUpdate(false, true, 100, 100)).toBe(false)
    expect(canUpdate(false, true, null, 100)).toBe(false)
  })
})
