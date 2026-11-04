// Synthetic data shaped like the real API's answer, FSRS section included, for page and end-to-end tests.
// Everything is generated; nothing comes from a real collection.

import { mockData } from '../data/mockData'
import type { AnkiData, FsrsCard, FsrsData } from '../data/types'
import { toDateKey } from '../lib/dates'
import { DEFAULT_PARAMS } from '../lib/fsrs'

const dayOffset = (days: number) => toDateKey(new Date(Date.now() + days * 86_400_000))

function cards(): FsrsCard[] {
  return Array.from({ length: 60 }, (_, i) => ({
    deckId: i % 2 ? 'language' : 'science',
    stability: 2 + i,
    difficulty: 3 + (i % 6),
    lastReview: dayOffset(-(i % 9) - 1),
    due: dayOffset((i % 12) - 3),
    interval: 2 + i,
    state: 'review',
  }))
}

export function fsrsFixture(): FsrsData {
  const decks = ['language', 'science', 'other']
  return {
    enabled: true,
    version: 'FSRS-6',
    ankiVersion: null,
    windowDays: 180,
    presets: decks.map((deckId, i) => ({
      deckId,
      presetId: i + 1,
      presetName: 'Default',
      desiredRetention: 0.9,
      newPerDay: 20,
      reviewsPerDay: 200,
      maxInterval: 36_500,
      learnSteps: [1, 10],
      relearnSteps: [10],
      params: [...DEFAULT_PARAMS],
      paramsSource: 'default',
    })),
    cards: cards(),
    newCards: { language: 100, science: 80, other: 20 },
    newToday: { language: 5 },
    suspended: {},
    missingState: {},
    invalidDue: {},
    resetCards: 0,
    calibration: decks.map((deckId) => ({
      month: dayOffset(-3).slice(0, 7),
      deckId,
      reviews: 200,
      passed: 180,
      predicted: 178,
      matureReviews: 80,
      maturePassed: 74,
      maturePredicted: 72,
    })),
    calibrationBins: decks.map((deckId) => ({ deckId, from: 0.85, to: 0.9, reviews: 200, passed: 180, predicted: 175 })),
    behaviour: decks.map((deckId) => ({
      deckId,
      firstRating: [20, 10, 60, 10],
      passRating: [30, 150, 20],
      reviewAgain: 20,
      secondsPerReview: 12,
      answers: 400,
      learningReviewsPerNewCard: 2,
      newCardsIntroduced: 100,
    })),
    validation: { cards: 60, stabilityMatched: 60, difficultyMatched: 60 },
  }
}

export function realShapedData(): AnkiData {
  return { ...mockData, source: 'anki', generatedAt: new Date().toISOString(), fsrs: fsrsFixture() }
}
