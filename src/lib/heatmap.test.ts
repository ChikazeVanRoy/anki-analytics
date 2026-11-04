import { describe, expect, it } from 'vitest'
import { buildWeeks, level, replayStarts, revealedAt, runningTotals, lastWeekPage, thresholds, weeksThatFit, weekWindow } from './heatmap'

const reviews = new Map([['2026-03-15', { reviews: 7 }]])
const today = new Date(2026, 2, 15, 12) // Sunday

describe('weeksThatFit', () => {
  it('fits the columns beside the weekday labels', () => {
    expect(weeksThatFit(301, 15, 3, 32)).toBe(18)
    expect(weeksThatFit(1100, 15, 3, 32)).toBe(71)
  })
  it('keeps a usable minimum', () => {
    expect(weeksThatFit(50, 15, 3, 32)).toBe(8)
  })
})

describe('weekWindow', () => {
  const weeks = Array.from({ length: 53 }, (_, i) => i)
  it('shows everything when it all fits', () => {
    expect(weekWindow(weeks, 60, 0)).toEqual({ weeks, older: false, newer: false })
  })
  it('shows everything before the width is known', () => {
    expect(weekWindow(weeks, Infinity, 0)).toEqual({ weeks, older: false, newer: false })
  })
  it('knows the oldest page', () => {
    expect(lastWeekPage(53, 18)).toBe(2)
    expect(lastWeekPage(36, 18)).toBe(1)
    expect(lastWeekPage(10, 18)).toBe(0)
  })
  it('starts on the newest weeks', () => {
    const w = weekWindow(weeks, 18, 0)
    expect(w.weeks[17]).toBe(52)
    expect(w).toMatchObject({ older: true, newer: false })
  })
  it('pages back to the start, without running past it', () => {
    expect(weekWindow(weeks, 18, 1).weeks[0]).toBe(17)
    const last = weekWindow(weeks, 18, 2)
    expect(last.weeks).toEqual(weeks.slice(0, 18))
    expect(last).toMatchObject({ older: false, newer: true })
    expect(weekWindow(weeks, 18, 9).weeks).toEqual(weeks.slice(0, 18))
  })
})

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

describe('runningTotals', () => {
  it('adds up reviews day by day, ending at the period total', () => {
    const cells = [3, 0, 5, 2].map((reviews, i) => ({ date: `2026-03-0${i + 1}`, reviews }))
    expect(runningTotals(cells)).toEqual([3, 3, 8, 10])
    expect(runningTotals([])).toEqual([])
  })
})

describe('replay pacing', () => {
  const cells = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 6].map((reviews, i) => ({ date: `d${i}`, reviews }))

  it('gives active days a full beat and empty days a tenth of one', () => {
    const starts = replayStarts(cells)
    // 10 empty days (1 beat in all) + 2 active days = 3 beats: the first active day starts a third of the way in
    expect(starts[0]).toBe(0)
    expect(starts[10]).toBeCloseTo(1 / 3)
    expect(starts[11]).toBeCloseTo(2 / 3)
  })

  it('reveals days as the replay progresses, and all of them at the end', () => {
    const starts = replayStarts(cells)
    expect(revealedAt(starts, 0)).toBe(1)
    expect(revealedAt(starts, 0.5)).toBe(11)
    expect(revealedAt(starts, 1)).toBe(12)
    expect(revealedAt(replayStarts([]), 0.5)).toBe(0)
  })
})
