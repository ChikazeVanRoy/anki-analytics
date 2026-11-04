import { messages } from '../i18n'
import { questDone, questProgress, type Quest } from '../lib/quests'
import { CheckIcon } from './icons'
import { ProgressBar } from './ui'

const m = messages.home.quests

const text = (q: Quest) => (q.kind === 'reviews' ? m.reviews(q.goal) : q.kind === 'new' ? m.fresh(q.goal) : q.left > 0 ? m.rescue(q.left) : m.rescued)

export function Quests({ quests }: { quests: Quest[] }) {
  if (!quests.length) return null
  const allDone = quests.every(questDone)
  return (
    <section aria-labelledby="home-quests" className="animate-rise">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 id="home-quests" className="text-xl font-black tracking-tight text-ink">
          {m.title}
        </h2>
        <p className="text-sm text-muted">{allDone ? m.allDone : m.question}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {quests.map((q) => {
          const done = questDone(q)
          return (
            <li key={q.kind} className={`rounded-3xl border-2 p-4 ${done ? 'border-good bg-good-soft' : 'border-line bg-surface shadow-card'}`}>
              <div className="flex items-start gap-2.5">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${done ? 'animate-bounce-in bg-good text-surface' : 'bg-surface-3 text-transparent'}`}>
                  <CheckIcon size={16} />
                </span>
                <p className="text-sm font-extrabold text-ink">{text(q)}</p>
              </div>
              {q.kind !== 'rescue' && (
                <div className="mt-3">
                  <ProgressBar value={questProgress(q)} color="var(--color-good)" label={text(q)} />
                  <p className="mt-1 text-xs text-ink-2 tabular-nums">{m.count(Math.min(q.done, q.goal), q.goal)}</p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
