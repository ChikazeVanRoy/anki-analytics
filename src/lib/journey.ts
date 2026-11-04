// A deck as a trip: a stop every so many cards, with the part of the road around you (pure, tested).

import type { Deck } from '../data/types'

const STEPS = [10, 25, 50, 100, 250, 500, 1_000]
const SHOWN = 6

export interface JourneyStop {
  at: number // cards started when you reach it
  reached: boolean
  finish: boolean
}

export interface Journey {
  started: number
  total: number
  step: number
  stops: JourneyStop[]
  /** Cards to the next stop; 0 when the deck is finished. */
  toNext: number
  /** 0-1 along the road shown: where the marker stands. */
  position: number
}

/** The smallest step that keeps a deck under about 120 stops. */
const stepFor = (total: number) => STEPS.find((s) => total / s <= 120) ?? STEPS[STEPS.length - 1]

export function journey(deck: Deck): Journey {
  const started = deck.youngCards + deck.matureCards
  const total = deck.totalCards
  const step = stepFor(total)
  const lastStop = Math.ceil(total / step)
  const passed = Math.floor(started / step)
  const first = Math.max(0, Math.min(passed - 1, lastStop - SHOWN + 1))
  const count = Math.min(SHOWN, lastStop - first + 1)
  const stops = Array.from({ length: count }, (_, i) => {
    const n = first + i
    const at = Math.min(n * step, total)
    return { at, reached: started >= at, finish: n === lastStop }
  })
  const span = stops[stops.length - 1].at - stops[0].at
  const next = stops.find((s) => !s.reached)
  return { started, total, step, stops, toNext: next ? next.at - started : 0, position: span > 0 ? Math.min(1, (started - stops[0].at) / span) : 1 }
}
