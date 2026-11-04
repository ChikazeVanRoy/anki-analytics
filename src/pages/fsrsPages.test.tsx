// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mockData } from '../data/mockData'
import { messages } from '../i18n'
import { ankiToday } from '../lib/stats'
import { realShapedData } from '../test/fsrsFixture'
import { AdvancedPage } from './AdvancedPage'
import { PlannerPage } from './PlannerPage'

const b = messages.badges

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('Worker', class { postMessage() {} terminate() {} })
})
afterEach(cleanup)

describe('Advanced source labels', () => {
  it('labels sample data as sample, never as measured', () => {
    render(<AdvancedPage data={mockData} today={ankiToday(mockData)} />)
    expect(screen.getByText(b.sample)).toBeTruthy()
    expect(screen.queryByText(b.measured)).toBeNull()
  })

  it('doesn’t call FSRS’s estimates measured on real data', () => {
    const data = realShapedData()
    render(<AdvancedPage data={data} today={ankiToday(data)} />)
    expect(screen.getAllByText(b.mixed).length).toBe(2)
    expect(screen.queryByText(b.measured)).toBeNull()
    expect(screen.getByText(/FSRS estimate, average across 60 cards/)).toBeTruthy()
  })
})

describe('Advanced verdict', () => {
  const v = messages.advanced.verdict
  const withCalibration = (reviews: number, passed: number, predicted: number) => {
    const data = realShapedData()
    data.fsrs!.calibration = [{ ...data.fsrs!.calibration[0], reviews, passed, predicted }]
    return data
  }

  it('leads with what to do when FSRS doesn’t fit', () => {
    const data = withCalibration(800, 790, 700)
    render(<AdvancedPage data={data} today={ankiToday(data)} />)
    expect(screen.getByRole('heading', { name: v.title.under })).toBeTruthy()
    expect(screen.getByText(v.action.default)).toBeTruthy()
    expect(screen.getByText(/You remembered 98\.8% of 800 scheduled reviews; FSRS expected 87\.5%/)).toBeTruthy()
    expect(screen.getByText(new RegExp(v.fewLapses(10)))).toBeTruthy()
  })

  it('doesn’t suggest optimising when FSRS already fits', () => {
    const data = realShapedData()
    render(<AdvancedPage data={data} today={ankiToday(data)} />)
    expect(screen.getByRole('heading', { name: v.title.fits })).toBeTruthy()
    expect(screen.queryByText(v.action.default)).toBeNull()
  })
})

describe('Planner source labels', () => {
  it('doesn’t promise real cards on sample data', () => {
    render(<PlannerPage data={mockData} today={ankiToday(mockData)} />)
    expect(screen.getByText(b.sample)).toBeTruthy()
    expect(screen.getByText(messages.planner.subtitleSample)).toBeTruthy()
    expect(screen.queryByText(b.projection)).toBeNull()
  })

  it('marks real forecasts as projections', async () => {
    const data = realShapedData()
    render(<PlannerPage data={data} today={ankiToday(data)} />)
    await waitFor(() => expect(screen.getAllByText(b.projection).length).toBeGreaterThan(0))
  })
})
