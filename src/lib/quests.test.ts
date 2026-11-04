import { describe, expect, it } from 'vitest'
import type { AnkiData } from '../data/types'
import { realShapedData } from '../test/fsrsFixture'
import { dailyQuests, questDone, questProgress } from './quests'

const today = new Date()
const work = (cards: number) => ({ stale: false as const, cards, heldBack: 0, newCards: 0, minutes: 1 })
const data = (reviewsToday = {}, newToday = {}): AnkiData => {
  const d = realShapedData()
  return { ...d, fsrs: { ...d.fsrs!, reviewsToday, newToday } }
}

describe('dailyQuests', () => {
  it('sets a goal from what’s due, and a new-card goal from your pace', () => {
    const [reviews, fresh] = dailyQuests(data({ a: 10 }, { a: 3 }), today, work(30), 10)
    expect(reviews).toEqual({ kind: 'reviews', done: 10, goal: 40 })
    expect(fresh).toEqual({ kind: 'new', done: 3, goal: 10 })
  })

  it('leaves out what doesn’t apply today', () => {
    const kinds = dailyQuests(data(), today, work(0), null).map((q) => q.kind)
    expect(kinds).toEqual(['rescue'])
  })

  it('has no quests without current FSRS data', () => {
    expect(dailyQuests(data(), today, { stale: true }, 10)).toEqual([])
    expect(dailyQuests(data(), today, null, 10)).toEqual([])
    expect(dailyQuests({ ...data(), fsrs: undefined }, today, work(1), 10)).toEqual([])
  })
})

describe('quest progress', () => {
  it('finishes at the goal and never goes past full', () => {
    const q = { kind: 'new' as const, done: 25, goal: 10 }
    expect(questDone(q)).toBe(true)
    expect(questProgress(q)).toBe(1)
  })

  it('finishes rescue when no card is at risk', () => {
    expect(questDone({ kind: 'rescue', left: 2 })).toBe(false)
    expect(questProgress({ kind: 'rescue', left: 0 })).toBe(1)
  })
})
