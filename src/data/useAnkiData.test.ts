import { describe, expect, it } from 'vitest'
import { mockData } from './mockData'
import type { AnkiData } from './types'
import { afterRecheck, type State } from './useAnkiData'

const real = (generatedAt: string): AnkiData => ({ ...mockData, source: 'anki', generatedAt })
const cloudSnapshot: State = { status: 'ready', data: real('2026-11-21T10:00:00Z'), fromSnapshot: true, fromCloud: true }

describe('afterRecheck', () => {
  it('asks to sign in again when Firebase ends the session, instead of keeping the old stats', () => {
    expect(afterRecheck(cloudSnapshot, { status: 'sign-in' })).toEqual({ status: 'sign-in' })
  })

  it('leaves a screen that isn’t showing stats alone', () => {
    const loading: State = { status: 'loading' }
    expect(afterRecheck(loading, { status: 'sign-in' })).toBe(loading)
  })

  it('keeps the same object when the snapshot hasn’t changed', () => {
    const same = { ...cloudSnapshot, data: real('2026-11-21T10:00:00Z') }
    expect(afterRecheck(cloudSnapshot, same)).toBe(cloudSnapshot)
  })

  it('takes newer stats, but never swaps real ones for sample data', () => {
    const newer: State = { status: 'ready', data: real('2026-11-22T10:00:00Z') }
    expect(afterRecheck(cloudSnapshot, newer)).toBe(newer)
    expect(afterRecheck(cloudSnapshot, { status: 'ready', data: mockData })).toBe(cloudSnapshot)
  })
})
