// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { messages } from '../i18n'
import { ActivityHeatmap } from './ActivityHeatmap'

afterEach(cleanup)

const today = new Date(2026, 10, 4)
const byDate = new Map([['2026-11-03', { reviews: 1, again: 0, seconds: 10 }]])
const text = messages.activity.calendar

describe('ActivityHeatmap', () => {
  it('shows a day’s tooltip outside the panel, whose animation would otherwise misplace it', () => {
    const { container } = render(<ActivityHeatmap byDate={byDate} today={today} years={[2026]} />)
    fireEvent.mouseEnter(screen.getByRole('gridcell', { name: /3 Nov 2026/ }))
    const tip = screen.getByText(text.tip(1)).parentElement as HTMLElement
    expect(tip.parentElement).toBe(document.body)
    expect(container.contains(tip)).toBe(false)
  })

  it('says one review, not one reviews', () => {
    expect(text.tip(1)).toBe('1 review')
    expect(text.tip(1_200)).toBe('1,200 reviews')
    expect(text.summary(1, 'in 2026', 1)).toBe('1 review in 2026 · 1 active day')
    expect(text.cell('Tue, 3 Nov 2026', 1)).toBe('Tue, 3 Nov 2026: 1 review')
  })
})
