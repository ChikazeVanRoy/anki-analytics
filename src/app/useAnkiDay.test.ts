// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnkiDay } from './useAnkiDay'

beforeEach(() => void vi.useFakeTimers({ now: new Date(2026, 2, 10, 23, 58) }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useAnkiDay', () => {
  it('redraws when the day rolls over, and not for every minute before it', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useAnkiDay(0)
    })
    const settled = renders
    act(() => void vi.advanceTimersByTime(60_000)) // 23:59
    expect(renders).toBe(settled)
    expect(result.current).toBe('2026-03-10')
    act(() => void vi.advanceTimersByTime(60_000)) // 00:00
    expect(result.current).toBe('2026-03-11')
    expect(renders).toBe(settled + 1)
  })

  it('follows the rollover hour', () => {
    expect(renderHook(() => useAnkiDay(4)).result.current).toBe('2026-03-10')
    vi.setSystemTime(new Date(2026, 2, 11, 3, 0))
    expect(renderHook(() => useAnkiDay(4)).result.current).toBe('2026-03-10')
    vi.setSystemTime(new Date(2026, 2, 11, 4, 0))
    expect(renderHook(() => useAnkiDay(4)).result.current).toBe('2026-03-11')
  })
})
