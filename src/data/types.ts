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
  /** Reviews of graduated cards (Anki revlog type "review"), and how many were not "Again". Basis for retention. */
  reviewCardReviews: number
  reviewCardPassed: number
  /** Subset of the above where the card's previous interval was 21+ days (mature). */
  matureReviews: number
  maturePassed: number
}

export interface AnkiData {
  source: 'mock' | 'anki'
  generatedAt: string
  /** Hour (local time) when Anki starts a new day, e.g. 4 = reviews before 4am count as yesterday. */
  dayStartHour: number
  decks: Deck[]
  daily: DailyDeckStat[]
}
