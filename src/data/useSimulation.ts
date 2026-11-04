import { useEffect, useState } from 'react'
import { SCENARIO_NEW_PER_DAY } from '../lib/plan'
import { retentionScenarioValues, type SimDeck, type SimSettings } from '../lib/simulator'
import type { SimRequest, SimResponse } from '../lib/simulator.worker'

export { SCENARIO_NEW_PER_DAY }

type Main = Extract<SimResponse, { kind: 'main' }>
type Scenarios = Extract<SimResponse, { kind: 'scenarios' }>

/**
 * Runs the simulator in a Web Worker whenever the inputs change (debounced).
 * A new request terminates the previous worker, so stale runs never finish late.
 * With `enabled` false, nothing runs (the caller already has the answer).
 */
export function useSimulation(decks: SimDeck[], settings: SimSettings, enabled = true) {
  const [main, setMain] = useState<Main | null>(null)
  // What the results above were computed from, so old results can't pass for current ones
  const [mainFor, setMainFor] = useState<{ key: string; decks: SimDeck[] } | null>(null)
  const [scenariosFor, setScenariosFor] = useState<{ key: string; decks: SimDeck[] } | null>(null)
  const [scenarios, setScenarios] = useState<Scenarios | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(settings)
  const selected = decks.filter((d) => settings.deckIds.includes(d.deckId))
  /** Nothing to simulate: no deck presets, or no selected deck with cards. Shown instead of a spinner. */
  const unavailable = selected.length === 0 || selected.every((d) => d.cards.length === 0 && d.newPool === 0)

  useEffect(() => {
    if (unavailable || !enabled || typeof Worker === 'undefined') return
    // Rebuild settings from `key` so the effect depends only on values it lists (a new settings object
    // is created on every render, so depending on it directly would restart the simulation each time)
    const current = JSON.parse(key) as SimSettings
    let worker: Worker | null = null
    const timer = setTimeout(() => {
      setRunning(true)
      setError(null)
      worker = new Worker(new URL('../lib/simulator.worker.ts', import.meta.url), { type: 'module' })
      const id = Date.now()
      worker.onerror = (e) => {
        e.preventDefault()
        setError(e.message || 'The simulation failed.')
        setRunning(false)
        worker?.terminate()
      }
      worker.onmessage = (e: MessageEvent<SimResponse>) => {
        if (e.data.id !== id) return
        if (e.data.kind === 'main') {
          setMain(e.data)
          setMainFor({ key, decks })
        } else {
          setScenarios(e.data)
          setScenariosFor({ key, decks })
          setRunning(false)
          worker?.terminate()
        }
      }
      const withCurrent = (list: number[], v: number) => [...new Set([...list, v])].sort((a, b) => a - b)
      worker.postMessage({
        id,
        decks,
        settings: current,
        scenarioNewPerDay: withCurrent(SCENARIO_NEW_PER_DAY, current.newPerDay),
        scenarioRetention: retentionScenarioValues(decks, current),
        scenarioRuns: 8,
      } satisfies SimRequest)
    }, 250)
    return () => {
      clearTimeout(timer)
      worker?.terminate()
    }
  }, [decks, key, unavailable, enabled])

  // A run cancelled because the selection became empty never reports back, so don't keep showing "updating"
  const current = (run: typeof mainFor) => run?.key === key && run.decks === decks
  // `settled`: `main` answers these settings and cards, not earlier ones. `scenariosSettled`: likewise for `scenarios`
  return {
    main,
    scenarios,
    running: running && !unavailable,
    settled: current(mainFor),
    scenariosSettled: current(scenariosFor),
    error,
    unavailable,
  }
}
