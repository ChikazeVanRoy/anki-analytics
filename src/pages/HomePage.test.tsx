// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
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
    const card = screen.getByText(/of 796 scheduled reviews/).closest('div.animate-rise') as HTMLElement
    expect(card.textContent).toContain('1 Again')
    expect(card.textContent).toContain('132 Hard')
    expect(card.textContent).toContain('663 Good or Easy')
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

describe('Home streak', () => {
  it('shows the current and best streak, with no weekly goal', () => {
    render(<HomePage data={withRetention([40, 38], [0, 0])} />)
    expect(screen.getByText(messages.home.streak.label).closest('div')?.textContent).toContain('1')
    expect(screen.getByText(messages.home.streak.best(1))).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/days this week/)
  })

  it('asks for a session when today has none yet', () => {
    const data = withRetention([40, 38], [0, 0])
    const yesterday = new Date(ankiToday(data))
    yesterday.setDate(yesterday.getDate() - 1)
    data.daily[0] = { ...data.daily[0], date: toDateKey(yesterday) }
    render(<HomePage data={data} />)
    expect(screen.getByText(messages.home.status.keep(1))).toBeTruthy()
  })
})

describe('Home Today plan', () => {
  it('shows what’s due from real data, and never for sample data', () => {
    render(<HomePage data={realShapedData()} />)
    expect(screen.getByRole('heading', { name: messages.home.today.title })).toBeTruthy()
    expect(screen.getByText(messages.home.today.dueLabel)).toBeTruthy()
    cleanup()
    render(<HomePage data={{ ...mockData }} />)
    expect(screen.queryByText(messages.home.today.dueLabel)).toBeNull()
    expect(screen.queryByText(messages.home.today.newLabel)).toBeNull()
  })

  it('counts today’s new cards from Anki’s limits, and adds them to the total time', () => {
    const data = realShapedData()
    render(<HomePage data={data} />)
    // Three decks with a limit of 20, and 5 already started today
    const tile = screen.getByText(messages.home.today.newLabel).closest('div') as HTMLElement
    expect(tile.textContent).toContain('55')
    expect(tile.textContent).not.toContain('≈')
    expect(screen.getByText(messages.home.today.timeLabel)).toBeTruthy()
  })

  it('asks for a refresh rather than guessing from a copy made on an earlier day', () => {
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString()
    render(<HomePage data={{ ...realShapedData(), generatedAt: old }} />)
    expect(screen.getByText(messages.home.today.stale)).toBeTruthy()
    expect(screen.queryByText(messages.home.today.timeLabel)).toBeNull()
  })
})

describe('Home decks', () => {
  it('keeps the garden inside each deck card', () => {
    render(<HomePage data={realShapedData()} />)
    const card = screen.getByRole('heading', { name: 'Language' }).closest('article') as HTMLElement
    expect(card.querySelector('[role="group"]')?.getAttribute('aria-label')).toMatch(/^Language: /)
  })

  it('labels a finish date as a projection', () => {
    render(<HomePage data={realShapedData()} />)
    const card = screen.getByRole('heading', { name: 'Language' }).closest('article') as HTMLElement
    expect(card.textContent).toContain(messages.badges.projection)
    expect(card.textContent).toMatch(/you’d start the last card around/)
  })

  it('gives no finish date for sample data', () => {
    render(<HomePage data={mockData} />)
    expect(document.body.textContent).not.toMatch(/start the last card/)
  })

  it('no longer repeats the navigation', () => {
    render(<HomePage data={realShapedData()} />)
    expect(screen.queryByRole('region', { name: 'Explore' })).toBeNull()
  })
})

describe('Home on a copy from an earlier day', () => {
  const dayAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d
  }
  const oldCopy = () => {
    const base = realShapedData()
    const daily = [5, 6, 7].map((n) => ({ ...base.daily[0], date: toDateKey(dayAgo(n)), reviews: 10 }))
    return { ...base, daily, dayStartHour: 0, generatedAt: dayAgo(5).toISOString() }
  }

  it('keeps the streak as of the copy, not broken by days the copy can’t see', () => {
    render(<HomePage data={oldCopy()} />)
    const card = screen.getByText(messages.home.streak.label).closest('div') as HTMLElement
    expect(card.textContent).toContain('3')
    expect(screen.getByText(/^As of /)).toBeTruthy()
    expect(screen.getByText(/^This copy is from .+, so the numbers below stop there\.$/)).toBeTruthy()
    expect(screen.queryByText(messages.home.status.start)).toBeNull()
  })

  it('doesn’t say nothing was reviewed today', () => {
    render(<HomePage data={oldCopy()} />)
    expect(screen.getByText(messages.home.kpi.todayStale)).toBeTruthy()
    expect(screen.queryByText('nothing yet today')).toBeNull()
  })

  it('ends Last 7 days on the copy’s day, so missing days aren’t counted as no study', () => {
    render(<HomePage data={oldCopy()} />)
    const card = screen.getByText(messages.home.kpi.week).closest('div.animate-rise') as HTMLElement
    expect(card.textContent).toContain('30')
  })

  it('ends the two-week chart on the copy’s day, and doesn’t call it today', () => {
    render(<HomePage data={oldCopy()} />)
    const chart = screen.getByRole('list', { name: /30 reviews on 3 of the last 14 days/ })
    expect(within(chart).queryByText(messages.home.recent.today)).toBeNull()
  })
})

describe('Home Today limits', () => {
  it('says when the review limit holds cards back', () => {
    const data = realShapedData()
    data.fsrs!.presets = data.fsrs!.presets.map((p) => ({ ...p, reviewsPerDay: 1 }))
    render(<HomePage data={data} />)
    expect(screen.getByText(/more held back by your review limit/)).toBeTruthy()
  })
})
