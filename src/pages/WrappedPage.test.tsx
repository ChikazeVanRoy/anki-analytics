// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockData } from '../data/mockData'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { WrappedPage } from './WrappedPage'

const m = messages.wrapped
afterEach(cleanup)

const data = {
  ...mockData,
  daily: [
    { ...mockData.daily[0], date: '2026-02-10', reviews: 40, studySeconds: 600 },
    { ...mockData.daily[0], date: '2026-03-02', reviews: 80, studySeconds: 1200 },
  ],
} as AnkiData

describe('WrappedPage', () => {
  it('opens on the latest month and can show another', () => {
    render(<WrappedPage data={data} />)
    expect(screen.getAllByText('80').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2026-02' } })
    expect(screen.getAllByText('40').length).toBeGreaterThan(0)
  })

  it('labels sample data, and says so when there’s nothing to show', () => {
    render(<WrappedPage data={{ ...data, daily: [] }} />)
    expect(screen.getByText(m.empty)).toBeTruthy()
    expect(screen.getByText(messages.badges.sample)).toBeTruthy()
  })
})
