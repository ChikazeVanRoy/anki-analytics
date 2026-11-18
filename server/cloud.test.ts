import { describe, expect, it } from 'vitest'
import { getSnapshot, signIn } from '../src/lib/firebaseRest.ts'
import { fakeFirebase } from '../src/test/fakeFirebase.ts'
import { firestoreRules, parseCloudSettings, uploadSnapshot, cloudInfo, type CloudDeps, type CloudStatus } from './cloud.ts'

const API_KEY = 'AIzaSyExampleExampleExampleExample1234'
const settings = { projectId: 'my-anki-stats', apiKey: API_KEY, email: 'me@example.com' }

/** A saved snapshot file with note text in it, as the Mac writes it. */
const savedSnapshot = (generatedAt = '2026-11-18T10:00:00.000Z') =>
  JSON.stringify({
    version: 1,
    data: {
      source: 'anki',
      generatedAt,
      dayStartHour: 4,
      decks: [],
      daily: [],
      fsrs: { cards: [{ deckId: 'a', front: 'Secret note' }], troubleCards: [{ cardId: '1', front: 'Secret note' }] },
    },
  })

function setup(overrides: Partial<CloudDeps> = {}) {
  const google = fakeFirebase({ projectId: settings.projectId, apiKey: API_KEY, email: settings.email })
  let status: CloudStatus = {}
  let snapshot: string | null = savedSnapshot()
  const deps: CloudDeps = {
    settings: () => settings,
    keychain: { read: () => google.password },
    snapshot: () => snapshot,
    net: google.net,
    readStatus: () => status,
    writeStatus: (next) => void (status = next),
    session: { current: null },
    ...overrides,
  }
  return { google, deps, status: () => status, setSnapshot: (text: string | null) => (snapshot = text) }
}

