import { describe, expect, it } from 'vitest'
import { parseSnapshot, SNAPSHOT_VERSION, wrapSnapshot } from './snapshot'

const stats = { source: 'anki', generatedAt: '2026-11-04T10:00:00.000Z', dayStartHour: 4, decks: [], daily: [] }

describe('parseSnapshot', () => {
  it('returns the stats from a snapshot it wrote, unchanged', () => {
    expect(parseSnapshot(wrapSnapshot(stats))).toEqual(stats)
  })

  it('refuses a snapshot from another version of the app', () => {
    expect(parseSnapshot({ version: SNAPSHOT_VERSION + 1, data: stats })).toBeNull()
  })

  it('never accepts sample data as real', () => {
    expect(parseSnapshot(wrapSnapshot({ ...stats, source: 'mock' }))).toBeNull()
  })

  it('refuses anything that is not a complete snapshot', () => {
    const broken = [null, 'x', [], {}, { version: SNAPSHOT_VERSION }, wrapSnapshot(null), wrapSnapshot({ ...stats, decks: undefined }), wrapSnapshot({ ...stats, daily: {} })]
    for (const body of [...broken, wrapSnapshot({ ...stats, generatedAt: 'soon' }), wrapSnapshot({ ...stats, dayStartHour: '4' })]) {
      expect(parseSnapshot(body)).toBeNull()
    }
  })
})
