import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { messages } from '../i18n'
import { formatInt } from '../lib/format'
import type { Recap } from '../lib/recap'
import { chime, setSoundOn, soundOn } from '../lib/sound'
import { BadgeMedal } from './Badges'
import { Fireworks } from './Fireworks'
import { Mascot } from './Mascot'
import { CountUp } from './ui'

const m = messages.recap
const COLORS = ['var(--color-brand)', 'var(--color-sun)', 'var(--color-good)', 'var(--color-deck-1)', 'var(--color-fc-fresh)']

/** Bits of paper with fixed positions, so the page draws the same each time. */
const paper = (length: number, spreadMs: number) =>
  Array.from({ length }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    background: COLORS[i % COLORS.length],
    animationDelay: `${(i * 53) % spreadMs}ms`,
    animationDuration: `${1400 + ((i * 97) % 900)}ms`,
  }))
const confetti = paper(28, 700)
const moreConfetti = paper(84, 2000) // longer as well as thicker, for a finished day

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
  const { allDone } = recap
  const text = allDone ? m.allDone : m
  const [sound, setSound] = useState(soundOn)
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const chimed = useRef(false) // effects run twice in development
  useEffect(() => {
    const d = dialog.current
    // showModal keeps focus inside and blocks the page behind; a browser without it still shows the dialog
    if (d && !d.open) {
      if (d.showModal) d.showModal()
      else d.setAttribute('open', '')
      // Opens at the top, however many badges there are: the celebration is up there, and the button stays in view
      close.current?.focus({ preventScroll: true })
      d.scrollTop = 0
    }
    if (soundOn() && !chimed.current) chimed.current = chime(allDone)
  }, [allDone])
  const finish = () => {
    // A recap that opens by itself may not be allowed to play: this click is the first chance
    if (soundOn() && !chimed.current) chime(allDone)
    onClose()
  }
  const toggleSound = () => {
    setSoundOn(!sound)
    if (!sound) chimed.current = chime(allDone)
    setSound(!sound)
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="recap-title"
      onCancel={(e) => {
        e.preventDefault()
        finish()
      }}
      className="animate-bounce-in m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-x-hidden overflow-y-auto rounded-3xl bg-surface p-6 text-center shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {(allDone ? moreConfetti : confetti).map((style, i) => (
          <span key={i} className="confetti" style={style} />
        ))}
      </div>
      {allDone && <Fireworks />}
      <div className="relative">
        <div className={`flex justify-center ${allDone ? 'animate-hop' : ''}`}>
          <Mascot mood="cheer" size={84} />
        </div>
        <h2 id="recap-title" className="mt-2 text-2xl font-black tracking-tight text-ink">
          {text.title}
        </h2>
        <p className="mt-1 text-sm text-ink-2">{text.sub}</p>
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
        <button ref={close} type="button" onClick={finish} className="btn-3d sticky bottom-0 z-10 mt-5 w-full">
          {text.close}
        </button>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={sound} onChange={toggleSound} />
          {m.sound}
        </label>
      </div>
    </dialog>
  )
}
