import type { Deck } from '../data/types'

// Colours that Recharts needs as JS values. Always write var(--color-…) names in full here (no template
// strings), or Tailwind won't emit the variable. They reference the CSS tokens in index.css, so charts follow
// the light/dark theme automatically (SVG presentation attributes and inline styles both resolve var()).
//
// Palettes were checked with the dataviz validator (OKLab CVD/normal-vision separation, lightness band,
// chroma, contrast) against the light surface #ffffff and the dark surface #221e1a:
// - decks (the three slots, all pairs): every check passes in both modes; worst CVD ΔE 9.2 light / 9.4 dark,
//   normal vision 24.0 / 20.9. Light aqua is under 3:1, so decks always carry a legend or name next to the
//   colour. "Other decks" is not a categorical colour but a neutral grey (--color-deck-other), so it isn't in
//   the palette check; checked separately, it stays apart from all three slots (CVD ΔE ≥ 9.2, normal ≥ 19.5).
// - forecast (adjacent): light worst CVD ΔE 16.3, dark 13.2. Light yellow/pink are under 3:1; every
//   forecast chart has a legend, tooltip and text summary, and estimated series are also hatched.

export const chart = {
  surface: 'var(--color-surface)',
  grid: 'var(--color-grid)',
  axis: 'var(--color-axis)',
  muted: 'var(--color-muted)',
  ink: 'var(--color-ink)',
  ink2: 'var(--color-ink-2)',
  /** Hover wash behind a bar chart's active category. */
  cursor: 'color-mix(in oklab, var(--color-ink) 6%, transparent)',
}

// Colour follows the deck, never its rank, so it stays stable across filters. The server gives each deck a
// colour slot (Deck.color); decks without one ("Other decks") are neutral. Components get the colours from
// the data they render, through useDeckColor (src/data/deckColors.ts).
const deckSlots = ['var(--color-deck-1)', 'var(--color-deck-2)', 'var(--color-deck-3)']
export const deckOtherColor = 'var(--color-deck-other)'

/** Deck id -> CSS colour for a set of decks. */
export function deckColorMap(decks: Deck[]): Map<string, string> {
  return new Map(decks.map((d) => [d.id, (d.color && deckSlots[d.color - 1]) || deckOtherColor]))
}

// Heatmap: one hue (violet), faint -> strong = few -> many reviews.
// Written out in full: Tailwind only emits theme variables whose names appear literally in the source.
export const heatmapLevels = [
  'var(--color-heat-0)',
  'var(--color-heat-1)',
  'var(--color-heat-2)',
  'var(--color-heat-3)',
  'var(--color-heat-4)',
]

// Forecast composition. Distinct from deck colours so a series never reads as a deck.
export const forecast = {
  known: 'var(--color-fc-known)', // existing cards' next review, already scheduled by Anki
  followUp: 'var(--color-fc-followup)', // later reviews of existing cards (estimated)
  fresh: 'var(--color-fc-fresh)', // reviews of cards introduced during the forecast (estimated)
  band: 'var(--color-fc-band)',
}

// Measured vs model lines (calibration)
export const calibrationColors = { actual: chart.ink2, predicted: forecast.known }
