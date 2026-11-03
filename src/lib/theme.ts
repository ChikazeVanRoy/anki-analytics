// Colours that Recharts needs as JS values. They reference the CSS tokens in index.css, so charts follow
// the light/dark theme automatically (SVG presentation attributes and inline styles both resolve var()).
//
// Palettes were checked with the dataviz validator (OKLab CVD/normal-vision separation, lightness band,
// chroma, contrast) against the light surface #ffffff and the dark surface #221e1a:
// - decks (all pairs): light worst CVD ΔE 9.2, dark 9.4. Light aqua is under 3:1, so decks always carry
//   a legend or name next to the colour.
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

// Colour follows the deck, never its rank, so it stays stable across filters.
const deckColors: Record<string, string> = {
  mandarin: 'var(--color-deck-mandarin)',
  portuguese: 'var(--color-deck-portuguese)',
  other: 'var(--color-deck-other)',
}

export const deckColor = (deckId: string) => deckColors[deckId] ?? chart.muted

// Heatmap: one hue (violet), faint -> strong = few -> many reviews.
export const heatmapLevels = [0, 1, 2, 3, 4].map((i) => `var(--color-heat-${i})`)

// Forecast composition. Distinct from deck colours so a series never reads as a deck.
export const forecast = {
  known: 'var(--color-fc-known)', // existing cards' next review, already scheduled by Anki
  followUp: 'var(--color-fc-followup)', // later reviews of existing cards (estimated)
  fresh: 'var(--color-fc-fresh)', // reviews of cards introduced during the forecast (estimated)
  band: 'var(--color-fc-band)',
}

// Measured vs model lines (calibration)
export const calibrationColors = { actual: chart.ink2, predicted: forecast.known }
