import { describe, expect, it } from 'vitest'
import { fakeFirebase } from '../test/fakeFirebase'
import { CloudError, freshSession, getSnapshot, MAX_SNAPSHOT_BASE64, putSnapshot, refreshSession, signIn, type CloudErrorKind } from './firebaseRest'

const kindOf = async (run: Promise<unknown>): Promise<CloudErrorKind | 'no error'> => {
  try {
    await run
    return 'no error'
  } catch (err) {
    return err instanceof CloudError ? err.kind : (() => { throw err })()
  }
}

describe('signIn', () => {
  it('returns a session for the right email and password', async () => {
    const google = fakeFirebase()
    const session = await signIn(google.config, google.email, google.password, google.net)
    expect(session.uid).toBe(google.uid)
    expect(session.expiresAt).toBe(google.state.now + 3_600_000)
  })

  it('says to sign in again for a wrong password or an unknown email', async () => {
    const google = fakeFirebase()
    expect(await kindOf(signIn(google.config, google.email, 'wrong', google.net))).toBe('credentials')
    expect(await kindOf(signIn(google.config, 'other@example.com', google.password, google.net))).toBe('credentials')
  })

  it('reports a bad API key as a server problem, not a wrong password', async () => {
    const google = fakeFirebase()
    expect(await kindOf(signIn({ ...google.config, apiKey: 'nope' }, google.email, google.password, google.net))).toBe('server')
  })

  it('reports no connection as a network problem', async () => {
    const google = fakeFirebase()
    google.state.offline = true
    expect(await kindOf(signIn(google.config, google.email, google.password, google.net))).toBe('network')
  })
})

describe('two people in one project', () => {
  const people = () => fakeFirebase({ others: [{ email: 'her@example.com', password: 'her password', uid: 'uid-2' }] })

  it('each have a snapshot of their own, and neither overwrites the other', async () => {
    const google = people()
    const mine = await signIn(google.config, google.email, google.password, google.net)
    const hers = await signIn(google.config, 'her@example.com', 'her password', google.net)
    await putSnapshot(google.config, mine, '{"who":"me"}', 'mine', google.net)
    await putSnapshot(google.config, hers, '{"who":"her"}', 'hers', google.net)
    expect(await getSnapshot(google.config, mine, google.net)).toEqual({ text: '{"who":"me"}', generatedAt: 'mine' })
    expect(await getSnapshot(google.config, hers, google.net)).toEqual({ text: '{"who":"her"}', generatedAt: 'hers' })
  })

  it('can’t read or write each other’s, even by asking for the other’s document directly', async () => {
    const google = people()
    const mine = await signIn(google.config, google.email, google.password, google.net)
    const hers = await signIn(google.config, 'her@example.com', 'her password', google.net)
    await putSnapshot(google.config, hers, '{"who":"her"}', 'hers', google.net)
    const hersAddress = `${google.net.hosts.firestore}/v1/projects/${google.config.projectId}/databases/(default)/documents/snapshots/${hers.uid}`
    for (const method of ['GET', 'PATCH']) {
      const res = await google.net.fetch(hersAddress, { method, headers: { Authorization: `Bearer ${mine.idToken}` }, body: method === 'PATCH' ? '{"fields":{}}' : undefined })
      expect(res.status).toBe(403)
    }
    expect(google.stored(hers.uid)?.generatedAt).toEqual({ stringValue: 'hers' })
  })

  it('an account anyone could have made, but the owner never allowed, can’t read or write at all', async () => {
    const google = fakeFirebase({ others: [{ email: 'stranger@example.com', password: 'x y z', uid: 'uid-9', allowed: false }] })
    const stranger = await signIn(google.config, 'stranger@example.com', 'x y z', google.net)
    expect(await kindOf(putSnapshot(google.config, stranger, '{"who":"stranger"}', 'x', google.net))).toBe('denied')
    expect(await kindOf(getSnapshot(google.config, stranger, google.net))).toBe('denied')
    expect(google.stored('uid-9')).toBeNull()
  })

  it('refuses a document with extra fields, however its owner got in', async () => {
    const google = fakeFirebase()
    const mine = await signIn(google.config, google.email, google.password, google.net)
    const address = `${google.net.hosts.firestore}/v1/projects/${google.config.projectId}/databases/(default)/documents/snapshots/${mine.uid}`
    const res = await google.net.fetch(address, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${mine.idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { gz: { bytesValue: 'AAAA' }, generatedAt: { stringValue: 'x' }, junk: { stringValue: 'y' } } }),
    })
    expect(res.status).toBe(403)
  })

  it('an account with nothing uploaded yet sees none, not someone else’s', async () => {
    const google = people()
    const mine = await signIn(google.config, google.email, google.password, google.net)
    const hers = await signIn(google.config, 'her@example.com', 'her password', google.net)
    await putSnapshot(google.config, mine, '{"who":"me"}', 'mine', google.net)
    expect(await getSnapshot(google.config, hers, google.net)).toBeNull()
  })
})

