// A stand-in for the parts of Google that sign-in and the snapshot document use, so tests never touch the network.
// It checks what the real thing checks: the API key, the password, the token, and whose document it is.

import type { FirebaseConfig, Net } from '../lib/firebaseRest.ts'

export const FAKE_HOSTS = { identity: 'https://identity.fake', secureToken: 'https://token.fake', firestore: 'https://firestore.fake' }

export interface FakeAccount {
  email: string
  password: string
  uid: string
  /** False: the account was made (anyone can) but never added to the owner's allow-list. Default true. */
  allowed?: boolean
}

export interface FakeOptions {
  email?: string
  password?: string
  uid?: string
  /** More accounts in the same project, each with a document of its own. */
  others?: FakeAccount[]
  apiKey?: string
  projectId?: string
  hosts?: typeof FAKE_HOSTS
}

type HeadersLike = ConstructorParameters<typeof Headers>[0]

export interface FakeReply {
  status: number
  json: unknown
}

export function fakeFirebase({ email = 'me@example.com', password = 'correct horse', uid = 'uid-1', others = [], apiKey = 'key-1', projectId = 'proj-1', hosts = FAKE_HOSTS }: FakeOptions = {}) {
  const config: FirebaseConfig = { apiKey, projectId }
  const idTokens = new Map<string, string>()
  const refreshTokens = new Map<string, string>()
  let counter = 0
  const accounts: FakeAccount[] = [{ email, password, uid }, ...others]
  /** Each account's document, by account id. */
  const stored = new Map<string, Record<string, unknown>>()
  const calls: string[] = []
  const state = { now: 1_700_000_000_000, rulesDeployed: true, offline: false }

  const fail = (status: number, message: string): FakeReply => ({ status, json: { error: { code: status, message } } })
  const tokens = (owner: string) => {
    counter += 1
    idTokens.set(`id-${counter}`, owner)
    refreshTokens.set(`refresh-${counter}`, owner)
    return { id: `id-${counter}`, refresh: `refresh-${counter}` }
  }

  function handle(url: string, init: { method?: string; headers?: HeadersLike; body?: unknown } = {}): FakeReply {
    const target = new URL(url)
    const method = init.method ?? 'GET'
    calls.push(`${method} ${target.origin}${target.pathname}`)
    if (state.offline) throw new TypeError('Failed to fetch')
    const body = typeof init.body === 'string' ? init.body : ''

    if (target.origin === hosts.identity && target.pathname === '/v1/accounts:signInWithPassword') {
      if (target.searchParams.get('key') !== apiKey) return fail(400, 'API key not valid. Please pass a valid API key.')
      const sent = JSON.parse(body) as { email: string; password: string }
      const account = accounts.find((a) => a.email === sent.email && a.password === sent.password)
      if (!account) return fail(400, 'INVALID_LOGIN_CREDENTIALS')
      const t = tokens(account.uid)
      return { status: 200, json: { idToken: t.id, refreshToken: t.refresh, expiresIn: '3600', localId: account.uid } }
    }

    if (target.origin === hosts.secureToken && target.pathname === '/v1/token') {
      const owner = refreshTokens.get(new URLSearchParams(body).get('refresh_token') ?? '')
      if (!owner) return fail(400, 'INVALID_REFRESH_TOKEN')
      const t = tokens(owner)
      return { status: 200, json: { id_token: t.id, refresh_token: t.refresh, expires_in: '3600', user_id: owner } }
    }

    const document = target.pathname.match(new RegExp(`^/v1/projects/${projectId}/databases/\\(default\\)/documents/snapshots/([^/]+)$`))
    if (target.origin === hosts.firestore && document) {
      const id = decodeURIComponent(document[1])
      const headers = new Headers(init.headers)
      const owner = idTokens.get((headers.get('authorization') ?? '').replace('Bearer ', ''))
      if (!owner) return fail(401, 'Request had invalid authentication credentials.')
      // The security rules: an account may read and write the document named by its own id, and nothing else
      const listed = accounts.find((a) => a.uid === owner)?.allowed !== false
      if (!state.rulesDeployed || owner !== id || !listed) return fail(403, 'Missing or insufficient permissions.')
      if (method === 'PATCH') {
        const fields = (JSON.parse(body) as { fields: Record<string, unknown> }).fields
        // The rules also limit what may be stored: only the fields the app writes, and no more than it can produce
        const gz = (fields.gz as { bytesValue?: string } | undefined)?.bytesValue ?? ''
        if (!Object.keys(fields).every((key) => ['gz', 'generatedAt', 'uploadedAt'].includes(key)) || (gz.length * 3) / 4 > 900_000) {
          return fail(403, 'Missing or insufficient permissions.')
        }
        stored.set(id, fields)
        return { status: 200, json: { name: `snapshots/${id}`, fields } }
      }
      const fields = stored.get(id)
      return fields ? { status: 200, json: { name: `snapshots/${id}`, fields } } : fail(404, 'Document not found.')
    }

    return fail(404, 'Not found')
  }

  const net: Net = {
    now: () => state.now,
    timeoutMs: 10_000,
    hosts,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const reply = handle(String(input), init as { method?: string; headers?: HeadersLike; body?: unknown })
      return new Response(JSON.stringify(reply.json), { status: reply.status, headers: { 'Content-Type': 'application/json' } })
    },
  }

  return {
    config,
    email,
    password,
    uid,
    net,
    handle,
    state,
    calls,
    /** Makes every token it has issued stop working, as an expiry would. */
    expireTokens: () => idTokens.clear(),
    /** Forgets every refresh token, as changing the password would. */
    revokeRefreshTokens: () => refreshTokens.clear(),
    /** An account's document (the first account's by default). */
    stored: (id = uid) => stored.get(id) ?? null,
  }
}
