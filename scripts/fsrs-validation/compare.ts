// Checks this app's FSRS calibration, replay and simulator against Anki's own engine.
//
//   node scripts/fsrs-validation/compare.ts
//
// Reads data/collection.anki2 (read-only) and data/fsrs-validation/anki.json (from anki_export.py).
// Prints aggregate numbers only; writes nothing.

import { existsSync, readFileSync } from 'node:fs'
import { readAnkiData } from '../../server/anki.ts'
import { fsrsHistory } from '../../server/fsrsData.ts'
import { DatabaseSync } from 'node:sqlite'
import { ankiDayKey, dayNumber } from '../../src/lib/dates.ts'
import { replay, retrievability, step, type MemoryState, type Rating } from '../../src/lib/fsrs.ts'
import { buildSimDecks, simulate } from '../../src/lib/simulator.ts'

const COLLECTION = 'data/collection.anki2'
const ANKI = 'data/fsrs-validation/anki.json'
if (!existsSync(ANKI)) throw new Error(`${ANKI} is missing: run anki_export.py first (see README.md in this folder)`)

interface AnkiGroup {
  params: number[]
  paramsOptimisedInPreset: boolean
  states: Record<string, [number, number, number | null, number | null][]> // [time s, button, S, D]
  evaluation: Record<string, { logLoss: number; rmseBins: number }>
  optimised: { params: number[]; fsrsItems: number; healthCheckPassed: boolean }
  simulator: Record<string, { reviews: number[] }>
}
const anki = JSON.parse(readFileSync(ANKI, 'utf8')) as { ankiVersion: string; groups: Record<string, AnkiGroup> }
const data = readAnkiData(COLLECTION)
if (!data.fsrs) throw new Error(`FSRS data unavailable: ${data.fsrsError ?? 'FSRS is off'}`)
const fsrs = data.fsrs
const db = new DatabaseSync(COLLECTION, { readOnly: true })
const rollover = Number(JSON.parse(String(db.prepare("SELECT val FROM config WHERE key = 'rollover'").get()?.val ?? '4')))
const dayOf = (ms: number) => dayNumber(ankiDayKey(ms, rollover))
const pct = (x: number) => `${(x * 100).toFixed(2)}%`

interface Rev {
  id: number
  cid: number
  ease: number
  type: number
  time: number
  lastIvl: number
  factor: number
}
// Stability Anki stored in cards.data (null/invalid JSON or no state: left out)
const stored = new Map<number, number>()
for (const r of db.prepare('SELECT id, data FROM cards').all()) {
  try {
    const d: unknown = JSON.parse(String(r.data || '{}'))
    if (d && typeof d === 'object' && 's' in d && typeof d.s === 'number') stored.set(Number(r.id), d.s)
  } catch {
    // not card data
  }
}
const revlogOf = new Map<number, Rev[]>()
for (const r of db.prepare('SELECT id, cid, ease, type, time, lastIvl, factor FROM revlog ORDER BY id').all()) {
  const e: Rev = {
    id: Number(r.id),
    cid: Number(r.cid),
    ease: Number(r.ease),
    type: Number(r.type),
    time: Number(r.time),
    lastIvl: Number(r.lastIvl),
    factor: Number(r.factor),
  }
  ;(revlogOf.get(e.cid) ?? revlogOf.set(e.cid, []).get(e.cid)!).push(e)
}

