// MOCK DATA - generated, not read from Anki. Deck names are made up and don't reflect anyone's collection.
// A seeded random generator keeps the numbers stable between reloads,
// and dates are relative to today so the dashboard always looks current.

import { toDateKey } from '../lib/dates'
import type { AnkiData, DailyDeckStat, Deck } from './types'

function seededRandom(seed: number) {
  // mulberry32: tiny, fast, deterministic PRNG
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const decks: Deck[] = [
  { id: 'language', name: 'Language', color: 1, totalCards: 3240, newCards: 820, youngCards: 960, matureCards: 1460, suspendedCards: 35 },
  { id: 'science', name: 'Science', color: 2, totalCards: 2110, newCards: 410, youngCards: 640, matureCards: 1060, suspendedCards: 0 },
  { id: 'other', name: 'Other decks', totalCards: 640, newCards: 150, youngCards: 190, matureCards: 300, suspendedCards: 12 },
]

// Per-deck behaviour: daily review volume and Again rate at the start/end of the year.
const profiles: Record<string, { base: [number, number]; again: [number, number]; secPerReview: number; skip: number }> = {
  language: { base: [70, 95], again: [0.17, 0.12], secPerReview: 9, skip: 0.08 },
  science: { base: [20, 55], again: [0.12, 0.09], secPerReview: 7, skip: 0.14 },
  other: { base: [12, 10], again: [0.1, 0.1], secPerReview: 6, skip: 0.45 },
}

function generate(days = 730): AnkiData {
  const rand = seededRandom(2026)
  const today = new Date()
  const daily: DailyDeckStat[] = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const progress = 1 - i / (days - 1) // 0 a year ago -> 1 today
    const restDay = rand() < 0.07 // whole day off
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const partialToday = i === 0 ? 0.6 : 1

    for (const deck of decks) {
      const p = profiles[deck.id]
      if (restDay || rand() < p.skip) continue
      const base = p.base[0] + (p.base[1] - p.base[0]) * progress
      const reviews = Math.round(base * (weekend ? 0.75 : 1) * (0.6 + rand() * 0.8) * partialToday)
      if (reviews === 0) continue
      const rate = p.again[0] + (p.again[1] - p.again[0]) * progress
      const reviewCardReviews = Math.round(reviews * 0.6)
      const matureReviews = Math.round(reviewCardReviews * 0.5 * progress)
      daily.push({
        date: toDateKey(date),
        deckId: deck.id,
        reviews,
        again: Math.round(reviews * rate * (0.7 + rand() * 0.6)),
        studySeconds: Math.round(reviews * p.secPerReview * (0.8 + rand() * 0.4)),
        reviewCardReviews,
        reviewCardPassed: Math.round(reviewCardReviews * (0.86 + rand() * 0.08)),
        matureReviews,
        maturePassed: Math.round(matureReviews * (0.88 + rand() * 0.08)),
      })
    }
  }

  return { source: 'mock', generatedAt: today.toISOString(), dayStartHour: 0, decks, daily }
}

export const mockData: AnkiData = generate()