describe('uploadSnapshot', () => {
  it('uploads the snapshot, and what the phone reads has no note text', async () => {
    const { google, deps } = setup()
    expect((await uploadSnapshot(deps)).outcome).toBe('uploaded')
    const session = await signIn(google.config, google.email, google.password, google.net)
    const stored = await getSnapshot(google.config, session, google.net)
    expect(stored?.generatedAt).toBe('2026-11-18T10:00:00.000Z')
    expect(stored?.text).not.toContain('Secret note')
    expect(JSON.parse(stored!.text).data.fsrs.cards[0]).toEqual({ deckId: 'a' })
  })

  it('does nothing when the cloud isn’t set up, or there is no snapshot', async () => {
    expect((await uploadSnapshot(setup({ settings: () => null }).deps)).outcome).toBe('off')
    const none = setup()
    none.setSnapshot(null)
    expect((await uploadSnapshot(none.deps)).outcome).toBe('no-snapshot')
    expect(none.google.calls).toEqual([])
  })

  it('uploads each snapshot once, and again when a newer one is saved', async () => {
    const { google, deps, setSnapshot } = setup()
    await uploadSnapshot(deps)
    expect((await uploadSnapshot(deps)).outcome).toBe('unchanged')
    expect(google.calls.filter((call) => call.startsWith('PATCH'))).toHaveLength(1)
    setSnapshot(savedSnapshot('2026-11-18T11:00:00.000Z'))
    expect((await uploadSnapshot(deps)).outcome).toBe('uploaded')
    expect(google.calls.filter((call) => call.startsWith('PATCH'))).toHaveLength(2)
  })

  it('signs in once and keeps the session for later uploads', async () => {
    const { google, deps, setSnapshot } = setup()
    await uploadSnapshot(deps)
    setSnapshot(savedSnapshot('2026-11-18T11:00:00.000Z'))
    await uploadSnapshot(deps)
    expect(google.calls.filter((call) => call.endsWith('signInWithPassword'))).toHaveLength(1)
  })

  it('refreshes an expiring session instead of signing in again', async () => {
    const { google, deps, setSnapshot } = setup()
    await uploadSnapshot(deps)
    google.state.now += 3_600_000
    setSnapshot(savedSnapshot('2026-11-18T11:00:00.000Z'))
    expect((await uploadSnapshot(deps)).outcome).toBe('uploaded')
    expect(google.calls.filter((call) => call.endsWith('signInWithPassword'))).toHaveLength(1)
    expect(google.calls.filter((call) => call.endsWith('/v1/token'))).toHaveLength(1)
  })

  it('signs in afresh if its token is refused, rather than failing', async () => {
    const { google, deps, setSnapshot } = setup()
    await uploadSnapshot(deps)
    google.expireTokens()
    setSnapshot(savedSnapshot('2026-11-18T11:00:00.000Z'))
    expect((await uploadSnapshot(deps)).outcome).toBe('uploaded')
  })

  it('says what to do when there is no saved password', async () => {
    const { deps, status } = setup({ keychain: { read: () => null } })
    const result = await uploadSnapshot(deps)
    expect(result.outcome).toBe('failed')
    expect(result.message).toContain('npm run cloud -- login')
    expect(status().problem?.kind).toBe('credentials')
  })

  it('says what to do when the rules haven’t been deployed', async () => {
    const { google, deps } = setup()
    google.state.rulesDeployed = false
    expect((await uploadSnapshot(deps)).message).toContain('npm run cloud -- deploy')
  })

  it('retries a network failure every time, but leaves a failure only you can fix alone for an hour', async () => {
    const { google, deps } = setup()
    google.state.offline = true
    await uploadSnapshot(deps)
    google.state.offline = false
    expect((await uploadSnapshot(deps)).outcome).toBe('uploaded') // a network problem isn't held against it

    const wrong = setup({ keychain: { read: () => 'wrong password' } })
    expect((await uploadSnapshot(wrong.deps)).outcome).toBe('failed')
    const attempts = wrong.google.calls.length
    expect((await uploadSnapshot(wrong.deps)).outcome).toBe('failed')
    expect(wrong.google.calls).toHaveLength(attempts) // didn't try Google again
    wrong.google.state.now += 61 * 60_000
    await uploadSnapshot(wrong.deps)
    expect(wrong.google.calls.length).toBeGreaterThan(attempts) // an hour on, it tries again
  })

  it('tries at once when forced, whatever happened before', async () => {
    const wrong = setup({ keychain: { read: () => 'wrong password' } })
    await uploadSnapshot(wrong.deps)
    const attempts = wrong.google.calls.length
    await uploadSnapshot(wrong.deps, { force: true })
    expect(wrong.google.calls.length).toBeGreaterThan(attempts)
  })

  it('clears an earlier problem once an upload works', async () => {
    const { google, deps, status } = setup()
    google.state.offline = true
    await uploadSnapshot(deps)
    expect(status().problem).toBeDefined()
    google.state.offline = false
    await uploadSnapshot(deps)
    expect(status().problem).toBeUndefined()
  })

  it('reports an unreadable snapshot file without calling Google', async () => {
    const { google, deps, setSnapshot } = setup()
    setSnapshot('not json')
    expect((await uploadSnapshot(deps)).outcome).toBe('failed')
    expect(google.calls).toEqual([])
  })
})

describe('parseCloudSettings', () => {
  it('accepts well-formed settings', () => {
    expect(parseCloudSettings(settings)).toEqual(settings)
  })

  it('refuses anything that could change a web address, or isn’t a project', () => {
    for (const bad of [
      { ...settings, projectId: 'a/../b' },
      { ...settings, projectId: 'UPPER-case' },
      { ...settings, apiKey: 'short' },
      { ...settings, apiKey: `${API_KEY}&x=1` },
      { ...settings, email: 'not-an-email' },
      null,
      'text',
      {},
    ]) {
      expect(parseCloudSettings(bad)).toBeNull()
    }
  })
})

describe('firestoreRules', () => {
  it('lets only that account into the snapshot document, and nothing else', () => {
    const rules = firestoreRules('abcDEF1234567890xyz')
    expect(rules).toContain("request.auth.uid == 'abcDEF1234567890xyz'")
    expect(rules).toContain('match /snapshots/latest')
    expect(rules.match(/match /g)).toHaveLength(2) // the database, and that one document
  })

  it('refuses an id that could rewrite the rules', () => {
    expect(() => firestoreRules("x' || true || '")).toThrow()
    expect(() => firestoreRules('')).toThrow()
  })
})

describe('cloudInfo', () => {
  it('is null until set up, then shows the last upload and any problem', () => {
    expect(cloudInfo(null, {})).toBeNull()
    expect(cloudInfo(settings, { uploadedAt: 'then', problem: { kind: 'network', message: 'Offline', at: 'now' } })).toEqual({
      uploadedAt: 'then',
      problem: { message: 'Offline', at: 'now' },
    })
  })
})