console.log(`Anki ${anki.ankiVersion} engine vs this app\n`)
for (const [group, a] of Object.entries(anki.groups)) {
  const preset = fsrs.presets.find((p) => p.deckId === group)
  const w = preset?.params ?? a.params
  console.log(`== ${group} (${preset?.paramsSource ?? '?'} parameters, desired retention ${preset?.desiredRetention.toFixed(2)})`)

  // 1. Calibration sample variants, and agreement of states and predictions with Anki
  type Acc = { n: number; pass: number; pred: number; logLoss: number }
  const acc = new Map<string, Acc>()
  const add = (k: string, passed: boolean, p: number) => {
    const s = acc.get(k) ?? acc.set(k, { n: 0, pass: 0, pred: 0, logLoss: 0 }).get(k)!
    const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6)
    s.n++
    s.pass += passed ? 1 : 0
    s.pred += p
    s.logLoss -= Math.log(passed ? q : 1 - q)
  }
  let compared = 0
  let sMatch = 0
  let dMatch = 0
  let rDiffMax = 0
  let storedCards = 0
  let storedMismatch = 0
  let storedMismatchAnkiAgrees = 0
  let ratioSum = 0
  let ratioN = 0
  for (const [cidText, ankiRevs] of Object.entries(a.states)) {
    const cid = Number(cidText)
    const h = fsrsHistory(revlogOf.get(cid) ?? [])
    if (!h.length) continue
    const days = h.map((e) => dayOf(e.id))
    const { predicted, state: final } = replay(
      h.map((e, i) => ({ day: days[i], rating: e.ease as Rating })),
      w,
    )
    const ankiAt = new Map(ankiRevs.map((e) => [e[0], e]))
    let state: MemoryState | null = null
    let prevAnki: { s: number; day: number } | null = null
    h.forEach((e, i) => {
      state = step(state, e.ease as Rating, i ? days[i] - days[i - 1] : 0, w)
      const ae = ankiAt.get(Math.floor(e.id / 1000))
      if (!Number.isNaN(predicted[i])) {
        add('B. all review types, gap of 1+ days', e.ease > 1, predicted[i])
        if (e.type === 1) {
          add('A. review cards only (as the app does)', e.ease > 1, predicted[i])
          add('C. sensitivity only: Hard counted as lapse', e.ease > 2, predicted[i])
          if (e.lastIvl > 0) {
            ratioSum += (days[i] - days[i - 1]) / e.lastIvl
            ratioN++
          }
          if (prevAnki) rDiffMax = Math.max(rDiffMax, Math.abs(retrievability(days[i] - prevAnki.day, prevAnki.s, w) - predicted[i]))
        }
      }
      if (!ae || ae[2] === null || ae[3] === null) return
      compared++
      if (Math.abs(state.stability / ae[2] - 1) < 0.01) sMatch++
      if (Math.abs(state.difficulty - ae[3]) < 0.01) dMatch++
      prevAnki = { s: ae[2], day: days[i] }
    })
    // Stored state (cards.data) vs replay vs Anki's recomputation
    const st = stored.get(cid)
    if (st !== undefined && final && h[0].type === 0) {
      storedCards++
      if (Math.abs(final.stability / st - 1) >= 0.01) {
        storedMismatch++
        const last = ankiRevs.filter((e) => e[2] !== null).at(-1)
        if (last && last[2] !== null && Math.abs(final.stability / last[2] - 1) < 0.01) storedMismatchAnkiAgrees++
      }
    }
  }
  console.log('  Calibration samples (predicted = FSRS recall just before the review):')
  for (const [k, s] of [...acc.entries()].sort()) printRow(k, s)
  console.log(`  Reviews done on time: mean elapsed / scheduled interval = ${(ratioSum / ratioN).toFixed(2)}`)
  console.log(`  Replay vs Anki, every review: stability ${sMatch}/${compared}, difficulty ${dMatch}/${compared}; max |predicted recall diff| ${rDiffMax.toFixed(5)}`)
  console.log(`  Stored states (cards.data): ${storedCards - storedMismatch}/${storedCards} match the replay; of the ${storedMismatch} others, Anki's recomputation agrees with the replay for ${storedMismatchAnkiAgrees}`)

  // 2. Anki's evaluation
  const ev = a.evaluation
  console.log(`  Anki evaluation: preset parameters log loss ${ev.presetParams.logLoss.toFixed(4)}, RMSE ${pct(ev.presetParams.rmseBins)}`)
  console.log(`                   optimised (time-split) log loss ${ev.optimisedCrossValidated.logLoss.toFixed(4)}, RMSE ${pct(ev.optimisedCrossValidated.rmseBins)}`)
  console.log(`                   optimised (in-sample)  log loss ${ev.optimisedInSample.logLoss.toFixed(4)}, RMSE ${pct(ev.optimisedInSample.rmseBins)}`)
  console.log(`  Anki optimiser: ${a.optimised.fsrsItems} items, health check ${a.optimised.healthCheckPassed ? 'passed' : 'failed'}, initial stability (A/H/G/E) ${a.optimised.params.slice(0, 4).map((x) => x.toFixed(1)).join(' / ')} days (preset: ${w.slice(0, 4).map((x) => x.toFixed(1)).join(' / ')})`)

  // 3. Simulator: review events per period (no first-day learning answers, no relearning steps)
  const decks = buildSimDecks(fsrs, ankiDayKey(Date.now(), rollover)).map((d) => ({ ...d, learningReviewsPerNewCard: 0, relearnSteps: 0 }))
  console.log('  Simulator, review events (ours, 24 runs / Anki):')
  for (const [newText, sim] of Object.entries(a.simulator)) {
    const res = simulate(decks, { deckIds: [group], newPerDay: Number(newText), studyDaysPerWeek: 7, runs: 24, seed: 20261103, recall: 'fsrs', startWeekday: 0 })
    const cells = [30, 90, 365].map((h) => {
      const ours = res.days.slice(0, h).reduce((n, d) => n + d.total, 0)
      const theirs = sim.reviews.slice(0, h).reduce((n, x) => n + x, 0)
      return `${h}d ${Math.round(ours)} / ${theirs} (${theirs ? `${ours >= theirs ? '+' : ''}${((ours / theirs - 1) * 100).toFixed(0)}%` : 'n/a'})`
    })
    console.log(`    ${newText.padStart(2)} new/day: ${cells.join('  ')}`)
  }
  console.log('')
}

function printRow(label: string, s: { n: number; pass: number; pred: number; logLoss: number }) {
  console.log(`    ${label.padEnd(42)} n ${String(s.n).padStart(5)}  actual ${pct(s.pass / s.n)}  predicted ${pct(s.pred / s.n)}  log loss ${(s.logLoss / s.n).toFixed(4)}`)
}
