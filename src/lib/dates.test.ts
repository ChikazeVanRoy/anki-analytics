import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ankiDayKey } from './dates'

describe('ankiDayKey', () => {
  beforeAll(() => void vi.stubEnv('TZ', 'America/New_York'))
  afterAll(() => void vi.unstubAllEnvs())

  it('counts the hours before rollover towards the day before', () => {
    expect(ankiDayKey(Date.parse('2026-01-15T08:30:00Z'), 4)).toBe('2026-01-14') // 03:30 local
    expect(ankiDayKey(Date.parse('2026-01-15T09:30:00Z'), 4)).toBe('2026-01-15') // 04:30 local
  })

  it('goes by the clock when it moves forward', () => {
    expect(ankiDayKey(Date.parse('2026-03-08T07:30:00Z'), 4)).toBe('2026-03-07') // 03:30 local
    expect(ankiDayKey(Date.parse('2026-03-08T08:30:00Z'), 4)).toBe('2026-03-08') // 04:30 local, 3.5 hours after midnight
  })

  it('goes by the clock when it moves back', () => {
    expect(ankiDayKey(Date.parse('2026-11-01T08:30:00Z'), 4)).toBe('2026-10-31') // 03:30 local, 4.5 hours after midnight
    expect(ankiDayKey(Date.parse('2026-11-01T09:30:00Z'), 4)).toBe('2026-11-01') // 04:30 local
  })

  it('needs no adjustment with a midnight rollover', () => {
    expect(ankiDayKey(Date.parse('2026-01-15T05:30:00Z'), 0)).toBe('2026-01-15') // 00:30 local
  })
})
