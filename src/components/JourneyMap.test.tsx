// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Deck } from '../data/types'
import { messages } from '../i18n'
import { JourneyMap } from './JourneyMap'

const m = messages.home.journey
const cards = (remaining: number, limit: number, startedToday = 0) => ({ remaining, limit, startedToday })
const deck = (started: number, totalCards: number) => ({ id: 'd', name: 'Language', youngCards: started, matureCards: 0, totalCards }) as Deck
const TODAY = new Date(2026, 2, 1)
const show = (d: Deck, newCards: Parameters<typeof JourneyMap>[0]['trips'][0]['cards'] = null, studyDays = 7) =>
  render(<JourneyMap trips={[{ deck: d, cards: newCards }]} studyDays={studyDays} today={TODAY} sample={false} />)
const perDay = () => screen.getByLabelText(m.perDay) as HTMLInputElement

beforeEach(() => localStorage.clear())
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

  it('projects the finish from Anki’s daily limit', () => {
    show(deck(40, 340), cards(300, 20))
    expect(perDay().value).toBe('20')
    expect(screen.getByText(m.finish('15 Mar 2026'))).toBeTruthy() // today, then 14 days
    expect(screen.queryByRole('button', { name: m.useAnki(20) })).toBeNull()
  })

  it('counts rest days', () => {
    show(deck(40, 340), cards(300, 20), 3.5)
    expect(screen.getByText(m.finish('29 Mar 2026'))).toBeTruthy() // today, then 28 days
    cleanup()
    show(deck(40, 340), cards(300, 10), 3.5)
    expect(screen.getByText(m.finish('28 Apr 2026'))).toBeTruthy() // today, then 58 days
  })

  it('moves the finish with the number, keeps it for the deck, and can go back to Anki’s', () => {
    show(deck(40, 340), cards(300, 20))
    fireEvent.change(perDay(), { target: { value: '5' } })
    expect(screen.getByText(m.finish('29 Apr 2026'))).toBeTruthy() // today, then 59 days
    cleanup()
    show(deck(40, 340), cards(300, 20))
    expect(perDay().value).toBe('5')
    fireEvent.click(screen.getByRole('button', { name: m.useAnki(20) }))
    expect(perDay().value).toBe('20')
    cleanup()
    show(deck(40, 340), cards(300, 30))
    expect(perDay().value).toBe('30') // follows Anki again
  })

  it.each(['', '0', '-3', '1.5'])('gives no date for %j cards a day, and doesn’t remember it', (value) => {
    show(deck(40, 340), cards(300, 20))
    fireEvent.change(perDay(), { target: { value } })
    expect(screen.getByText(m.finishNeedsPace)).toBeTruthy()
    cleanup()
    show(deck(40, 340), cards(300, 20))
    expect(perDay().value).toBe('20')
  })

  it('asks for a number when Anki starts no new cards here, and keeps a typed 0', () => {
    show(deck(40, 340), cards(300, 0))
    expect(screen.getByText(m.finishNeedsPace)).toBeTruthy()
    fireEvent.change(perDay(), { target: { value: '0' } })
    expect(perDay().value).toBe('0')
  })

  it('offers no way back when the remembered number is already Anki’s', () => {
    localStorage.setItem('anki-analytics:new-per-day:d', '20')
    show(deck(40, 340), cards(300, 20))
    expect(screen.queryByRole('button', { name: m.useAnki(20) })).toBeNull()
  })

  it('announces the finish as it changes', () => {
    show(deck(40, 340), cards(300, 20))
    expect(screen.getByRole('status').textContent).toContain(m.finish('15 Mar 2026'))
    fireEvent.change(perDay(), { target: { value: '' } })
    expect(screen.getByRole('status').textContent).toBe(m.finishNeedsPace)
  })

  it('ignores an unusable remembered number', () => {
    localStorage.setItem('anki-analytics:new-per-day:d', 'lots')
    show(deck(40, 340), cards(300, 20))
    expect(perDay().value).toBe('20')
  })

  it('adds nothing once every card is started, or without real data', () => {
    show(deck(100, 100), cards(0, 20))
    expect(screen.queryByLabelText(m.perDay)).toBeNull()
    cleanup()
    show(deck(40, 100), null)
    expect(screen.queryByLabelText(m.perDay)).toBeNull()
  })
})
