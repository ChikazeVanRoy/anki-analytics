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
