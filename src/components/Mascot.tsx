import type { MascotMood } from '../lib/progress'

/** Sprig, the app's seedling. Moods differ by face and pose, so colour isn't the only signal. */
export function Mascot({ mood, size = 72 }: { mood: MascotMood; size?: number }) {
  const closed = mood === 'sleepy' || mood === 'cheer'
  return (
    <svg viewBox="0 0 80 88" width={size} height={size * 1.1} className={mood === 'sleepy' ? '' : 'animate-float'} aria-hidden>
      {/* Pot-shaped body */}
      <path d="M16 44 h48 l-5 34 a8 8 0 0 1 -8 7 h-22 a8 8 0 0 1 -8 -7 z" fill="var(--color-sun)" />
      <rect x={11} y={36} width={58} height={12} rx={6} fill="var(--color-sun-ink)" />
      {/* Leaves */}
      <g className="origin-bottom animate-sway">
        <path d="M40 36 V20" stroke="var(--color-good)" strokeWidth={5} strokeLinecap="round" />
        <path d="M40 24 C28 24 20 16 20 6 C33 6 40 13 40 24 Z" fill="var(--color-good)" />
        <path d="M40 22 C51 22 60 14 60 3 C47 3 40 11 40 22 Z" fill="var(--color-good)" />
      </g>
      {/* Face */}
      {closed ? (
        <>
          <path d="M27 58 q5 -6 10 0" stroke="var(--color-sprig-ink)" strokeWidth={3} strokeLinecap="round" fill="none" />
          <path d="M43 58 q5 -6 10 0" stroke="var(--color-sprig-ink)" strokeWidth={3} strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx={32} cy={57} r={4} fill="var(--color-sprig-ink)" />
          <circle cx={48} cy={57} r={4} fill="var(--color-sprig-ink)" />
          <circle cx={33.4} cy={55.6} r={1.3} fill="var(--color-sprig-shine)" />
          <circle cx={49.4} cy={55.6} r={1.3} fill="var(--color-sprig-shine)" />
        </>
      )}
      {mood === 'cheer' && <path d="M31 65 q9 11 18 0 z" fill="var(--color-sprig-ink)" />}
      {mood === 'happy' && <path d="M32 66 q8 7 16 0" stroke="var(--color-sprig-ink)" strokeWidth={3} strokeLinecap="round" fill="none" />}
      {mood === 'curious' && <circle cx={40} cy={67} r={3} fill="var(--color-sprig-ink)" />}
      {mood === 'sleepy' && (
        <>
          <path d="M34 67 h12" stroke="var(--color-sprig-ink)" strokeWidth={3} strokeLinecap="round" />
          <text x={62} y={28} fontSize={14} fontWeight={900} fill="var(--color-brand-strong)">
            z
          </text>
        </>
      )}
    </svg>
  )
}
