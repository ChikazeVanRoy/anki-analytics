// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mockData } from '../data/mockData'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { ankiToday, toDateKey } from '../lib/stats'
import { ActivityPage } from './ActivityPage'

const m = messages.activity

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(cleanup)

function data(mature: [number, number]): AnkiData {
  const base = { ...mockData, source: 'anki' as const, daily: [] as AnkiData['daily'] }
  return {
    ...base,
    daily: [
      {
        date: toDateKey(ankiToday(base)),
        deckId: base.decks[0].id,
        reviews: 1000,
        again: 72,
        studySeconds: 600,
        reviewCardReviews: 400,
        reviewCardPassed: 399,
        reviewCardHard: 70,
        matureReviews: mature[0],
        maturePassed: mature[1],
      },
    ],
  }
}

const show = (d: AnkiData) => render(<ActivityPage data={d} range="30d" onRangeChange={() => {}} />)

describe('Activity headline cards', () => {
  it('labels Forgot and Remembered by the reviews each one covers', () => {
    show(data([100, 95]))
    expect(screen.getAllByText(m.forgot).length).toBeGreaterThan(0)
    expect(screen.getByText(m.remembered)).toBeTruthy()
    expect(m.forgotTip).toMatch(/isn’t the opposite of Remembered/)
  })

  it('shows the Again and Hard counts behind Remembered', () => {
    show(data([100, 95]))
    expect(screen.getByText(/of 400 reviews · 1 Again · 70 Hard/)).toBeTruthy()
  })

  it('doesn’t rate cards known well from a thin sample', () => {
    show(data([1, 1]))
    expect(screen.getByText(m.rememberedThin)).toBeTruthy()
    expect(screen.queryByText(/cards known well 100/)).toBeNull()
  })

  it('gives a short message, not a row of zeros, with no scheduled reviews', () => {
    const d = data([0, 0])
    d.daily[0] = { ...d.daily[0], reviewCardReviews: 0, reviewCardPassed: 0, reviewCardHard: 0 }
    show(d)
    expect(screen.getByText(m.rememberedNone)).toBeTruthy()
    expect(screen.queryByText(/of 0 reviews/)).toBeNull()
  })

  it('rates cards known well once there are enough reviews', () => {
    show(data([100, 95]))
    expect(screen.getByText(/cards known well 95\.0%/)).toBeTruthy()
  })

  it('says "no change" rather than an arrow when nothing moved', () => {
    const d = data([100, 95])
    const today = ankiToday(d)
    const earlier = new Date(today)
    earlier.setDate(earlier.getDate() - 30)
    d.daily = [{ ...d.daily[0], date: toDateKey(earlier) }, ...d.daily]
    show(d)
    const card = screen.getAllByText(m.forgot)[0].closest('div.animate-rise') as HTMLElement
    expect(within(card).getByText(m.noChange).className).toContain('bg-good-soft')
  })
})
