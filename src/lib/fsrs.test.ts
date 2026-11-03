import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS as W, difficultyPercent, nextInterval, replay, retrievability, step } from './fsrs'

describe('forgetting curve', () => {
  it('gives 90% recall after exactly `stability` days, for any stability', () => {
    for (const s of [0.5, 3, 40, 900]) expect(retrievability(s, s)).toBeCloseTo(0.9, 10)
  })
  it('is 100% immediately and falls monotonically', () => {
    expect(retrievability(0, 10)).toBe(1)
    const rs = [1, 5, 10, 50, 200].map((t) => retrievability(t, 10))
    expect(rs).toEqual([...rs].sort((a, b) => b - a))
  })
  it('inverts nextInterval: waiting the scheduled interval gives the desired retention', () => {
    for (const dr of [0.8, 0.85, 0.9, 0.95]) expect(retrievability(nextInterval(25, dr), 25)).toBeCloseTo(dr, 10)
    expect(nextInterval(25, 0.9)).toBeCloseTo(25, 10)
    expect(nextInterval(25, 0.95)).toBeLessThan(nextInterval(25, 0.85)) // higher target, shorter interval
  })
})

describe('memory state updates (FSRS-6 defaults)', () => {
  it('initialises from the first rating', () => {
    expect(step(null, 1, 0)).toEqual({ stability: W[0], difficulty: W[4] }) // Again: D = w4 exactly
    const good = step(null, 3, 0)
    expect(good.stability).toBe(W[2])
    expect(good.difficulty).toBeCloseTo(W[4] - Math.exp(W[5] * 2) + 1, 10)
    expect(step(null, 4, 0).stability).toBe(W[3])
  })

  it('orders outcomes after a review: Again < Hard < Good < Easy, all but Again above the old stability', () => {
    const state = { stability: 10, difficulty: 5 }
    const [again, hard, good, easy] = ([1, 2, 3, 4] as const).map((g) => step(state, g, 10).stability)
    expect(again).toBeLessThan(state.stability)
    expect(state.stability).toBeLessThan(hard)
    expect(hard).toBeLessThan(good)
    expect(good).toBeLessThan(easy)
  })

  it('rewards reviewing later: passing at lower recall grows stability more', () => {
    const state = { stability: 10, difficulty: 5 }
    expect(step(state, 3, 30).stability).toBeGreaterThan(step(state, 3, 5).stability)
  })

  it('moves difficulty towards hard on Again and towards easy on Easy, within 1-10', () => {
    const state = { stability: 10, difficulty: 5 }
    expect(step(state, 1, 10).difficulty).toBeGreaterThan(5)
    expect(step(state, 4, 10).difficulty).toBeLessThan(5)
    let s = { stability: 10, difficulty: 9.9 }
    for (let i = 0; i < 20; i++) s = step(s, 1, 1)
    expect(s.difficulty).toBeLessThanOrEqual(10)
    expect(s.difficulty).toBeGreaterThan(9)
  })

  it('uses the short-term formula for same-day reviews: Good never lowers stability, Again does', () => {
    const state = { stability: 2, difficulty: 5 }
    expect(step(state, 3, 0).stability).toBeGreaterThanOrEqual(2)
    expect(step(state, 1, 0).stability).toBeLessThan(2)
  })

  it('caps post-lapse stability so a lapse never increases it', () => {
    const state = { stability: 0.5, difficulty: 1 }
    expect(step(state, 1, 30).stability).toBeLessThanOrEqual(0.5)
  })
})

describe('replay', () => {
  it('predicts recall before each review after the first, using whole-day gaps', () => {
    const { predicted, state } = replay([
      { day: 100, rating: 3 },
      { day: 100, rating: 3 }, // same day: no prediction
      { day: 103, rating: 3 },
    ])
    expect(predicted[0]).toBeNaN()
    expect(predicted[1]).toBeNaN()
    const afterLearning = step(step(null, 3, 0), 3, 0)
    expect(predicted[2]).toBeCloseTo(retrievability(3, afterLearning.stability), 10)
    expect(state!.stability).toBeCloseTo(step(afterLearning, 3, 3).stability, 10)
  })
})

it('shows difficulty as Anki does (1 -> 0%, 10 -> 100%)', () => {
  expect(difficultyPercent(1)).toBe(0)
  expect(difficultyPercent(10)).toBe(1)
  expect(difficultyPercent(5.5)).toBe(0.5)
})
