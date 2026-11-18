// A stand-in for the parts of Google that sign-in and the snapshot document use, so tests never touch the network.
// It checks what the real thing checks: the API key, the password, the token, and whose document it is.

import type { FirebaseConfig, Net } from '../lib/firebaseRest.ts'

export const FAKE_HOSTS = { identity: 'https://identity.fake', secureToken: 'https://token.fake', firestore: 'https://firestore.fake' }

export interface FakeOptions {
  email?: string
  password?: string
  /** The account the security rules let in. */
  uid?: string
  apiKey?: string
  projectId?: string
  hosts?: typeof FAKE_HOSTS
}

type HeadersLike = ConstructorParameters<typeof Headers>[0]

export interface FakeReply {
  status: number
  json: unknown
}

export function fakeFirebase({ email = 'me@example.com', password = 'correct horse', uid = 'uid-1', apiKey = 'key-1', projectId = 'proj-1', hosts = FAKE_HOSTS }: FakeOptions = {}) {
  const config: FirebaseConfig = { apiKey, projectId }
  const idTokens = new Map<string, string>()
  const refreshTokens = new Map<string, string>()
  let counter = 0
  let stored: Record<string, unknown> | null = null
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
      if (sent.email !== email || sent.password !== password) return fail(400, 'INVALID_LOGIN_CREDENTIALS')
      const t = tokens(uid)
      return { status: 200, json: { idToken: t.id, refreshToken: t.refresh, expiresIn: '3600', localId: uid } }
    }

    if (target.origin === hosts.secureToken && target.pathname === '/v1/token') {
      const owner = refreshTokens.get(new URLSearchParams(body).get('refresh_token') ?? '')
      if (!owner) return fail(400, 'INVALID_REFRESH_TOKEN')
      const t = tokens(owner)
      return { status: 200, json: { id_token: t.id, refresh_token: t.refresh, expires_in: '3600', user_id: owner } }
    }

    if (target.origin === hosts.firestore && target.pathname === `/v1/projects/${projectId}/databases/(default)/documents/snapshots/latest`) {
      const headers = new Headers(init.headers)
      const owner = idTokens.get((headers.get('authorization') ?? '').replace('Bearer ', ''))
      if (!owner) return fail(401, 'Request had invalid authentication credentials.')
      if (!state.rulesDeployed || owner !== uid) return fail(403, 'Missing or insufficient permissions.')
      if (method === 'PATCH') {
        stored = (JSON.parse(body) as { fields: Record<string, unknown> }).fields
        return { status: 200, json: { name: 'snapshots/latest', fields: stored } }
      }
      return stored ? { status: 200, json: { name: 'snapshots/latest', fields: stored } } : fail(404, 'Document not found.')
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
    stored: () => stored,
  }
}
