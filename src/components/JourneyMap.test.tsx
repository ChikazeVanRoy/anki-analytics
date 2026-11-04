// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Deck } from '../data/types'
import { messages } from '../i18n'
import { JourneyMap } from './JourneyMap'

const m = messages.home.journey
const deck = (started: number, totalCards: number) => ({ id: 'd', name: 'Language', youngCards: started, matureCards: 0, totalCards }) as Deck
const show = (d: Deck, finish: Parameters<typeof JourneyMap>[0]['trips'][0]['finish'] = null) => render(<JourneyMap trips={[{ deck: d, finish }]} sample={false} />)

afterEach(cleanup)

describe('JourneyMap', () => {
  it('shows the share of the deck started and the cards to go', () => {
    show(deck(40, 100))
    expect(screen.getByText(m.share('40%'))).toBeTruthy()
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(m.label('Language', 40, 100, 60))
  })

  it('numbers every stop, the last one with the size of the deck', () => {
    show(deck(40, 7329))
    expect(screen.getByRole('img').textContent).toBe('02,5005,0007,329')
  })

  it('tells a finished deck from an empty one', () => {
    show(deck(100, 100))
    expect(screen.getByText(m.finished)).toBeTruthy()
    expect(screen.queryByText(m.noCards)).toBeNull()
    cleanup()
    show(deck(0, 0))
    expect(screen.getByText(m.noCards)).toBeTruthy()
    expect(screen.queryByText(m.finished)).toBeNull()
  })

  it('says when there is too little to project a finish, and adds nothing once done', () => {
    show(deck(40, 100), { kind: 'thin' })
    expect(screen.getByText(m.finishThin)).toBeTruthy()
    cleanup()
    show(deck(100, 100), { kind: 'done' })
    expect(screen.queryByText(m.finishThin)).toBeNull()
  })
})
