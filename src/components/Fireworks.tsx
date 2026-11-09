/** Where each burst opens (% of the recap) and when, so one finished day lights up the whole card in turn. */
const BURSTS = [
  { x: 22, y: 18, delay: 0 },
  { x: 78, y: 14, delay: 350 },
  { x: 50, y: 30, delay: 750 },
  { x: 14, y: 58, delay: 1150 },
  { x: 86, y: 52, delay: 1550 },
  { x: 50, y: 10, delay: 1950 },
  { x: 30, y: 78, delay: 2350 },
  { x: 72, y: 80, delay: 2750 },
]
const SPARKS = 14
const COLORS = ['var(--color-sun)', 'var(--color-brand)', 'var(--color-good)', 'var(--color-spark-blue)', 'var(--color-spark-pink)']

/** Fixed positions and angles, so it draws the same each time. */
const sparks = BURSTS.flatMap((b, bi) =>
  Array.from({ length: SPARKS }, (_, i) => ({
    left: `${b.x}%`,
    top: `${b.y}%`,
    '--spark': COLORS[(bi + i) % COLORS.length],
    '--angle': `${(360 / SPARKS) * i + bi * 11}deg`,
    '--reach': `${4.5 + ((i * 7 + bi * 3) % 4) * 0.8}rem`,
    animationDelay: `${b.delay}ms`,
  })),
)

/**
 * Fireworks for a day with nothing left: bursts of sparks, one after another. Pure CSS, so the page does no work
 * while they play, and with reduced motion the sparks are hidden (see index.css).
 */
export function Fireworks() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-fireworks>
      {sparks.map((style, i) => (
        <span key={i} className="firework-spark" style={style as React.CSSProperties} />
      ))}
    </div>
  )
}
