// Three small goals for today, from what's actually due and a pace you can keep (pure, tested).
// Nothing rewards doing more than the pace: going past it finishes a quest, and nothing else.

import type { AnkiData } from '../data/types'
import { RISK_MARGIN, type CardNow } from './fsrsStats'
import type { TodayWork } from './progress'

export type Quest =
  | { kind: 'reviews'; done: number; goal: number }
  | { kind: 'new'; done: number; goal: number }
  | { kind: 'rescue'; left: number }

export const questDone = (q: Quest) => (q.kind === 'rescue' ? q.left === 0 : q.done >= q.goal)
export const questProgress = (q: Quest) => (q.kind === 'rescue' ? (q.left === 0 ? 1 : 0) : Math.min(1, q.done / q.goal))

const total = (counts: Record<string, number> | undefined) => Object.values(counts ?? {}).reduce((a, b) => a + b, 0)

/**
 * `cards`: each card's state today. `paceNew`: the new cards a day that fit your time; without one, that quest is
 * left out. Rescue only counts cards Anki will show today, so it can always be finished.
 */
export function dailyQuests(data: AnkiData, cards: CardNow[], work: TodayWork | null, paceNew: number | null): Quest[] {
  if (!data.fsrs?.enabled || !work || work.stale) return []
  const { fsrs } = data
  const quests: Quest[] = []
  const reviewed = total(fsrs.reviewsToday)
  if (reviewed + work.cards > 0) quests.push({ kind: 'reviews', done: reviewed, goal: reviewed + work.cards })
  if (paceNew) quests.push({ kind: 'new', done: total(fsrs.newToday), goal: paceNew })
  quests.push({ kind: 'rescue', left: cards.filter((c) => c.dueToday && !c.buried && c.r < c.desired - RISK_MARGIN).length })
  return quests
}
