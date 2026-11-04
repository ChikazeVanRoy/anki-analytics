// HTTP tests for the local API, using fakes instead of the real collection and Anki folder.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  const server = createApiServer({ log: () => {}, saveSnapshot: () => {}, ...overrides })
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

  it('saves a snapshot with each refresh, and a failed save doesn’t fail the refresh', async () => {
    const saveSnapshot = vi.fn(() => {
      throw new Error('Disk full')
    })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { server: saving, port: savingPort } = await start({ collectionPath: existing, read: () => fakeData, copy, saveSnapshot })
    const ok = await call(savingPort, '/api/refresh', { method: 'POST', headers: { 'x-requested-by': 'anki-analytics' } })
    expect(ok.status).toBe(200)
    expect(saveSnapshot).toHaveBeenCalledWith(fakeData)
    saving.close()
    quiet.mockRestore()
  })

  it('returns 404 for anything else, including GET /api/refresh', async () => {
    expect((await call(port, '/api/refresh')).status).toBe(404)
    expect((await call(port, '/etc/passwd')).status).toBe(404)
  })
})

describe('the saved snapshot', () => {
  const snapshotPath = join(dir, 'served-snapshot.json')
  let port: number
  let server: Server
  beforeAll(async () => ({ server, port } = await start({ collectionPath: existing, read: () => fakeData, snapshotPath })))
  afterAll(() => server.close())

  it('answers 404 until one is saved, then serves it', async () => {
    expect((await call(port, '/snapshot.json')).status).toBe(404)
    writeFileSync(snapshotPath, '{"version":1}')
    expect(await call(port, '/snapshot.json')).toEqual({ status: 200, body: { version: 1 } })
  })

  it('refuses requests addressed to another domain', async () => {
    expect((await call(port, '/snapshot.json', { host: `evil.example:${port}` })).status).toBe(403)
  })

  it('is not served with any other method', async () => {
    expect((await call(port, '/snapshot.json', { method: 'POST' })).status).toBe(404)
  })
})

describe('your phone', () => {
  const phone = 'my-mac.my-tailnet.ts.net'
  const snapshotPath = join(dir, 'phone-snapshot.json')
  const cards = [{ deckId: 'a', front: 'Private note' }]
  const troubleCards = [{ cardId: '1', front: 'Private note', again: 3 }]
  const copy = vi.fn(() => ({ profile: 'Test', bytes: 1 }))
  let port: number
  let server: Server
  const dist = join(dir, 'phone-dist')
  beforeAll(async () => {
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'index.html'), '<title>app</title>')
    writeFileSync(snapshotPath, JSON.stringify({ version: 1, data: { source: 'anki', fsrs: { cards, troubleCards } } }))
    ;({ server, port } = await start({ collectionPath: existing, read: () => fakeData, snapshotPath, copy, distDir: dist, phoneHost: () => phone, status: () => { throw new Error('Not for the phone') } }))
  })
  afterAll(() => server.close())
  const fromPhone = (path: string, opts: { method?: string; headers?: Record<string, string> } = {}) => call(port, path, { ...opts, host: phone })

  it('gets the snapshot with every piece of note text gone', async () => {
    const { status, body } = await fromPhone('/snapshot.json')
    expect(status).toBe(200)
    expect(JSON.stringify(body)).not.toContain('Private note')
  })

  it('still gets the note text on this Mac', async () => {
    expect(JSON.stringify((await call(port, '/snapshot.json')).body)).toContain('Private note')
  })

  it('can’t read live stats or the status, or refresh', async () => {
    for (const path of ['/api/stats', '/api/status']) expect((await fromPhone(path)).status).toBe(404)
    const refresh = await fromPhone('/api/refresh', { method: 'POST', headers: { 'x-requested-by': 'anki-analytics' } })
    expect(refresh.status).toBe(404)
    expect(copy).not.toHaveBeenCalled()
  })

  it('can write nothing, on any path', async () => {
    expect((await fromPhone('/snapshot.json', { method: 'POST' })).status).toBe(404)
  })

  it('is refused if it arrives through Tailscale Funnel, the public internet', async () => {
    const { status } = await fromPhone('/snapshot.json', { headers: { 'tailscale-funnel-request': '?1' } })
    expect(status).toBe(403)
  })

  it('gets nothing if a forwarded request claims to be for this Mac', async () => {
    for (const header of ['x-forwarded-for', 'x-forwarded-host', 'tailscale-user-login']) {
      for (const path of ['/api/stats', '/snapshot.json']) {
        expect((await call(port, path, { headers: { [header]: 'someone' } })).status).toBe(403)
      }
    }
  })

  it('doesn’t open the door to any other name', async () => {
    expect((await call(port, '/snapshot.json', { host: 'other-mac.my-tailnet.ts.net' })).status).toBe(403)
  })
})

