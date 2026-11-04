// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../i18n'
import type { SweepPoint } from '../lib/plan'
import type { HorizonSummary } from '../lib/simulator'
import { GoalPlanner } from './GoalPlanner'

const m = messages.planner.goal
const point = (value: number, reviews: number): SweepPoint => ({ value, year: { maxWindowPerStudyDay: reviews, backlogEnd: 0 } as HorizonSummary })

const show = (onUse = vi.fn(), selection = 'all') => {
  render(
    <GoalPlanner
      selection={selection}
      started={300}
      available={5000}
      todayKey="2026-03-01"
      studyDaysPerWeek={7}
      sweep={[point(0, 10), point(100, 110)]}
      secondsPerReview={60}
      budget={30}
      onUse={onUse}
    />,
  )
  return onUse
}
const target = () => screen.getByLabelText(new RegExp(m.target))
const date = () => screen.getByLabelText(m.date)

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('GoalPlanner', () => {
  it('keeps a separate goal for each deck selection', () => {
    show()
    fireEvent.change(target(), { target: { value: '1200' } })
    cleanup()
    show(vi.fn(), 'science')
    expect((target() as HTMLInputElement).value).toBe('1000')
  })

  it('ignores a stored goal it can’t use', () => {
    localStorage.setItem('anki-analytics:goal:all', JSON.stringify({ target: 'lots', date: 'soon' }))
    show()
    expect((target() as HTMLInputElement).value).toBe('1000')
    expect((date() as HTMLInputElement).value).toBe('2027-03-01')
  })

  it('works out the pace and what it costs, and hands it to the plan', () => {
    const onUse = show()
    fireEvent.change(target(), { target: { value: '1000' } })
    fireEvent.change(date(), { target: { value: '2026-03-31' } })
    expect(screen.getByText(m.needs(24))).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(m.peak(34, 30, false))
    fireEvent.click(screen.getByRole('button', { name: m.use }))
    expect(onUse).toHaveBeenCalledWith(24)
  })

  it('says when a goal can’t be planned', () => {
    show()
    fireEvent.change(target(), { target: { value: '200' } })
    expect(screen.getByText(m.reached)).toBeTruthy()
    fireEvent.change(target(), { target: { value: '9000' } })
    expect(screen.getByText(m.tooMany(5000))).toBeTruthy()
  })

  it('says nothing while the number is being typed', () => {
    show()
    fireEvent.change(target(), { target: { value: '' } })
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('remembers the goal between visits', () => {
    show()
    fireEvent.change(target(), { target: { value: '1200' } })
    cleanup()
    show()
    expect((target() as HTMLInputElement).value).toBe('1200')
  })
})
