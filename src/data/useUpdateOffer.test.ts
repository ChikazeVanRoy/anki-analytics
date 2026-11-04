// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateOffer } from './useUpdateOffer'

const answer = (updateAvailable: boolean, sourceModified: number | null = 100, ankiRunning = false) =>
  vi.fn(async () => ({ ok: true, json: async () => ({ ankiRunning, updateAvailable, sourceModified }) }))
const flush = () => act(() => vi.advanceTimersByTimeAsync(0))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useUpdateOffer', () => {
  it('stays quiet while there’s nothing new', async () => {
    vi.stubGlobal('fetch', answer(false))
    const { result } = renderHook(() => useUpdateOffer('a', false))
    await flush()
    expect(result.current.update).toBeNull()
  })

  it('offers an update as soon as Anki closes with newer reviews', async () => {
    vi.stubGlobal('fetch', answer(false))
    const { result } = renderHook(() => useUpdateOffer('a', false))
    await flush()
    vi.stubGlobal('fetch', answer(true))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(result.current.update).toBe('reviews')
  })

  it('remembers a dismissal until the collection changes again', async () => {
    vi.stubGlobal('fetch', answer(true, 100))
    const { result } = renderHook(() => useUpdateOffer('a', false))
    await flush()
    act(() => result.current.dismissUpdate())
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(result.current.update).toBeNull()
    vi.stubGlobal('fetch', answer(true, 200))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(result.current.update).toBe('reviews')
  })

  it('checks again after a refresh changes the copy', async () => {
    vi.stubGlobal('fetch', answer(true))
    const { result, rerender } = renderHook(({ at }) => useUpdateOffer(at, false), { initialProps: { at: 'a' } })
    await flush()
    vi.stubGlobal('fetch', answer(false))
    rerender({ at: 'b' })
    await flush()
    expect(result.current.update).toBeNull()
  })

  it('offers a refresh on a new Anki day, even with no new reviews', async () => {
    vi.stubGlobal('fetch', answer(false))
    const { result } = renderHook(() => useUpdateOffer('a', true))
    await flush()
    expect(result.current.update).toBe('day')
  })

  it('doesn’t offer that while Anki is open, because the refresh would fail', async () => {
    vi.stubGlobal('fetch', answer(false, 100, true))
    const { result } = renderHook(() => useUpdateOffer('a', true))
    await flush()
    expect(result.current.update).toBeNull()
  })

  it('offers nothing when the API isn’t running', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))))
    const { result } = renderHook(() => useUpdateOffer('a', false))
    await flush()
    expect(result.current.update).toBeNull()
  })
})
