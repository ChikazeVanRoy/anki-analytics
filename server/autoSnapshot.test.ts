import { describe, expect, it, vi } from 'vitest'
import { refreshSnapshotIfStale } from './autoSnapshot.ts'

const run = async (over: Partial<Parameters<typeof refreshSnapshotIfStale>[0]> = {}) => {
  const save = vi.fn()
  const saved = await refreshSnapshotIfStale({ hasSnapshot: () => true, updateAvailable: () => false, save, log: () => {}, ...over })
  return { saved, save }
}

describe('refreshSnapshotIfStale', () => {
  it('does nothing while the snapshot is current', async () => {
    const { saved, save } = await run()
    expect(saved).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
  it('saves when Anki has closed with newer data', async () => {
    expect((await run({ updateAvailable: () => true })).save).toHaveBeenCalledOnce()
  })
  it('saves when there is no snapshot yet', async () => {
    expect((await run({ hasSnapshot: () => false })).save).toHaveBeenCalledOnce()
  })
  it('logs a failure instead of throwing, so the timer keeps going', async () => {
    const log = vi.fn()
    const { saved } = await run({ updateAvailable: () => true, save: () => { throw new Error('Anki is running.') }, log })
    expect(saved).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Anki is running.'))
  })
  it('waits for a save that takes a while, and logs its failure too', async () => {
    const log = vi.fn()
    const { saved } = await run({ updateAvailable: () => true, save: () => Promise.reject(new Error('read failed')), log })
    expect(saved).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('read failed'))
  })
})
