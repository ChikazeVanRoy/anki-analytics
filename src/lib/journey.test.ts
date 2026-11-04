import { describe, expect, it } from 'vitest'
import type { Deck } from '../data/types'
import { journey, pointOnRoad, roadPath, shownProgress } from './journey'

const deck = (started: number, totalCards: number) => ({ youngCards: started, matureCards: 0, totalCards }) as Deck

describe('journey', () => {
  it('runs the whole deck, from the first card to the last', () => {
    const j = journey(deck(347, 7329))
    expect(j.stops.map((s) => s.at)).toEqual([0, 2500, 5000, 7329])
    expect(j.stops.map((s) => s.reached)).toEqual([true, false, false, false])
    expect(j.stops.at(-1)).toMatchObject({ share: 1, finish: true })
    expect(j).toMatchObject({ started: 347, total: 7329, toGo: 6982 })
    expect(j.progress).toBeCloseTo(347 / 7329)
  })

  it('counts both learning and known cards as started', () => {
    const j = journey({ youngCards: 30, matureCards: 20, totalCards: 100 } as Deck)
    expect(j).toMatchObject({ started: 50, toGo: 50, progress: 0.5 })
  })

  it('leaves out a round stop that would crowd the finish', () => {
    expect(journey(deck(0, 5010)).stops.map((s) => s.at)).toEqual([0, 2500, 5010])
  })

  it('keeps a small deck to a short road', () => {
    expect(journey(deck(0, 3)).stops.map((s) => s.at)).toEqual([0, 3])
  })

  it('has nothing left to go once finished', () => {
    expect(journey(deck(100, 100))).toMatchObject({ toGo: 0, progress: 1 })
  })

  it('copes with an empty deck', () => {
    const j = journey(deck(0, 0))
    expect(j).toMatchObject({ toGo: 0, progress: 0 })
    expect(j.stops).toEqual([{ at: 0, share: 0, reached: true, finish: false }])
  })

  it('never prints 100% with cards to go, or 0% once begun', () => {
    expect(shownProgress(journey(deck(7325, 7329)))).toBe(0.99)
    expect(shownProgress(journey(deck(3, 10_000)))).toBe(0.001)
    expect(shownProgress(journey(deck(0, 100)))).toBe(0)
    expect(shownProgress(journey(deck(100, 100)))).toBe(1)
    expect(shownProgress(journey(deck(40, 100)))).toBe(0.4)
  })
})

describe('the road', () => {
  const points = [
    { x: 0, y: 28 },
    { x: 50, y: 72 },
    { x: 100, y: 28 },
  ]

  it('draws one bend for each leg', () => {
    expect(roadPath(points)).toBe('M0 28 C25 28 25 72 50 72 C75 72 75 28 100 28')
  })

  it('finds the height at each stop and halfway through a bend', () => {
    expect(pointOnRoad(points, 0).y).toBeCloseTo(28)
    expect(pointOnRoad(points, 50).y).toBeCloseTo(72)
    expect(pointOnRoad(points, 25).y).toBeCloseTo(50)
    expect(pointOnRoad(points, 100).y).toBeCloseTo(28)
  })

  it('stays between the two stops of a leg', () => {
    for (const x of [1, 10, 40, 60, 99]) {
      const { y } = pointOnRoad(points, x)
      expect(y).toBeGreaterThanOrEqual(28)
      expect(y).toBeLessThanOrEqual(72)
    }
  })

  it('stands still on a road with one stop', () => {
    expect(pointOnRoad([{ x: 50, y: 28 }], 50)).toEqual({ x: 50, y: 28 })
  })
})
