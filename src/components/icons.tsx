// Inline SVG icons (no icon library). 24px grid, 1.8px rounded strokes, inherit currentColor.
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" />
  </Icon>
)
export const ActivityIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 15v-2M12 15V9M16 15v-4" />
  </Icon>
)
export const PlannerIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </Icon>
)
export const AdvancedIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17.4A2 2 0 0 0 7.4 20.5h9.2a2 2 0 0 0 1.8-3.1l-4.9-8.7V3.5" />
    <path d="M8 14.5h8" />
  </Icon>
)
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Icon>
)
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Icon>
)
export const SystemIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16.5V20" />
  </Icon>
)
export const RefreshIcon = ({ spinning, ...p }: IconProps & { spinning?: boolean }) => (
  <Icon {...p} className={spinning ? 'animate-spin' : undefined}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" />
  </Icon>
)
export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
)
export const WarningIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4 21.5 20h-19L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
)
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)
export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z" />
    <path d="M18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z" />
  </Icon>
)
export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)
export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)
export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.2-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5Z" />
  </Icon>
)
export const StopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
)
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)
export const TrophyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v3M8.5 20h7M9.5 16.5h5V20h-5z" />
  </Icon>
)
export const LayersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
    <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
  </Icon>
)
export const BrainIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.5 3.5 0 0 0 9 18.5V4.5ZM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3.5 3.5 0 0 1-5 5.8V4.5Z" />
    <path d="M9 19.5h6" />
  </Icon>
)

/** Streak flame: filled and gently flickering when lit, an outline when the streak is 0. */
export function Flame({ lit, size = 44 }: { lit: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={lit ? 'origin-bottom animate-flicker' : ''}>
      <defs>
        <linearGradient id="flame-outer" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f0600f" />
          <stop offset="1" stopColor="#ffb340" />
        </linearGradient>
        <linearGradient id="flame-inner" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffd25e" />
          <stop offset="1" stopColor="#fff3c4" />
        </linearGradient>
      </defs>
      <path
        d="M24 4c2 7 10 11 10 22a10 10 0 0 1-20 0c0-5 2.5-8 5-10 0 4 1.5 6 3.5 6C22.5 16 20 11 24 4Z"
        fill={lit ? 'url(#flame-outer)' : 'none'}
        stroke={lit ? 'none' : 'var(--color-muted)'}
        strokeWidth="2.2"
        strokeLinejoin="round"
        transform="translate(0 6)"
      />
      {lit && <path d="M24 27c2 2.5 5 4.5 5 8.5a5 5 0 0 1-10 0c0-3 2-5 5-8.5Z" fill="url(#flame-inner)" transform="translate(0 2)" />}
    </svg>
  )
}

/** App logo: two stacked cards with a check. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="7" y="3" width="20" height="24" rx="5" transform="rotate(10 17 15)" fill="var(--color-sun)" opacity="0.75" />
      <rect x="5" y="5" width="20" height="24" rx="5" fill="var(--color-brand)" />
      <path d="m10.5 17.5 3.5 3.5 6.5-7" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
