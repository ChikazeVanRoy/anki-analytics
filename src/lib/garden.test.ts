import { describe, expect, it } from 'vitest'
import type { Deck } from '../data/types'
import { gardenBed as bedAt, plantUnit } from './garden'

const deck = (newCards: number, youngCards: number, matureCards: number, id = 'mandarin'): Deck => ({
  id,
  name: id,
  totalCards: newCards + youngCards + matureCards,
  newCards,
  youngCards,
  matureCards,
})

/** A bed on its own, with the unit chosen for it alone (as in a one-deck garden of up to 60 plants). */
const gardenBed = (d: Deck) => bedAt(d, plantUnit([d], 60))
const stageCount = (bed: ReturnType<typeof gardenBed>, stage: string) => bed.plants.filter((p) => p.stage === stage).length

describe('plantUnit', () => {
  it('picks the smallest round number of studied cards per plant that fits', () => {
    expect(plantUnit([deck(500, 20, 20)], 60)).toBe(1) // seeds don't count
    expect(plantUnit([deck(0, 61, 0)], 60)).toBe(2)
    expect(plantUnit([deck(0, 0, 0)], 60)).toBe(1)
  })
  it('shares one unit across decks, so a small deck looks smaller than a big one', () => {
    const big = deck(0, 500, 500)
    const small = deck(0, 25, 25, 'portuguese')
    const unit = plantUnit([big, small], 60)
    expect(unit).toBe(20)
    expect(bedAt(big, unit).plants).toHaveLength(50)
    expect(bedAt(small, unit).plants.length).toBeLessThan(5)
  })
  it('keeps the cap even when rounding and the one-plant minimum add plants', () => {
    // 1,190 sprouts + 10 flowers at 20 per plant would round to 60 + 1 = 61 plants
    const d = deck(0, 1_190, 10)
    const unit = plantUnit([d], 60)
    expect(unit).toBe(25)
    expect(bedAt(d, unit).plants.length).toBeLessThanOrEqual(60)
  })
})

describe('gardenBed', () => {
  it('plants studied cards only, one plant per unit, keeping exact counts including seeds', () => {
    const bed = gardenBed(deck(7_000, 200, 400))
    expect(bed.unit).toBe(10) // scaled to the 600 studied cards, not the 7,600 in the deck
    expect(bed.counts).toEqual({ seed: 7_000, sprout: 200, flower: 400 })
    expect([stageCount(bed, 'sprout'), stageCount(bed, 'flower')]).toEqual([20, 40])
    expect(bed.plants).toHaveLength(60)
  })

  it('never hides a stage that has cards, and never invents one that has none', () => {
    const bed = gardenBed(deck(990, 3, 500))
    expect(stageCount(bed, 'sprout')).toBe(1)
    expect(gardenBed(deck(990, 3, 0)).plants.every((p) => p.stage === 'sprout')).toBe(true)
    expect(gardenBed(deck(50, 0, 0)).plants).toEqual([])
  })

  it('lays out the same deck the same way every time, and different decks differently', () => {
    expect(gardenBed(deck(30, 20, 10))).toEqual(gardenBed(deck(30, 20, 10)))
    const a = gardenBed(deck(30, 20, 10)).plants.map((p) => p.stage)
    const b = gardenBed(deck(30, 20, 10, 'portuguese')).plants.map((p) => p.stage)
    expect(a).not.toEqual(b)
  })

  it('keeps the hand-planted offsets small', () => {
    for (const p of gardenBed(deck(30, 20, 10)).plants) {
      expect(Math.abs(p.lift)).toBeLessThanOrEqual(2)
      expect(Math.abs(p.tilt)).toBeLessThanOrEqual(8)
      expect(p.scale).toBeGreaterThanOrEqual(0.85)
      expect(p.scale).toBeLessThanOrEqual(1.1)
    }
  })
})
