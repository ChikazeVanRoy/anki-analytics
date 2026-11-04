// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimDeck, SimSettings } from '../lib/simulator'
import { useSimulation } from './useSimulation'

class FakeWorker {
  static last: FakeWorker | null = null
  onerror: ((e: Partial<ErrorEvent>) => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  posted: { id: number } | null = null
  terminated = false
  constructor() {
    FakeWorker.last = this
  }
  postMessage(request: { id: number }) {
    this.posted = request
  }
  terminate() {
    this.terminated = true
  }
}

const decks = [{ deckId: 'a', cards: [{}], newPool: 0 }] as unknown as SimDeck[]
const settings = { deckIds: ['a'], newPerDay: 10 } as unknown as SimSettings

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.last = null
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function started() {
  const hook = renderHook(() => useSimulation(decks, settings))
  await act(() => vi.advanceTimersByTimeAsync(300))
  return { hook, worker: FakeWorker.last! }
}

describe('useSimulation', () => {
  it('runs nothing when the caller already has the answer', async () => {
    renderHook(() => useSimulation(decks, settings, false))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(FakeWorker.last).toBeNull()
  })

  it('reports a worker failure and stops, instead of spinning forever', async () => {
    const { hook, worker } = await started()
    expect(hook.result.current.running).toBe(true)
    act(() => worker.onerror!({ message: 'Out of memory', preventDefault: () => {} }))
    expect(hook.result.current).toMatchObject({ error: 'Out of memory', running: false })
    expect(worker.terminated).toBe(true)
  })

  it('falls back to a plain message when the failure has none', async () => {
    const { hook, worker } = await started()
    act(() => worker.onerror!({ message: '', preventDefault: () => {} }))
    expect(hook.result.current.error).toBe('The simulation failed.')
  })

  it('ignores answers from an older run', async () => {
    const { hook, worker } = await started()
    act(() => worker.onmessage!({ data: { id: worker.posted!.id - 1, kind: 'main' } }))
    expect(hook.result.current.main).toBeNull()
  })

  it('says when its results belong to earlier settings', async () => {
    const { hook, worker } = await started()
    expect(hook.result.current.settled).toBe(false)
    act(() => worker.onmessage!({ data: { id: worker.posted!.id, kind: 'main' } }))
    expect(hook.result.current.settled).toBe(true)
    hook.rerender()
    expect(hook.result.current.settled).toBe(true)
  })

  it('finishes when the scenarios arrive', async () => {
    const { hook, worker } = await started()
    act(() => worker.onmessage!({ data: { id: worker.posted!.id, kind: 'scenarios' } }))
    expect(hook.result.current.running).toBe(false)
    expect(worker.terminated).toBe(true)
  })
})
