import { describe, expect, it } from 'vitest'
import { deckLimits, defaultBudget, goalPlan, limitRange, minutesAt, pilesUpAt, planPresets, planSettings, standardSweep, type SweepPoint } from './plan'
import type { HorizonSummary } from './simulator'

const year = (maxWindowPerStudyDay: number, backlogEnd = 0) => ({ maxWindowPerStudyDay, backlogEnd }) as HorizonSummary
// Reviews per study day in the heaviest month; at 60 s per review, reviews are minutes
const sweep: SweepPoint[] = [
  { value: 0, year: year(10) },
  { value: 10, year: year(20) },
  { value: 20, year: year(30) },
  { value: 30, year: year(40) },
  { value: 40, year: year(50, 5) },
]

describe('defaultBudget', () => {
  it('rounds measured minutes up to 5, with a floor of 10', () => {
    const at = (minutesPerStudyDay: number) => defaultBudget({ minutesPerStudyDay, secondsPerReview: 10, studyDaysPerWeek: 5 })
    expect(at(26)).toBe(30)
    expect(at(30)).toBe(30)
    expect(at(2)).toBe(10)
  })
})

describe('planSettings', () => {
  it('uses one fixed seed, so Home and the Planner simulate the same futures', () => {
    expect(planSettings(['a'], 5, 2).seed).toBe(planSettings(['b'], 3, 0).seed)
  })
})

describe('planPresets', () => {
  it('fits each preset to its share of the budget', () => {
    expect(planPresets(sweep, 30, 60)).toEqual([
      { key: 'relaxed', minutes: 18, newPerDay: 5, fits: true },
      { key: 'steady', minutes: 30, newPerDay: 20, fits: true },
      { key: 'push', minutes: 45, newPerDay: 30, fits: true },
    ])
  })

  it('gives no new cards when existing reviews already exceed a share of the budget', () => {
    expect(planPresets(sweep, 10, 60)[0]).toMatchObject({ newPerDay: 0, fits: false })
  })

  it('never picks a scenario that leaves a backlog', () => {
    expect(planPresets(sweep, 100, 60)[2].newPerDay).toBeLessThan(40)
  })
})

describe('standardSweep', () => {
  it('leaves out the value selected right now, so answers don’t move with the selection', () => {
    const at = (value: number) => ({ value, byHorizon: { 365: year(value) } })
    expect(standardSweep([at(10), at(15), at(20)]).map((p) => p.value)).toEqual([10, 20])
  })
})

describe('minutesAt', () => {
  it('reads a simulated value exactly and interpolates between them', () => {
    expect(minutesAt(sweep, 20, 60)).toBe(30)
    expect(minutesAt(sweep, 25, 60)).toBe(35)
    expect(minutesAt(sweep, 0, 60)).toBe(10)
  })

  it('carries the line on past the last scenario', () => {
    expect(minutesAt(sweep, 50, 60)).toBe(60)
  })

  it('converts reviews with the seconds per review', () => expect(minutesAt(sweep, 20, 30)).toBe(15))

  it('has no answer without scenarios', () => expect(minutesAt([], 20, 60)).toBeNull())
})

describe('deckLimits', () => {
  it('splits evenly, and gives what a nearly finished deck can’t use to the others', () => {
    expect(
      deckLimits(10, [
        { deckId: 'a', pool: 1000, current: 15 },
        { deckId: 'b', pool: 2, current: 30 },
      ]),
    ).toEqual([
      { deckId: 'a', newPerDay: 8, current: 15 },
      { deckId: 'b', newPerDay: 2, current: 30 },
    ])
  })
})

describe('goalPlan', () => {
  const goal = { target: 1000, started: 300, available: 5000, date: '2026-03-31', today: '2026-03-01', studyDaysPerWeek: 7 }

  it('divides the cards to go by the study days left, rounding up', () => {
    expect(goalPlan(goal)).toEqual({ kind: 'ok', cardsToGo: 700, perStudyDay: 24 })
  })

  it('counts only study days', () => {
    expect(goalPlan({ ...goal, studyDaysPerWeek: 3.5 })).toMatchObject({ perStudyDay: 47 })
  })

  it('says when the goal can’t be planned', () => {
    expect(goalPlan({ ...goal, target: 200 })).toEqual({ kind: 'reached' })
    expect(goalPlan({ ...goal, target: 9000 })).toEqual({ kind: 'too-many', available: 5000 })
    expect(goalPlan({ ...goal, date: '2026-03-01' })).toEqual({ kind: 'date-passed' })
  })
})

describe('limitRange', () => {
  it('orders the two answers, and has no range when they agree', () => {
    expect(limitRange({ value: 10 }, { value: 5 })).toEqual([5, 10])
    expect(limitRange({ value: 10 }, { value: 10 })).toBeNull()
  })
  it('keeps a range when the other model leaves no room', () => {
    expect(limitRange({ value: 10 }, { value: 0 })).toEqual([0, 10])
    expect(limitRange({ value: 10 }, null)).toEqual([0, 10])
  })
  it('has no range without a second answer', () => expect(limitRange({ value: 10 }, undefined)).toBeNull())
})

describe('pilesUpAt', () => {
  it('holds from the first scenario with a backlog upwards', () => {
    expect(pilesUpAt(sweep, 39)).toBe(false)
    expect(pilesUpAt(sweep, 40)).toBe(true)
    expect(pilesUpAt(sweep, 60)).toBe(true)
  })
})
