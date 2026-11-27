import { describe, expect, it, vi } from 'vitest'
import { stamped } from './logStamp.ts'

describe('stamped', () => {
  it('puts the local time in front of each line, keeping what was logged', () => {
    const write = vi.fn()
    const err = new Error('boom')
    stamped(write, () => new Date(2026, 10, 27, 9, 5, 3))('stats:', 146, err)
    expect(write).toHaveBeenCalledWith('2026-11-27 09:05:03', 'stats:', 146, err)
  })
})
