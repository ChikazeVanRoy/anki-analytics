import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { messages } from '../i18n'
import { formatInt } from '../lib/format'
import type { Recap } from '../lib/recap'
import { chime, setSoundOn, soundOn } from '../lib/sound'
import { BadgeMedal } from './Badges'
import { Mascot } from './Mascot'
import { CountUp } from './ui'

const m = messages.recap
const COLORS = ['var(--color-brand)', 'var(--color-sun)', 'var(--color-good)', 'var(--color-deck-1)', 'var(--color-fc-fresh)']

/** Bits of paper with fixed positions, so the page draws the same each time. */
const confetti = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  background: COLORS[i % COLORS.length],
  animationDelay: `${(i * 53) % 700}ms`,
  animationDuration: `${1400 + ((i * 97) % 900)}ms`,
}))

function Tile({ label, value, style }: { label: string; value: number; style?: CSSProperties }) {
  return (
    <div className="animate-bounce-in rounded-2xl bg-surface-2 p-3 text-center" style={style}>
      <p className="text-2xl font-black text-ink tabular-nums">
        <CountUp value={value} format={formatInt} />
      </p>
      <p className="text-xs font-bold text-ink-2">{label}</p>
    </div>
  )
}

/** The payoff for a session: Anki can't be watched live, so the celebration comes once it's closed. */
export function SessionRecap({ recap, onClose }: { recap: Recap; onClose: () => void }) {
  const [sound, setSound] = useState(soundOn)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    if (soundOn()) chime()
  }, [])
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  const toggleSound = () => {
    setSoundOn(!sound)
    if (!sound) chime()
    setSound(!sound)
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onKeyDown={onKey}>
      <div role="dialog" aria-modal="true" aria-labelledby="recap-title" className="animate-bounce-in relative w-full max-w-md overflow-hidden rounded-3xl bg-surface p-6 text-center shadow-pop">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {confetti.map((style, i) => (
            <span key={i} className="confetti" style={style} />
          ))}
        </div>
        <div className="relative">
          <div className="flex justify-center">
            <Mascot mood="cheer" size={84} />
          </div>
          <h2 id="recap-title" className="mt-2 text-2xl font-black tracking-tight text-ink">
            {m.title}
          </h2>
          <p className="mt-1 text-sm text-ink-2">{m.sub}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Tile label={m.reviews} value={recap.reviews} />
            <Tile label={m.minutes} value={recap.minutes} style={{ animationDelay: '80ms' }} />
            <Tile label={m.newCards} value={recap.newCards} style={{ animationDelay: '160ms' }} />
            <Tile label={m.streak} value={recap.streak} style={{ animationDelay: '240ms' }} />
          </div>
          {recap.bloomed > 0 && <p className="mt-3 text-sm font-extrabold text-good">{m.bloomed(recap.bloomed)}</p>}
          {recap.badges.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-extrabold text-ink">{m.badges(recap.badges.length)}</p>
              <div className="mt-2 grid gap-2">
                {recap.badges.map((id) => (
                  <BadgeMedal key={id} id={id} earned />
                ))}
              </div>
            </div>
          )}
          <button ref={close} type="button" onClick={onClose} className="btn-3d mt-5 w-full">
            {m.close}
          </button>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={sound} onChange={toggleSound} />
            {m.sound}
          </label>
        </div>
      </div>
    </div>
  )
}
