// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockData } from '../data/mockData'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { ankiToday, toDateKey } from '../lib/stats'
import { HomePage } from './HomePage'

afterEach(cleanup)

function withRetention(rc: [number, number], mature: [number, number]): AnkiData {
  const base = { ...mockData, daily: [] as AnkiData['daily'] }
  const today = ankiToday(base)
  return {
    ...base,
    daily: [
      {
        date: toDateKey(today),
        deckId: base.decks[0].id,
        reviews: rc[0],
        again: rc[0] - rc[1],
        studySeconds: 60,
        reviewCardReviews: rc[0],
        reviewCardPassed: rc[1],
        matureReviews: mature[0],
        maturePassed: mature[1],
      },
    ],
  }
}

describe('Home "Remembered" card', () => {
  it('shows 99.9% for 795 of 796 and says it is almost all young cards', () => {
    render(<HomePage data={withRetention([796, 795], [1, 1])} />)
    expect(screen.getAllByText('99.9%').length).toBeGreaterThan(0)
    expect(screen.getByText(/of 796 reviews of learned cards/)).toBeTruthy()
    expect(screen.getByText(/Almost all young cards \(1 mature\)/)).toBeTruthy()
  })

  it('shows the young / mature split when there are enough mature reviews', () => {
    render(<HomePage data={withRetention([200, 180], [100, 95])} />)
    expect(screen.getByText(/young 85(\.\d)?% · mature 95(\.\d)?%/)).toBeTruthy()
  })

  it('shows a dash and an explanation with no reviews of learned cards', () => {
    render(<HomePage data={withRetention([0, 0], [0, 0])} />)
    expect(screen.getByText(messages.home.kpi.rememberedNone)).toBeTruthy()
  })
})

describe('Home deck cards', () => {
  it('say when a deck’s Remembered rate is mostly young cards', () => {
    render(<HomePage data={withRetention([796, 795], [1, 1])} />)
    expect(screen.getAllByText(messages.home.decks.rememberedYoung).length).toBeGreaterThan(0)
  })
})
