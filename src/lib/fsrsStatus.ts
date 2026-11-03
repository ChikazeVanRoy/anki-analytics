// Why the FSRS sections are hidden. They never show without real, FSRS-enabled data (pure, tested).
import type { AnkiData } from '../data/types'

export function fsrsUnavailableReason(data: AnkiData): { title: string; detail: string } {
  if (data.source === 'mock') {
    return {
      title: 'Available with your real Anki data',
      detail:
        'These sections use your cards’ FSRS memory states, so they are not shown with sample data. Start the local API (npm run dev) and press Refresh with Anki closed.',
    }
  }
  if (data.fsrsError) return { title: 'FSRS data unavailable', detail: `${data.fsrsError} The rest of the dashboard is unaffected.` }
  if (!data.fsrs) {
    return {
      title: 'FSRS data unavailable',
      detail: 'The API did not send FSRS data. Restart it (npm run dev) and press Refresh.',
    }
  }
  return {
    title: 'FSRS is turned off in Anki',
    detail:
      'Your collection uses Anki’s older SM-2 scheduler, so there are no FSRS memory states to analyse or simulate. Turn on FSRS in Anki (Deck options → Advanced → FSRS), then press Refresh.',
  }
}
