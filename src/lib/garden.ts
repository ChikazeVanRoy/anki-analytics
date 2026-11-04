// The Home "memory garden": each deck's studied cards drawn as plants (sprout = learning, flower = known
// well); cards not started yet are seeds, shown as a count beside the bed so a large unstarted deck doesn't
// bury the plants. With FSRS data the plants are alive: a card droops when it needs reviewing, and buds once
// its interval is long, opening when it's proven. Pure and deterministic, so the garden looks the same on every visit until the counts
// change. Counts come straight from the deck; one plant stands for `unit` studied cards, the same in every
// bed so beds can be compared by eye.

import type { Deck } from '../data/types'
import { dayNumber } from './dates'
import { RISK_MARGIN, type CardNow } from './fsrsStats'

/** `bud` and `wilt` need FSRS data. Without it, `flower` means a long interval rather than a proven card. */
export type PlantStage = 'sprout' | 'bud' | 'flower' | 'wilt'

/** The card a plant stands for, to show when it's tapped. */
export interface PlantCard {
  front?: string
  recall: number
  dueIn: number // days; 0 or less means due now
}

export interface Plant {
  stage: PlantStage
  /** Small, stable offsets so the bed looks planted by hand, not gridded. */
  lift: number // px, -2..2
  tilt: number // degrees, -8..8
  scale: number // 0.85..1.1
  card?: PlantCard
}

export interface GardenBed {
  deckId: string
  unit: number // studied cards per plant
  counts: Record<PlantStage | 'seed', number> // cards per stage (exact)
  plants: Plant[]
}

const UNITS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 2_500, 5_000, 10_000]

/** Plants for one stage: rounded, but a stage with any cards always gets at least one plant. */
const plantsFor = (cards: number, unit: number) => (cards > 0 ? Math.max(1, Math.round(cards / unit)) : 0)

const MATURE_DAYS = 21

/**
 * A card's place in the garden. Needing water comes first: a proven card still needs its next review. Only cards
 * Anki will show today droop, as the garden tells you to review them.
 */
export function stageOf(c: CardNow): PlantStage {
  if (c.overdue || (c.dueToday && c.r < c.desired - RISK_MARGIN)) return 'wilt'
  if (c.proven) return 'flower'
  return c.interval >= MATURE_DAYS ? 'bud' : 'sprout'
}

const plantCount = (deck: Deck, unit: number) => plantsFor(deck.youngCards, unit) + plantsFor(deck.matureCards, unit)

/** Smallest round number of cards per plant, shared by all beds, that keeps every bed at or under `maxPlants`. */
export function plantUnit(decks: Deck[], maxPlants: number): number {
  return UNITS.find((u) => decks.every((d) => plantCount(d, u) <= maxPlants)) ?? UNITS[UNITS.length - 1]
}

/** Seeded PRNG (mulberry32) from a string, so each deck's layout is stable. */
function random(seed: string) {
  let a = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 2_654_435_761), 0x9e3779b9) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const STAGES: PlantStage[] = ['flower', 'bud', 'wilt', 'sprout']

function arrange(deckId: string, unit: number, counts: GardenBed['counts'], cards: Record<PlantStage, CardNow[]> | null, today: number): GardenBed {
  const rand = random(deckId)
  const plants = STAGES.flatMap((stage) => {
    const n = plantsFor(counts[stage], unit)
    return Array.from({ length: n }, (_, i): { stage: PlantStage; card?: PlantCard } => {
      // Spread over the stage's cards, so the same few aren't always the ones shown
      const c = cards?.[stage][Math.floor((i * counts[stage]) / n)]
      return { stage, ...(c && { card: { front: c.front, recall: c.r, dueIn: dayNumber(c.due) - today } }) }
    })
  })
  // Mix the bed (Fisher-Yates with the seeded generator)
  for (let i = plants.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[plants[i], plants[j]] = [plants[j], plants[i]]
  }
  return {
    deckId,
    unit,
    counts,
    plants: plants.map((p) => ({
      ...p,
      lift: Math.round((rand() * 4 - 2) * 10) / 10,
      tilt: Math.round((rand() * 16 - 8) * 10) / 10,
      scale: Math.round((0.85 + rand() * 0.25) * 100) / 100,
    })),
  }
}

/** A bed from the deck's counts alone, for data without FSRS memory states. */
export function gardenBed(deck: Deck, unit: number): GardenBed {
  return arrange(deck.id, unit, { seed: deck.newCards, sprout: deck.youngCards, bud: 0, flower: deck.matureCards, wilt: 0 }, null, 0)
}

/** A bed from each card's memory state. */
export function livingBed(deck: Deck, cards: CardNow[], unit: number, todayKey: string): GardenBed {
  const byStage: Record<PlantStage, CardNow[]> = { sprout: [], bud: [], flower: [], wilt: [] }
  for (const c of cards) if (c.deckId === deck.id) byStage[stageOf(c)].push(c)
  const counts = { seed: deck.newCards, sprout: byStage.sprout.length, bud: byStage.bud.length, flower: byStage.flower.length, wilt: byStage.wilt.length }
  return arrange(deck.id, unit, counts, byStage, dayNumber(todayKey))
}
