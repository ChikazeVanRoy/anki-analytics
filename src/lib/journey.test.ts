import { describe, expect, it } from 'vitest'
import type { Deck } from '../data/types'
import { journey } from './journey'

const deck = (started: number, totalCards: number) => ({ youngCards: started, matureCards: 0, totalCards }) as Deck

describe('journey', () => {
  it('shows the road around you, with the distance to the next stop', () => {
    const j = journey(deck(347, 7329))
    expect(j.step).toBe(100)
    expect(j.stops.map((s) => s.at)).toEqual([200, 300, 400, 500, 600, 700])
    expect(j.stops.map((s) => s.reached)).toEqual([true, true, false, false, false, false])
    expect(j.toNext).toBe(53)
    expect(j.position).toBeCloseTo(147 / 500)
  })

  it('starts at the beginning, with shorter steps for a small deck', () => {
    const j = journey(deck(0, 90))
    expect(j.step).toBe(10)
    expect(j.stops[0]).toEqual({ at: 0, reached: true, finish: false })
    expect(j.position).toBe(0)
  })

  it('ends on the deck’s last card', () => {
    const j = journey(deck(95, 103))
    expect(j.stops.at(-1)).toEqual({ at: 103, reached: false, finish: true })
    expect(j.toNext).toBe(5)
  })

  it('has nowhere left to go once finished', () => {
    const j = journey(deck(100, 100))
    expect(j).toMatchObject({ toNext: 0, position: 1 })
  })
})
