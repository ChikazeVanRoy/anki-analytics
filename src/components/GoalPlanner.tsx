import { useState } from 'react'
import { messages } from '../i18n'
import { dayNumber, keyFromDayNumber } from '../lib/dates'
import { goalPlan, minutesAt, pilesUpAt, type SweepPoint } from '../lib/plan'
import { Panel } from './Panel'

const m = messages.planner.goal
const fieldClass = 'mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-base font-bold text-ink tabular-nums'

const storeKey = (selection: string) => `anki-analytics:goal:${selection}`

/** Only a convenience: without storage the goal simply isn't remembered, and anything unusable is ignored. */
function remembered(selection: string): { target?: number; date?: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(selection)) ?? '{}') as { target?: unknown; date?: unknown } | null
    return {
      ...(Number.isFinite(saved?.target) && { target: saved?.target as number }),
      ...(typeof saved?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.date) && { date: saved.date }),
    }
  } catch {
    return {}
  }
}
function remember(selection: string, goal: { target: number; date: string }) {
  try {
    localStorage.setItem(storeKey(selection), JSON.stringify(goal))
  } catch {
    // storage unavailable: nothing to do
  }
}

interface Props {
  /** The decks this goal is for. Each selection keeps its own goal. */
  selection: string
  started: number
  available: number
  todayKey: string
  studyDaysPerWeek: number
  sweep: SweepPoint[]
  secondsPerReview: number
  budget: number
  onUse: (newPerDay: number) => void
}

/** Works a plan backwards from a goal. The cost comes from the same scenarios as the rest of the Planner. */
export function GoalPlanner({ selection, started, available, todayKey, studyDaysPerWeek, sweep, secondsPerReview, budget, onUse }: Props) {
  const [saved] = useState(() => remembered(selection))
  const [target, setTarget] = useState(saved.target ?? Math.ceil((started + 1) / 1000) * 1000)
  const [date, setDate] = useState(saved.date ?? keyFromDayNumber(dayNumber(todayKey) + 365))
  const update = (next: { target: number; date: string }) => {
    setTarget(next.target)
    setDate(next.date)
    remember(selection, next)
  }
  const plan = goalPlan({ target, started, available, date, today: todayKey, studyDaysPerWeek })
  const minutes = plan.kind === 'ok' ? minutesAt(sweep, plan.perStudyDay, secondsPerReview) : null
  const piles = plan.kind === 'ok' && pilesUpAt(sweep, plan.perStudyDay)
  return (
    <Panel title={m.title} eyebrow={m.eyebrow} subtitle={m.subtitle} variant="projection">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink-2">
          {m.target}
          <input
            type="number"
            min={0}
            step={100}
            value={Number.isFinite(target) ? target : ''}
            onChange={(e) => update({ target: e.target.valueAsNumber, date })}
            className={fieldClass}
          />
          <span className="mt-1 block text-xs font-normal text-muted">{m.started(started)}</span>
        </label>
        <label className="block text-sm font-semibold text-ink-2">
          {m.date}
          <input type="date" value={date} min={todayKey} onChange={(e) => update({ target, date: e.target.value })} className={fieldClass} />
        </label>
      </div>
      <div role="status" className="mt-4 text-sm leading-relaxed text-ink-2">
        {!Number.isFinite(target) || !date ? null : plan.kind === 'reached' ? (
          m.reached
        ) : plan.kind === 'too-many' ? (
          m.tooMany(plan.available)
        ) : plan.kind === 'date-passed' ? (
          m.datePassed
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="font-extrabold text-ink">{m.needs(plan.perStudyDay)}</span>
              {piles ? ` ${m.piles}` : minutes !== null && ` ${m.peak(minutes, budget, minutes <= budget)}`}
            </p>
            <button
              type="button"
              onClick={() => onUse(plan.perStudyDay)}
              className="shrink-0 rounded-xl bg-brand px-3 py-2 text-sm font-bold text-brand-ink hover:brightness-110"
            >
              {m.use}
            </button>
          </div>
        )}
      </div>
    </Panel>
  )
}