describe('with phone access off', () => {
  it('refuses the phone’s name like any other', async () => {
    const { server, port } = await start({ collectionPath: existing, read: () => fakeData, phoneHost: () => null })
    expect((await call(port, '/snapshot.json', { host: 'my-mac.my-tailnet.ts.net' })).status).toBe(403)
    server.close()
  })
})

describe('the built app', () => {
  const dist = join(dir, 'dist')
  let port: number
  let server: Server
  const raw = (path: string, host = `127.0.0.1:${port}`) =>
    new Promise<{ status: number; type?: string; body: string }>((resolve, reject) => {
      // Node's own client, as fetch would tidy a path like /../ before sending it
      request({ port, host: '127.0.0.1', path, headers: { host } }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode!, type: res.headers['content-type'], body }))
      })
        .on('error', reject)
        .end()
    })

  beforeAll(async () => {
    mkdirSync(join(dist, 'assets'), { recursive: true })
    writeFileSync(join(dist, 'index.html'), '<title>app</title>')
    writeFileSync(join(dist, 'assets', 'a.js'), 'x')
    writeFileSync(join(dir, 'secret.txt'), 'private')
    ;({ server, port } = await start({ collectionPath: existing, read: () => fakeData, distDir: dist }))
  })
  afterAll(() => server.close())

  it('serves the page and its files with the right types', async () => {
    expect(await raw('/')).toMatchObject({ status: 200, type: 'text/html; charset=utf-8', body: '<title>app</title>' })
    expect(await raw('/assets/a.js?v=1')).toMatchObject({ status: 200, type: 'text/javascript; charset=utf-8' })
  })

  it('only caches hashed files for long, wherever the project lives', async () => {
    const nested = join(dir, 'assets', 'dist')
    mkdirSync(join(nested, 'assets'), { recursive: true })
    writeFileSync(join(nested, 'index.html'), 'page')
    writeFileSync(join(nested, 'assets', 'a.js'), 'x')
    const { server: inner, port: innerPort } = await start({ collectionPath: existing, distDir: nested })
    const cache = async (path: string) => (await fetch(`http://127.0.0.1:${innerPort}${path}`)).headers.get('cache-control')
    expect(await cache('/')).toBe('no-cache')
    expect(await cache('/assets/a.js')).toContain('immutable')
    inner.close()
  })

  it('never reaches outside the build, however the path is written', async () => {
    for (const path of ['/../secret.txt', '/assets/../../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt']) {
      expect((await raw(path)).body).not.toContain('private')
    }
  })

  it('answers 404 for a missing file or a broken path, and leaves the API alone', async () => {
    expect((await raw('/nope.js')).status).toBe(404)
    expect((await raw('/%E0%A4%A')).status).toBe(404)
    expect((await raw('/assets')).status).toBe(404)
    expect(JSON.parse((await raw('/api/stats')).body)).toEqual(fakeData)
  })

  it('refuses other domains here too', async () => {
    expect((await raw('/', `evil.example:${port}`)).status).toBe(403)
  })

  it('has nothing to serve before a build', async () => {
    const { server: bare, port: barePort } = await start({ collectionPath: existing, distDir: join(dir, 'never-built') })
    expect((await call(barePort, '/')).status).toBe(404)
    bare.close()
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
  const status = { ankiRunning: false, updateAvailable: true, sourceModified: 1000, copyModified: null }

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
