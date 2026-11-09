import { describe, expect, it, vi } from 'vitest'
import { refreshSnapshotIfStale } from './autoSnapshot.ts'

const run = (over: Partial<Parameters<typeof refreshSnapshotIfStale>[0]> = {}) => {
  const save = vi.fn()
  const saved = refreshSnapshotIfStale({ hasSnapshot: () => true, updateAvailable: () => false, save, log: () => {}, ...over })
  return { saved, save }
}

describe('refreshSnapshotIfStale', () => {
  it('does nothing while the snapshot is current', () => {
    const { saved, save } = run()
    expect(saved).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
  it('saves when Anki has closed with newer data', () => {
    expect(run({ updateAvailable: () => true }).save).toHaveBeenCalledOnce()
  })
  it('saves when there is no snapshot yet', () => {
    expect(run({ hasSnapshot: () => false }).save).toHaveBeenCalledOnce()
  })
  it('logs a failure instead of throwing, so the timer keeps going', () => {
    const log = vi.fn()
    const { saved } = run({ updateAvailable: () => true, save: () => { throw new Error('Anki is running.') }, log })
    expect(saved).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Anki is running.'))
  })
})
