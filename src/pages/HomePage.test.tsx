// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockData } from '../data/mockData'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { ankiToday, toDateKey } from '../lib/stats'
import { realShapedData } from '../test/fsrsFixture'
import { HomePage } from './HomePage'

afterEach(cleanup)

function withRetention(rc: [number, number], mature: [number, number], hard = 0): AnkiData {
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
        reviewCardHard: hard,
        matureReviews: mature[0],
        maturePassed: mature[1],
      },
    ],
  }
}

describe('Home "Remembered" card', () => {
  it('shows 99.9% for 795 of 796, with the Again and Hard counts behind it', () => {
    render(<HomePage data={withRetention([796, 795], [1, 1], 132)} />)
    expect(screen.getAllByText('99.9%').length).toBeGreaterThan(0)
    expect(screen.getByText(/of 796 scheduled reviews/)).toBeTruthy()
    expect(screen.getByText('1 Again · 132 Hard (counted as remembered)')).toBeTruthy()
    expect(screen.getByText('Only 1 from cards known well')).toBeTruthy()
  })

  it('doesn’t blame young cards for a high figure, and says Hard counts as remembered', () => {
    expect(messages.home.kpi.rememberedTip).toMatch(/Hard counts as remembered/)
    expect(messages.home.kpi.rememberedTip).not.toMatch(/normal/)
  })

  it('says so plainly when no reviews were of cards known well', () => {
    render(<HomePage data={withRetention([40, 40], [0, 0])} />)
    expect(screen.getByText('None from cards known well yet')).toBeTruthy()
  })

  it('shows the young / mature split when there are enough mature reviews', () => {
    render(<HomePage data={withRetention([200, 180], [100, 95])} />)
    expect(screen.getByText(/learning 85(\.\d)?% · known well 95(\.\d)?%/)).toBeTruthy()
  })

  it('shows a dash and an explanation with no scheduled reviews', () => {
    render(<HomePage data={withRetention([0, 0], [0, 0])} />)
    expect(screen.getByText(messages.home.kpi.rememberedNone)).toBeTruthy()
  })
})

describe('Home "Remembered" tip', () => {
  const advancedLine = messages.home.kpi.rememberedTipAdvanced

  it('only points to Advanced when Advanced has something to show', () => {
    render(<HomePage data={withRetention([40, 40], [0, 0])} />)
    expect(document.body.textContent).not.toContain(advancedLine)
    cleanup()
    render(<HomePage data={realShapedData()} />)
    expect(document.body.textContent).toContain(advancedLine)
  })
})

describe('Home hero', () => {
  it('shows when the data was copied, but not for sample data', () => {
    render(<HomePage data={{ ...withRetention([1, 1], [0, 0]), source: 'anki' }} />)
    expect(screen.getByText(/Copied from Anki/)).toBeTruthy()
    cleanup()
    render(<HomePage data={{ ...withRetention([1, 1], [0, 0]), source: 'mock' }} />)
    expect(screen.queryByText(/Copied from Anki/)).toBeNull()
  })
})

describe('Home insight', () => {
  it('links to the section behind it', () => {
    render(<HomePage data={withRetention([40, 38], [0, 0])} />)
    expect(screen.getByRole('link', { name: messages.home.insight.more }).getAttribute('href')).toBe('#/activity')
  })
})

describe('Home deck cards', () => {
  it('say when a deck’s Remembered rate is mostly young cards', () => {
    render(<HomePage data={withRetention([796, 795], [1, 1])} />)
    expect(screen.getAllByText(messages.home.decks.rememberedYoung).length).toBeGreaterThan(0)
  })
})

describe('Home "Remembered" card with only mature reviews', () => {
  it('shows a dash, not 0%, for the young rate', () => {
    render(<HomePage data={withRetention([40, 38], [40, 38])} />)
    expect(screen.getByText(/learning — · known well 95(\.\d)?%/)).toBeTruthy()
  })
})
