import { describe, expect, it } from 'vitest'
import { defaultBudget, planPresets, planSettings, standardSweep, type SweepPoint } from './plan'
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
      { key: 'relaxed', minutes: 18, newPerDay: 5 },
      { key: 'steady', minutes: 30, newPerDay: 20 },
      { key: 'push', minutes: 45, newPerDay: 30 },
    ])
  })

  it('gives no new cards when existing reviews already exceed a share of the budget', () => {
    expect(planPresets(sweep, 10, 60)[0].newPerDay).toBe(0)
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
