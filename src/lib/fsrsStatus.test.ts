import { describe, expect, it } from 'vitest'
import type { AnkiData } from '../data/types'
import { fsrsUnavailableReason } from './fsrsStatus'

const data = (d: Partial<AnkiData>) => ({ source: 'anki', ...d }) as AnkiData

describe('fsrsUnavailableReason', () => {
  it('explains mock data', () => expect(fsrsUnavailableReason(data({ source: 'mock' })).title).toMatch(/real Anki data/))
  it('reports a read error', () => expect(fsrsUnavailableReason(data({ fsrsError: 'Broken.' })).detail).toMatch(/^Broken\./))
  it('does not claim FSRS is off when FSRS data is simply missing', () => {
    expect(fsrsUnavailableReason(data({})).title).toBe('FSRS data unavailable')
  })
  it('says FSRS is off only when the collection reports it', () => {
    expect(fsrsUnavailableReason(data({ fsrs: { enabled: false } as AnkiData['fsrs'] })).title).toBe('FSRS is turned off in Anki')
  })
})
