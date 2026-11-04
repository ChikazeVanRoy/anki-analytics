// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateOffer } from './useUpdateOffer'

const answer = (updateAvailable: boolean, sourceModified: number | null = 100) =>
  vi.fn(async () => ({ ok: true, json: async () => ({ updateAvailable, sourceModified }) }))
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
    const { result } = renderHook(() => useUpdateOffer('a'))
    await flush()
    expect(result.current.updateReady).toBe(false)
  })

  it('offers an update as soon as Anki closes with newer reviews', async () => {
    vi.stubGlobal('fetch', answer(false))
    const { result } = renderHook(() => useUpdateOffer('a'))
    await flush()
    vi.stubGlobal('fetch', answer(true))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(result.current.updateReady).toBe(true)
  })

  it('remembers a dismissal until the collection changes again', async () => {
    vi.stubGlobal('fetch', answer(true, 100))
    const { result } = renderHook(() => useUpdateOffer('a'))
    await flush()
    act(() => result.current.dismissUpdate())
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(result.current.updateReady).toBe(false)
    vi.stubGlobal('fetch', answer(true, 200))
    await act(() => vi.advanceTimersByTimeAsync(15_000))
    expect(result.current.updateReady).toBe(true)
  })

  it('checks again after a refresh changes the copy', async () => {
    vi.stubGlobal('fetch', answer(true))
    const { result, rerender } = renderHook(({ at }) => useUpdateOffer(at), { initialProps: { at: 'a' } })
    await flush()
    vi.stubGlobal('fetch', answer(false))
    rerender({ at: 'b' })
    await flush()
    expect(result.current.updateReady).toBe(false)
  })

  it('offers nothing when the API isn’t running', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))))
    const { result } = renderHook(() => useUpdateOffer('a'))
    await flush()
    expect(result.current.updateReady).toBe(false)
  })
})
