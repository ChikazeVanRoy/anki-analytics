import { describe, expect, it, vi } from 'vitest'
import type { AnkiData } from '../src/data/types.ts'
import { createStatsReader, type StatsKey } from './statsReader.ts'

const data = (label: string) => ({ source: 'anki', daily: [], decks: [], generatedAt: label }) as unknown as AnkiData

/** Reads that finish only when the test says so, as a slow read on a busy Mac would. */
function setup(initial: StatsKey) {
  let key = initial
  const pending: ((d: AnkiData) => void)[] = []
  const read = vi.fn(() => new Promise<AnkiData>((resolve) => pending.push(resolve)))
  const stats = createStatsReader({ collectionPath: 'copy', read, statsKey: () => key, log: () => {} })
  const settle = () => new Promise((r) => setTimeout(r, 0))
  return { stats, read, setKey: (k: StatsKey) => (key = k), finish: (label: string) => pending.shift()!(data(label)), settle }
}

describe('createStatsReader', () => {
  it('lets a copy wait until the read under way has finished', async () => {
    const t = setup({ source: 'a', window: 1 })
    void t.stats.current()
    let idle = false
    void t.stats.idle().then(() => (idle = true))
    await t.settle()
    expect(idle).toBe(false)
    t.finish('a')
    await t.settle()
    expect(idle).toBe(true)
  })

  it('counts a slow read’s five minutes from when it finished, so it doesn’t start the next one straight away', async () => {
    const t = setup({ source: 'a', window: 1 })
    const first = t.stats.current()
    await t.settle()
    t.setKey({ source: 'a', window: 3 }) // ten minutes pass while it reads
    t.finish('a')
    await first
    await t.stats.current()
    expect(t.read).toHaveBeenCalledTimes(1)
  })

  it('shares a read even when the copy can’t be looked at', async () => {
    const t = setup(null)
    const both = Promise.all([t.stats.current(), t.stats.current()])
    await t.settle()
    expect(t.read).toHaveBeenCalledTimes(1)
    t.finish('x')
    await both
  })
})
