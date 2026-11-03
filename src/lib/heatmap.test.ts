import { describe, expect, it } from 'vitest'
import { buildWeeks, level, thresholds } from './heatmap'

const reviews = new Map([['2026-03-15', { reviews: 7 }]])
const today = new Date(2026, 2, 15, 12) // Sunday

describe('buildWeeks', () => {
  it('shows the last 12 months as Monday-first columns ending with today', () => {
    const weeks = buildWeeks(reviews, 'last12', today)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    const cells = weeks.flat().filter((c) => c !== null)
    expect(cells).toHaveLength(365)
    expect(cells.at(-1)).toEqual({ date: '2026-03-15', reviews: 7 })
    expect(weeks.at(-1)![6]?.date).toBe('2026-03-15') // Sunday is the last row
  })

  it('shows a full past calendar year, with days outside it as null', () => {
    const weeks = buildWeeks(reviews, 2025, today)
    const cells = weeks.flat().filter((c) => c !== null)
    expect(cells).toHaveLength(365)
    expect(cells[0]!.date).toBe('2025-01-01')
    expect(cells.at(-1)!.date).toBe('2025-12-31')
    expect(weeks[0][0]).toBeNull() // 1 Jan 2025 was a Wednesday, so Mon/Tue are padding
  })

  it('stops the current year at today', () => {
    const cells = buildWeeks(reviews, 2026, today).flat().filter((c) => c !== null)
    expect(cells.at(-1)!.date).toBe('2026-03-15')
  })
})

describe('colour levels', () => {
  it('uses quartiles of active days, with 0 reserved for no reviews', () => {
    const t = thresholds([0, 10, 20, 30, 40])
    expect(t).toEqual([10, 20, 30])
    expect([0, 5, 15, 25, 99].map((n) => level(n, t))).toEqual([0, 1, 2, 3, 4])
  })
})
