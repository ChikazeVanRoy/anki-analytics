import { describe, expect, it } from 'vitest'
import { niceTicks, rowsMax } from './ticks'

describe('niceTicks', () => {
  it('picks round steps for fractions', () => {
    expect(niceTicks(0.22)).toEqual([0, 0.1, 0.2, 0.3])
    expect(niceTicks(0.18)).toEqual([0, 0.05, 0.1, 0.15, 0.2])
  })
  it('picks round steps for counts', () => {
    expect(niceTicks(380)).toEqual([0, 100, 200, 300, 400])
    expect(niceTicks(9)).toEqual([0, 5, 10])
  })
  it('covers the maximum exactly when it lands on a step', () => {
    expect(niceTicks(400)).toEqual([0, 100, 200, 300, 400])
  })
  it('still draws an axis with nothing to show', () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(Number.NaN)).toEqual([0, 1])
  })
})

describe('rowsMax', () => {
  it('looks at numbers and ranges, skipping labels', () => {
    expect(rowsMax([{ date: '2026-01-01', a: 3, band: [1, 7] }, { date: '2026-01-02', a: 5 }])).toBe(7)
  })
  it('can be limited to some keys', () => {
    expect(rowsMax([{ a: 3, b: 9 }], ['a'])).toBe(3)
  })
})

describe('niceTicks with a smallest step', () => {
  it('never steps below what the labels can show', () => {
    // Whole-percent labels: 0.5% steps would print 0% / 1% / 1% / 2%
    expect(niceTicks(0.015, 4, 0.01)).toEqual([0, 0.01, 0.02])
    expect(niceTicks(3, 4, 1)).toEqual([0, 1, 2, 3])
    expect(niceTicks(0, 4, 0.01)).toEqual([0, 1])
  })
})
