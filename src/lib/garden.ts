// The Home "memory garden": each deck's studied cards drawn as plants (sprout = learning, flower = known
// well); cards not started yet are seeds, shown as a count beside the bed so a large unstarted deck doesn't
// bury the plants. Pure and deterministic, so the garden looks the same on every visit until the counts
// change. Counts come straight from the deck; one plant stands for `unit` studied cards, the same in every
// bed so beds can be compared by eye.

import type { Deck } from '../data/types'

export type PlantStage = 'sprout' | 'flower'

export interface Plant {
  stage: PlantStage
  /** Small, stable offsets so the bed looks planted by hand, not gridded. */
  lift: number // px, -2..2
  tilt: number // degrees, -8..8
  scale: number // 0.85..1.1
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

export function gardenBed(deck: Deck, unit: number): GardenBed {
  const counts = { seed: deck.newCards, sprout: deck.youngCards, flower: deck.matureCards }
  const rand = random(deck.id)
  const stages: PlantStage[] = (['flower', 'sprout'] as const).flatMap((s) =>
    Array<PlantStage>(plantsFor(counts[s], unit)).fill(s),
  )
  // Mix the bed (Fisher-Yates with the seeded generator)
  for (let i = stages.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[stages[i], stages[j]] = [stages[j], stages[i]]
  }
  const plants = stages.map((stage) => ({
    stage,
    lift: Math.round((rand() * 4 - 2) * 10) / 10,
    tilt: Math.round((rand() * 16 - 8) * 10) / 10,
    scale: Math.round((0.85 + rand() * 0.25) * 100) / 100,
  }))
  return { deckId: deck.id, unit, counts, plants }
}
