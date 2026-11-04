import { messages } from '../i18n'
import { BADGES, type BadgeId } from '../lib/badges'
import { TrophyIcon } from './icons'
import { SourceBadge } from './ui'

const m = messages.home.badges

export function BadgeMedal({ id, earned }: { id: BadgeId; earned: boolean }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${earned ? 'bg-sun-soft' : 'bg-surface-2'}`}>
      <span className={`mx-auto grid size-11 place-items-center rounded-full ${earned ? 'animate-bounce-in bg-sun text-white' : 'bg-surface-3 text-muted'}`}>
        <TrophyIcon size={22} />
      </span>
      <p className={`mt-2 text-sm font-extrabold ${earned ? 'text-ink' : 'text-muted'}`}>{m.items[id].title}</p>
      <p className="mt-0.5 text-xs text-ink-2">{earned ? m.items[id].got : m.items[id].how}</p>
      <span className="sr-only">{earned ? m.earned : m.locked}</span>
    </div>
  )
}

/** Every badge, earned or still to come, so it's clear what each one takes. */
export function Badges({ earned, sample }: { earned: BadgeId[]; sample: boolean }) {
  return (
    <section aria-labelledby="home-badges" className="animate-rise rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 id="home-badges" className="text-xl font-black tracking-tight text-ink">
          {m.title}
        </h2>
        <p className="text-sm text-muted">{m.count(earned.length, BADGES.length)}</p>
        {sample && <SourceBadge kind="sample" />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BADGES.map((id) => (
          <BadgeMedal key={id} id={id} earned={earned.includes(id)} />
        ))}
      </div>
    </section>
  )
}