describe('a stalled connection', () => {
  it('gives up after the timeout instead of waiting forever, as a network problem', async () => {
    const google = fakeFirebase()
    // Never answers, but stops when told to, as a real request does
    const hanging: typeof google.net.fetch = (_input, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const stalled = { ...google.net, fetch: hanging, timeoutMs: 30 }
    expect(await kindOf(signIn(google.config, google.email, google.password, stalled))).toBe('network')
    const session = await signIn(google.config, google.email, google.password, google.net)
    expect(await kindOf(getSnapshot(google.config, session, stalled))).toBe('network')
  })
})

describe('refreshing a session', () => {
  it('gives a new token while the refresh token is good', async () => {
    const google = fakeFirebase()
    const first = await signIn(google.config, google.email, google.password, google.net)
    const next = await refreshSession(google.config, first, google.net)
    expect(next.idToken).not.toBe(first.idToken)
    expect(next.uid).toBe(google.uid)
  })

  it('says to sign in again once the refresh token is revoked', async () => {
    const google = fakeFirebase()
    const first = await signIn(google.config, google.email, google.password, google.net)
    google.revokeRefreshTokens()
    expect(await kindOf(refreshSession(google.config, first, google.net))).toBe('credentials')
  })

  it('only refreshes when the token is about to run out', async () => {
    const google = fakeFirebase()
    const first = await signIn(google.config, google.email, google.password, google.net)
    expect(await freshSession(google.config, first, google.net)).toBe(first)
    google.state.now += 3_600_000 - 30_000 // 30 s left
    expect((await freshSession(google.config, first, google.net)).idToken).not.toBe(first.idToken)
  })
})

describe('the snapshot document', () => {
  const text = JSON.stringify({ version: 1, data: { source: 'anki', note: 'ünïcode ✓', daily: Array.from({ length: 2000 }, (_, i) => ({ i })) } })

  it('comes back exactly as it went in, even with non-ASCII text', async () => {
    const google = fakeFirebase()
    const session = await signIn(google.config, google.email, google.password, google.net)
    await putSnapshot(google.config, session, text, '2026-11-18T10:00:00.000Z', google.net)
    expect(await getSnapshot(google.config, session, google.net)).toEqual({ text, generatedAt: '2026-11-18T10:00:00.000Z' })
  })

  it('stores it compressed, so a large collection has room to grow', async () => {
    const google = fakeFirebase()
    const session = await signIn(google.config, google.email, google.password, google.net)
    await putSnapshot(google.config, session, text, 'x', google.net)
    const gz = (google.stored()!.gz as { bytesValue: string }).bytesValue // stored just above
    expect(gz.length).toBeLessThan(text.length / 2)
  })

  it('is null before anything has been uploaded', async () => {
    const google = fakeFirebase()
    const session = await signIn(google.config, google.email, google.password, google.net)
    expect(await getSnapshot(google.config, session, google.net)).toBeNull()
  })

  it('is refused for another account, or while the rules aren’t deployed', async () => {
    const google = fakeFirebase()
    const session = await signIn(google.config, google.email, google.password, google.net)
    google.state.rulesDeployed = false
    expect(await kindOf(getSnapshot(google.config, session, google.net))).toBe('denied')
    expect(await kindOf(putSnapshot(google.config, session, text, 'x', google.net))).toBe('denied')
  })

  it('asks to sign in again when the token has stopped working', async () => {
    const google = fakeFirebase()
    const session = await signIn(google.config, google.email, google.password, google.net)
    google.expireTokens()
    expect(await kindOf(getSnapshot(google.config, session, google.net))).toBe('credentials')
  })

  it('refuses one too big for a document, before sending anything', async () => {
    const google = fakeFirebase()
    const session = await signIn(google.config, google.email, google.password, google.net)
    // Random bytes don't compress (getRandomValues takes 64 KiB at a time)
    const random = Array.from({ length: 16 }, () => crypto.getRandomValues(new Uint8Array(65_536)))
    const big = JSON.stringify({ junk: random.map((chunk) => Array.from(chunk, (byte) => String.fromCharCode(byte + 256)).join('')).join('') })
    expect(await kindOf(putSnapshot(google.config, session, big, 'x', google.net))).toBe('too-big')
    expect(google.calls.some((call) => call.startsWith('PATCH'))).toBe(false)
    expect(MAX_SNAPSHOT_BASE64).toBeLessThan(1_048_576)
  })
})
