// The data contract shared by the mock data and (later) the local API.
// Keeping one shape means swapping mock -> real data touches a single line.

export interface Deck {
  id: string
  name: string
  totalCards: number
  newCards: number
  youngCards: number // interval < 21 days
  matureCards: number // interval >= 21 days
}

/** Review totals for one deck on one calendar day. */
export interface DailyDeckStat {
  date: string // local date, YYYY-MM-DD
  deckId: string
  reviews: number
  again: number // reviews answered "Again"
  studySeconds: number
}

export interface AnkiData {
  source: 'mock' | 'anki'
  generatedAt: string
  /** Hour (local time) when Anki starts a new day, e.g. 4 = reviews before 4am count as yesterday. */
  dayStartHour: number
  decks: Deck[]
  daily: DailyDeckStat[]
}
