// A deck as one whole trip: the road runs from the first card to the last, with round-numbered stops along
// it, so where you stand is your true place in the deck (pure, tested).

import type { Deck } from '../data/types'

const STEPS = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000]
const MOST_LEGS = 5

export interface JourneyStop {
  at: number // cards started when you reach it
  share: number // 0-1 along the whole deck
  reached: boolean
  finish: boolean
}

export interface Journey {
  started: number
  total: number
  toGo: number
  /** 0-1 of the whole deck started. */
  progress: number
  stops: JourneyStop[]
}

/** The smallest round step that keeps the whole deck to a few legs. */
const stepFor = (total: number) => STEPS.find((s) => total / s <= MOST_LEGS) ?? STEPS[STEPS.length - 1]

export function journey(deck: Deck): Journey {
  const started = deck.youngCards + deck.matureCards
  const total = deck.totalCards
  const step = stepFor(total)
  // A round stop right before the finish would crowd it, so it's left out
  const round = Array.from({ length: Math.ceil(total / step) }, (_, i) => i * step).filter((at) => at === 0 || total - at >= step / 2)
  const stops = [...round, ...(total > 0 ? [total] : [])].map((at) => ({
    at,
    share: total > 0 ? at / total : 0,
    reached: started >= at,
    finish: at === total,
  }))
  return { started, total, toGo: Math.max(0, total - started), progress: total > 0 ? Math.min(1, started / total) : 0, stops: stops.length ? stops : [{ at: 0, share: 0, reached: true, finish: false }] }
}

/** The progress to print: rounding must not call an unfinished deck 100%, nor a begun one 0%. */
export const shownProgress = ({ progress, started, toGo }: Journey) => (toGo > 0 ? Math.min(0.99, started > 0 ? Math.max(0.001, progress) : 0) : progress)

export interface RoadPoint {
  x: number
  y: number
}

/** Each leg leaves and arrives level: its control points sit halfway along. */
const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

/** The winding road through its stops, as an SVG path. */
export function roadPath(points: RoadPoint[]): string {
  return points.reduce((d, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`
    const mid = (points[i - 1].x + p.x) / 2
    return `${d} C${mid} ${points[i - 1].y} ${mid} ${p.y} ${p.x} ${p.y}`
  }, '')
}

/** The point on that road at a given x, found by halving, so the marker stands on the bend rather than beside it. */
export function pointOnRoad(points: RoadPoint[], x: number): RoadPoint {
  const after = points.findIndex((p, i) => i > 0 && x <= p.x)
  if (after < 0) return points[points.length - 1]
  const [a, b] = [points[after - 1], points[after]]
  const mid = (a.x + b.x) / 2
  let [low, high] = [0, 1]
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2
    if (cubic(a.x, mid, mid, b.x, t) < x) low = t
    else high = t
  }
  return { x, y: cubic(a.y, a.y, b.y, b.y, low) }
}
