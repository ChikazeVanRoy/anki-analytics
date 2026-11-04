// The data contract shared by the mock data and (later) the local API.
// Keeping one shape means swapping mock -> real data touches a single line.

export interface Deck {
  id: string
  name: string
  /** Colour slot (1-3), fixed per deck by the server. Absent: "Other decks", drawn in a neutral colour. */
  color?: number
  totalCards: number // new + young + mature; suspended cards are counted separately
  newCards: number
  youngCards: number // interval < 21 days
  matureCards: number // interval >= 21 days
  suspendedCards: number
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
  /** Of the passes above, how many were "Hard". Anki counts Hard as remembered, so the UI shows this beside the rate. */
  reviewCardHard: number
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
  /** FSRS memory states, presets and replayed history. Absent for mock data. */
  fsrs?: FsrsData
  /** Why FSRS data couldn't be read, when the rest of the collection could. */
  fsrsError?: string
}

// ---------- FSRS (only present for real Anki data) ----------

/** One studied card's current FSRS memory state, exactly as Anki stored it. */
export interface FsrsCard {
  deckId: string
  stability: number // days
  difficulty: number // 1-10
  lastReview: string // Anki day (YYYY-MM-DD) of the last review
  due: string // Anki day the card is next due
  interval: number // current scheduled interval in days
  state: 'review' | 'learning' | 'relearning'
  /** Index into FsrsData.cardPresets: the preset of the card's home deck. Absent: use the group's preset. */
  preset?: number
  /** Buried (by the user or sibling burying): Anki won't show it until the next day. Absent: not buried. */
  buried?: boolean
  /** In a learning step of a day or more. Unlike same-day steps, these count towards the review limit. */
  interday?: boolean
}

/** Scheduler settings of the preset a deck group uses (the one most of its cards use). */
export interface DeckPreset {
  deckId: string
  presetId?: number // Anki's preset id
  presetName: string
  desiredRetention: number
  newPerDay: number
  reviewsPerDay: number
  maxInterval: number
  learnSteps: number[] // minutes
  relearnSteps: number[] // minutes
  params: number[] // FSRS-6 weights (21)
  paramsSource: 'optimised' | 'default'
}

/**
 * Memory-model settings of a preset that studied cards use. A deck group can mix presets across its
 * subdecks; each card is replayed, scored and simulated with its own preset's values.
 */
export interface CardPreset {
  presetId: number
  presetName: string
  params: number[] // FSRS-6 weights (21)
  paramsSource: 'optimised' | 'default'
  desiredRetention: number
  maxInterval: number
}

/** Historical review-card reviews per month, with FSRS's prediction replayed from the review log. */
export interface CalibrationPoint {
  month: string // YYYY-MM
  deckId: string
  reviews: number
  passed: number
  predicted: number // sum of predicted recall probabilities
  matureReviews: number
  maturePassed: number
  maturePredicted: number
}

/** The same replayed reviews per day, so a change in how you answer can be dated. */
export interface CalibrationDay {
  date: string // Anki day, YYYY-MM-DD
  deckId: string
  reviews: number
  passed: number
  predicted: number // sum of predicted recall probabilities
}

/** What a deck's studied cards were worth on one past day, replayed from the review log. */
export interface KnowledgePoint {
  date: string // Anki day, YYYY-MM-DD
  deckId: string
  started: number // cards first studied by this day
  recalled: number // sum of their recall probabilities that day: how many you'd expect to remember
}

/** A card you've kept struggling with lately. Its text comes from your collection and stays on this computer. */
export interface TroubleCard {
  cardId: string // Anki card id, for a Browser search
  deckId: string
  front: string // the note's sort field, as plain text
  again: number // scheduled reviews answered Again, in the window
  hard: number // scheduled reviews answered Hard, in the window
  reviews: number // all scheduled reviews in the window
}

/** Predicted-vs-actual recall, grouped by predicted probability. */
export interface CalibrationBin {
  deckId: string
  from: number // predicted R bin start, e.g. 0.85
  to: number
  reviews: number
  passed: number
  predicted: number
}

/** Answer patterns measured from your review log, used by the simulator. */
export interface DeckBehaviour {
  deckId: string
  firstRating: [number, number, number, number] // counts of Again/Hard/Good/Easy on a new card's first answer
  passRating: [number, number, number] // counts of Hard/Good/Easy on passed review-card reviews
  reviewAgain: number // Again presses on review cards
  secondsPerReview: number // mean answer time (each answer capped at 60 s), all review types
  answers: number // answers counted in secondsPerReview (for weighting across decks)
  learningReviewsPerNewCard: number // measured same-day learning answers per introduced card
  newCardsIntroduced: number // cards first studied in the measurement window
}

export interface FsrsData {
  enabled: boolean
  version: 'FSRS-6'
  ankiVersion: string | null // read from the installed Anki app, if found
  windowDays: number // measurement window for DeckBehaviour
  presets: DeckPreset[]
  cards: FsrsCard[]
  /** Presets referenced by FsrsCard.preset. */
  cardPresets?: CardPreset[]
  newCards: Record<string, number> // unsuspended new cards available per deck group
  /** New cards in `newCards` that are buried, so Anki won't show them today. */
  buriedNew?: Record<string, number>
  /** Cards first studied today, per deck group. Counts against the daily new-card limit. */
  newToday?: Record<string, number>
  /** Review-card answers today, per deck group. Counts against the daily review limit. */
  reviewsToday?: Record<string, number>
  /** Anki's "New cards ignore review limit" option. Off, new cards stop once the review limit is used up. */
  newCardsIgnoreReviewLimit?: boolean
  suspended: Record<string, number>
  /** Cards with a 21+ day interval now that have also passed a review at that interval, per deck group. */
  proven?: Record<string, number>
  missingState: Record<string, number> // studied cards without an FSRS memory state (excluded everywhere)
  invalidDue: Record<string, number> // studied cards with a memory state but an unreadable due date (excluded)
  resetCards: number // cards whose history was cut by a "Forget" reset (Anki ignores reviews before it)
  /**
   * Cards whose kept history doesn't start with a learning answer (e.g. imported, or the log was trimmed).
   * Anki seeds their memory state from SM-2 values, so their past predictions are not replayed and they
   * are left out of calibration (and so of the measured lapse rate).
   */
  incompleteHistory?: number
  calibration: CalibrationPoint[]
  calibrationDaily?: CalibrationDay[]
  knowledge?: KnowledgePoint[]
  /** Cards with the most Again and Hard answers on scheduled reviews lately, worst first. */
  troubleCards?: TroubleCard[]
  troubleWindowDays?: number
  calibrationBins: CalibrationBin[]
  behaviour: DeckBehaviour[]
  /** How closely replaying the review log through our FSRS code reproduces Anki's stored states. */
  validation: { cards: number; stabilityMatched: number; difficultyMatched: number }
}
