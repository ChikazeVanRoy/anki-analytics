// Deck colours for the data being rendered, so a chart never depends on state set somewhere else.
import { createContext, useContext } from 'react'
import { deckOtherColor } from '../lib/theme'

/** Provided by App from the loaded decks (see deckColorMap in src/lib/theme.ts). */
export const DeckColors = createContext<Map<string, string>>(new Map())

/** Returns deck id -> CSS colour; unknown ids ("Other decks") get the neutral colour. */
export function useDeckColor() {
  const colors = useContext(DeckColors)
  return (deckId: string) => colors.get(deckId) ?? deckOtherColor
}
