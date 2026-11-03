import { describe, expect, it } from 'vitest'
import type { Deck } from '../data/types'
import { deckColorMap, deckOtherColor } from './theme'

const deck = (id: string, color?: number): Deck => ({ id, name: id, color, totalCards: 1, newCards: 0, youngCards: 1, matureCards: 0, suspendedCards: 0 })

describe('deckColorMap', () => {
  it('maps each deck to its colour slot, and decks without one to the neutral colour', () => {
    const colors = deckColorMap([deck('medicine', 2), deck('law', 1), deck('other')])
    expect(colors.get('medicine')).toBe('var(--color-deck-2)')
    expect(colors.get('law')).toBe('var(--color-deck-1)')
    expect(colors.get('other')).toBe(deckOtherColor)
  })
})
