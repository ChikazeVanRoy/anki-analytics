import { describe, expect, it, vi } from 'vitest'
import { syncOnce, TIMING, type SyncDeps } from './ankiSync.ts'

/** A pretend Anki: opens when asked, and closes when asked unless told it's stuck. */
function fakes(overrides: Partial<SyncDeps> = {}, { stuck = false, neverStarts = false } = {}) {
  let running = false
  const deps = {
    ankiRunning: vi.fn(() => running),
    blocker: vi.fn(() => null),
    online: vi.fn(() => true),
    openAnki: vi.fn(() => {
      if (!neverStarts) running = true
    }),
    quitAnki: vi.fn(() => {
      if (!stuck) running = false
    }),
    snapshot: vi.fn(() => ({})),
    sleep: vi.fn(async () => {}),
    ...overrides,
  }
  return deps
}

describe('syncOnce', () => {
  it('opens Anki, lets it sync, closes it, then saves a snapshot, in that order', async () => {
    const deps = fakes()
    expect((await syncOnce(deps)).outcome).toBe('updated')
    const [opened] = vi.mocked(deps.openAnki).mock.invocationCallOrder
    const [quit] = vi.mocked(deps.quitAnki).mock.invocationCallOrder
    const [saved] = vi.mocked(deps.snapshot).mock.invocationCallOrder
    expect(opened).toBeLessThan(quit)
    expect(quit).toBeLessThan(saved)
    expect(deps.sleep).toHaveBeenCalledWith(TIMING.settleMs)
  })

  it('leaves Anki alone if it’s already open', async () => {
    const deps = fakes({ ankiRunning: vi.fn(() => true) })
    expect((await syncOnce(deps)).outcome).toBe('skipped')
    expect(deps.openAnki).not.toHaveBeenCalled()
    expect(deps.quitAnki).not.toHaveBeenCalled()
    expect(deps.snapshot).not.toHaveBeenCalled()
  })

  it('doesn’t open Anki when it couldn’t run unattended', async () => {
    const deps = fakes({ blocker: vi.fn(() => 'Several profiles') })
    expect(await syncOnce(deps)).toEqual({ outcome: 'skipped', message: 'Several profiles' })
    expect(deps.openAnki).not.toHaveBeenCalled()
  })

  it('reports Anki stuck rather than forcing it, and saves nothing while it’s open', async () => {
    const deps = fakes({}, { stuck: true })
    expect((await syncOnce(deps)).outcome).toBe('stuck')
    expect(deps.quitAnki).toHaveBeenCalledOnce()
    expect(deps.snapshot).not.toHaveBeenCalled()
  })

  it('goes by whether Anki closed, as it reports an error even while closing', async () => {
    let running = false
    const deps = fakes({
      ankiRunning: vi.fn(() => running),
      openAnki: vi.fn(() => void (running = true)),
      quitAnki: vi.fn(() => {
        running = false
        throw new Error('User cancelled. (-128)')
      }),
    })
    expect((await syncOnce(deps)).outcome).toBe('updated')
    expect(deps.snapshot).toHaveBeenCalledOnce()
  })

  it('reports a refused quit, when Anki really stays open', async () => {
    const deps = fakes({ quitAnki: vi.fn(() => { throw new Error('Not authorised') }) })
    expect((await syncOnce(deps)).outcome).toBe('stuck')
    expect(deps.snapshot).not.toHaveBeenCalled()
  })

  it('reports any other failure instead of crashing', async () => {
    const deps = fakes({ openAnki: vi.fn(() => { throw new Error('No such app') }) })
    expect(await syncOnce(deps)).toEqual({ outcome: 'failed', message: 'No such app' })
  })

  it('gives up if Anki never starts', async () => {
    const deps = fakes({}, { neverStarts: true })
    expect((await syncOnce(deps)).outcome).toBe('failed')
    expect(deps.quitAnki).not.toHaveBeenCalled()
  })

  it('saves what this Mac has when offline, without opening Anki', async () => {
    const deps = fakes({ online: vi.fn(() => false) })
    expect((await syncOnce(deps)).outcome).toBe('offline')
    expect(deps.openAnki).not.toHaveBeenCalled()
    expect(deps.snapshot).toHaveBeenCalledOnce()
  })

  it('doesn’t call it a success when the snapshot came from an old copy, or failed', async () => {
    const old = await syncOnce(fakes({ snapshot: vi.fn(() => ({ skippedCopy: 'Anki did not close cleanly.' })) }))
    expect(old.outcome).toBe('failed')
    expect(old.message).toContain('did not close cleanly')
    const broken = fakes({ snapshot: vi.fn((): { skippedCopy?: string } => { throw new Error('Bad config') }) })
    expect(await syncOnce(broken)).toEqual({ outcome: 'failed', message: 'Bad config' })
  })
})
