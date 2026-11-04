// Runs the simulator off the main thread, so sliders and charts stay responsive.
import { HORIZONS, simulate, summarise, type HorizonSummary, type SimDay, type SimDeck, type SimSettings } from './simulator'

export interface SimRequest {
  id: number
  decks: SimDeck[]
  settings: SimSettings
  scenarioNewPerDay: number[]
  scenarioRetention: number[]
  scenarioRuns: number
  /** New-card scenarios to run again with the other recall model, to show how far the answer depends on it. */
  otherRecallNewPerDay: number[]
}

export interface Summaries {
  byHorizon: Record<number, HorizonSummary>
}

export type SimResponse =
  | { id: number; kind: 'main'; days: SimDay[]; runs: number; byHorizon: Record<number, HorizonSummary> }
  | {
      id: number
      kind: 'scenarios'
      newPerDay: { value: number; byHorizon: Record<number, HorizonSummary> }[]
      retention: { value: number; byHorizon: Record<number, HorizonSummary> }[]
      otherRecall?: { value: number; byHorizon: Record<number, HorizonSummary> }[]
    }

// Minutes are computed in the UI from reviews × seconds per review, so pass 60 here (1 review = 1 "minute").
const byHorizon = (res: ReturnType<typeof simulate>) =>
  Object.fromEntries(HORIZONS.map((h) => [h, summarise(res, h, 60)])) as Record<number, HorizonSummary>

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, decks, settings, scenarioNewPerDay, scenarioRetention, scenarioRuns, otherRecallNewPerDay } = e.data
  const main = simulate(decks, settings)
  self.postMessage({ id, kind: 'main', days: main.days, runs: main.runs, byHorizon: byHorizon(main) } satisfies SimResponse)
  // Scenarios use the same seed, so differences come from the setting, not from random noise
  const runs = { ...settings, runs: scenarioRuns }
  const recall = settings.recall === 'fsrs' ? 'calibrated' : 'fsrs'
  self.postMessage({
    id,
    kind: 'scenarios',
    newPerDay: scenarioNewPerDay.map((value) => ({ value, byHorizon: byHorizon(simulate(decks, { ...runs, newPerDay: value })) })),
    retention: scenarioRetention.map((value) => ({ value, byHorizon: byHorizon(simulate(decks, { ...runs, desiredRetention: value })) })),
    otherRecall: otherRecallNewPerDay.map((value) => ({ value, byHorizon: byHorizon(simulate(decks, { ...runs, newPerDay: value, recall })) })),
  } satisfies SimResponse)
}
