// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HorizonSummary } from '../lib/simulator'
import { realShapedData } from '../test/fsrsFixture'
import { mockData } from './mockData'
import { useTodayPlan } from './useTodayPlan'

class FakeWorker {
  static created = 0
  static last: FakeWorker
  onerror: ((e: Partial<ErrorEvent>) => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  posted: { id: number } | null = null
  constructor() {
    FakeWorker.created++
    FakeWorker.last = this
  }
  postMessage(request: { id: number }) {
    this.posted = request
  }
  terminate() {}
}

const point = (value: number, minutes: number) => ({
  value,
  byHorizon: { 365: { maxWindowPerStudyDay: minutes, backlogEnd: 0 } as HorizonSummary },
})
const answer = () =>
  act(() =>
    FakeWorker.last.onmessage!({
      data: { id: FakeWorker.last.posted!.id, kind: 'scenarios', retention: [], newPerDay: [point(0, 1), point(10, 2), point(20, 3)] },
    }),
  )

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.created = 0
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useTodayPlan', () => {
  const today = new Date()

  it('has no plan without FSRS data', () => {
    expect(renderHook(() => useTodayPlan(mockData, today)).result.current).toBeNull()
  })

  it('is pending, then reports the Planner’s sustainable limit', async () => {
    const data = realShapedData()
    const hook = renderHook(() => useTodayPlan(data, today))
    expect(hook.result.current).toEqual({ status: 'pending' })
    await act(() => vi.advanceTimersByTimeAsync(300))
    answer()
    expect(hook.result.current).toMatchObject({ status: 'ready', max: { value: 20, capped: true } })
  })

  it('doesn’t simulate again when Home is reopened on the same copy', async () => {
    const data = { ...realShapedData(), generatedAt: new Date(Date.now() + 1).toISOString() }
    const first = renderHook(() => useTodayPlan(data, today))
    await act(() => vi.advanceTimersByTimeAsync(300))
    answer()
    first.unmount()
    const second = renderHook(() => useTodayPlan(data, today))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(FakeWorker.created).toBe(1)
    expect(second.result.current).toMatchObject({ status: 'ready' })
  })

  it('simulates again after a refresh, and never reuses the old copy’s answer', async () => {
    const before = { ...realShapedData(), generatedAt: new Date(Date.now() + 3).toISOString() }
    const hook = renderHook(({ data }) => useTodayPlan(data, today), { initialProps: { data: before } })
    await act(() => vi.advanceTimersByTimeAsync(300))
    answer()
    expect(hook.result.current).toMatchObject({ status: 'ready' })
    const created = FakeWorker.created
    hook.rerender({ data: { ...realShapedData(), generatedAt: new Date(Date.now() + 4).toISOString() } })
    expect(hook.result.current).toEqual({ status: 'pending' })
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(FakeWorker.created).toBe(created + 1)
  })

  it('gives up quietly if the simulation fails', async () => {
    const data = { ...realShapedData(), generatedAt: new Date(Date.now() + 2).toISOString() }
    const hook = renderHook(() => useTodayPlan(data, today))
    await act(() => vi.advanceTimersByTimeAsync(300))
    act(() => FakeWorker.last.onerror!({ message: 'x', preventDefault: () => {} }))
    expect(hook.result.current).toBeNull()
  })
})
