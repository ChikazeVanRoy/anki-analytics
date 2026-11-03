// Colours that Recharts needs as JS values (it renders SVG attributes, not Tailwind classes).
// Keep in sync with the @theme tokens in index.css.

export const chart = {
  surface: '#1a1a19',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  ink: '#f0efec',
}

// Colour follows the deck, never its rank, so it stays stable across filters.
// Validated for colour-blind separation on the dark surface.
const deckColors: Record<string, string> = {
  mandarin: '#3987e5',
  portuguese: '#d95926',
  other: '#199e70',
}

export const deckColor = (deckId: string) => deckColors[deckId] ?? chart.muted

// Heatmap: one hue (blue), dark -> bright = few -> many reviews.
export const heatmapLevels = ['#2c2c2a', '#184f95', '#256abf', '#3987e5', '#86b6ef']

// Forecast composition. Distinct from deck colours so a series never reads as a deck.
// Validated for colour-blind separation on the dark surface; estimated series also get a hatch.
export const forecast = {
  known: '#9085e9', // existing cards' next review, already scheduled by Anki
  followUp: '#c98500', // later reviews of existing cards (estimated)
  fresh: '#d55181', // reviews of cards introduced during the forecast (estimated)
  band: '#c3c2b7',
}

// Measured vs model lines (calibration)
export const calibrationColors = { actual: '#c3c2b7', predicted: '#9085e9' }
