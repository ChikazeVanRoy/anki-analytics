// Monte Carlo review-workload simulator using FSRS-6 scheduling.
//
// Each simulated day: cards that are due get reviewed (up to the preset's daily review limit), a
// recall outcome is drawn from FSRS's predicted retrievability, the rating comes from your measured
// answer mix, the memory state is updated with the FSRS-6 formulas, and the next interval is
// scheduled for the chosen desired retention (with Anki's interval fuzz). New cards are introduced
// each study day. Many runs give a range instead of a single number.
//
// Pure TypeScript (no React, no DOM), so it runs in a Web Worker and in tests.

import type { FsrsData } from '../data/types'
import { dayNumber } from './dates'
import { nextInterval, retrievability, step, type Rating } from './fsrs'

export const SIM_DAYS = 365 // always simulate a year; shorter horizons are prefixes of the same run
export const HORIZONS = [7, 30, 90, 180, 365] as const

export interface SimDeck {
  deckId: string
  params: number[]
  desiredRetention: number // the deck preset's value
  maxInterval: number
  reviewLimit: number
  newPool: number
  learnSteps: number // number of learning steps
  relearnSteps: number
  firstRating: number[] // probabilities of Again/Hard/Good/Easy on a new card's first answer
  passRating: number[] // probabilities of Hard/Good/Easy given a passed review
  failRatio: number // observed / FSRS-predicted lapses (for the "calibrated" recall model)
  learningReviewsPerNewCard: number // measured answers on a new card's first day
  cards: { s: number; d: number; lastDay: number; dueDay: number; interval: number }[] // days relative to today
}

export interface SimSettings {
  deckIds: string[]
  newPerDay: number // total across the selected decks
  /** Override for every selected deck; when omitted, each deck uses its own preset's desired retention. */
  desiredRetention?: number
  studyDaysPerWeek: number
  runs: number
  seed: number
  recall: 'fsrs' | 'calibrated'
  startWeekday: number // 0 = Monday, for today
  days?: number // defaults to SIM_DAYS
}

/** Per-day results, averaged over runs (and the 10th/90th percentile of the total). */
export interface SimDay {
  day: number
  study: boolean
  known: number // first review of existing cards (dates Anki has already scheduled)
  followUp: number // later reviews of existing cards (estimated)
  fresh: number // reviews of cards introduced during the simulation (estimated)
  total: number
  p10: number
  p90: number
  newIntroduced: number
  mature: number // cards with an interval of 21+ days at the end of the day
}

export interface SimResult {
  days: SimDay[]
  runs: number
  /** Per-run cumulative totals, so any horizon can be summarised with an exact range. */
  runTotals: Float64Array[] // [run][day] cumulative reviews up to and including that day
  runPeaks: Float64Array[] // [run][day] running maximum of daily reviews
  perDeck: { deckId: string; existing: Float64Array; fresh: Float64Array }[] // cumulative mean per day
  matureNow: number
  backlog: Float64Array // mean cards held back by the daily review limit (last study day's value on rest days)
}

/** Mulberry32: small, fast, seedable random generator, so runs are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sample = (probs: number[], r: number) => {
  let acc = 0
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i]
    if (r < acc) return i
  }
  return probs.length - 1
}

/** Anki's interval fuzz: a random spread that grows with the interval (none below 2.5 days). */
export function fuzzInterval(interval: number, max: number, r: number) {
  if (interval < 2.5) return Math.min(Math.max(Math.round(interval), 1), max)
  let delta = 1
  for (const [start, end, f] of [
    [2.5, 7, 0.15],
    [7, 20, 0.1],
    [20, Infinity, 0.05],
  ]) {
    delta += f * Math.max(Math.min(interval, end) - start, 0)
  }
  const lo = Math.max(2, Math.round(interval - delta))
  const hi = Math.round(interval + delta)
  return Math.min(lo + Math.floor(r * (hi - lo + 1)), max)
}

/**
 * Study days for a given number per week. Rest days are taken in this order:
 * Sunday, Saturday, Wednesday, Friday, Monday, Thursday.
 */
export function isStudyDay(weekday: number, perWeek: number) {
  const restOrder = [6, 5, 2, 4, 0, 3]
  return !restOrder.slice(0, 7 - Math.min(Math.max(Math.round(perWeek), 1), 7)).includes(weekday)
}

/** Spread `total` new cards across decks that still have new cards; leftovers go to the others. */
export function splitNew(total: number, pools: number[]) {
  const out = pools.map(() => 0)
  let left = total
  let open = pools.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0)
  while (left > 0 && open.length) {
    const share = Math.max(1, Math.floor(left / open.length))
    for (const i of open) {
      const n = Math.min(share, pools[i] - out[i], left)
      out[i] += n
      left -= n
      if (left === 0) break
    }
    open = open.filter((i) => out[i] < pools[i])
  }
  return out
}

/** Builds simulator inputs from the API's FSRS data, relative to Anki's `today`. */
export function buildSimDecks(fsrs: FsrsData, todayKey: string): SimDeck[] {
  const today = dayNumber(todayKey)
  return fsrs.presets.map((p) => {
    const b = fsrs.behaviour.find((x) => x.deckId === p.deckId)
    const norm = (xs: number[], fallback: number[]) => {
      const sum = xs.reduce((a, x) => a + x, 0)
      return sum > 0 ? xs.map((x) => x / sum) : fallback
    }
    // Lapse calibration: observed lapses vs FSRS's expectation, smoothed by half a lapse
    const cal = fsrs.calibration.filter((c) => c.deckId === p.deckId)
    const observed = cal.reduce((n, c) => n + c.reviews - c.passed, 0)
    const expected = cal.reduce((n, c) => n + c.reviews - c.predicted, 0)
    return {
      deckId: p.deckId,
      params: p.params,
      desiredRetention: p.desiredRetention,
      maxInterval: p.maxInterval,
      reviewLimit: p.reviewsPerDay,
      newPool: fsrs.newCards[p.deckId] ?? 0,
      learnSteps: p.learnSteps.length,
      relearnSteps: p.relearnSteps.length,
      // Fallbacks are FSRS's published defaults, used only if a deck has no measured history
      firstRating: norm(b?.firstRating ?? [], [0.24, 0.094, 0.495, 0.171]),
      passRating: norm(b?.passRating ?? [], [0.224, 0.631, 0.145]),
      failRatio: expected > 0 ? Math.min(Math.max((observed + 0.5) / expected, 0.01), 3) : 1,
      learningReviewsPerNewCard: b && b.newCardsIntroduced > 0 ? b.learningReviewsPerNewCard : 1 + p.learnSteps.length,
      cards: fsrs.cards
        .filter((c) => c.deckId === p.deckId)
        .map((c) => ({
          s: c.stability,
          d: c.difficulty,
          lastDay: dayNumber(c.lastReview) - today,
          dueDay: Math.max(dayNumber(c.due) - today, 0), // overdue cards are due today
          interval: c.interval,
        })),
    }
  })
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

export function simulate(allDecks: SimDeck[], settings: SimSettings): SimResult {
  const H = settings.days ?? SIM_DAYS
  const decks = allDecks.filter((d) => settings.deckIds.includes(d.deckId))
  const R = settings.runs
  const retentionOf = (deck: SimDeck) => settings.desiredRetention ?? deck.desiredRetention

  const daily = { known: new Float64Array(H), followUp: new Float64Array(H), fresh: new Float64Array(H) }
  const newIntro = new Float64Array(H)
  const matureSum = new Float64Array(H)
  const backlog = new Float64Array(H)
  const perRunDaily: Float64Array[] = []
  const perDeck = decks.map((d) => ({ deckId: d.deckId, existing: new Float64Array(H), fresh: new Float64Array(H) }))
  const study = Array.from({ length: H }, (_, i) => isStudyDay((settings.startWeekday + i) % 7, settings.studyDaysPerWeek))
  const matureNow = decks.reduce((n, d) => n + d.cards.filter((c) => c.interval >= 21).length, 0)

  for (let run = 0; run < R; run++) {
    const rand = rng(settings.seed + run * 7919)
    const runDaily = new Float64Array(H)
    // Card store (struct of arrays for speed)
    const cap = decks.reduce((n, d) => n + d.cards.length + Math.min(d.newPool, settings.newPerDay * H), 0) + 1
    const S = new Float64Array(cap)
    const D = new Float64Array(cap)
    const last = new Int32Array(cap)
    const ivl = new Int32Array(cap)
    const deckOf = new Uint8Array(cap)
    const origin = new Uint8Array(cap) // 0 existing (not yet reviewed), 1 existing (reviewed), 2 new
    const buckets: number[][][] = decks.map(() => Array.from({ length: H }, () => []))
    const carry: number[][] = decks.map(() => [])
    let n = 0
    let mature = matureNow
    decks.forEach((deck, di) => {
      for (const c of deck.cards) {
        S[n] = c.s
        D[n] = c.d
        last[n] = c.lastDay
        ivl[n] = c.interval
        deckOf[n] = di
        origin[n] = 0
        if (c.dueDay < H) buckets[di][c.dueDay].push(n)
        n++
      }
    })
    const pools = decks.map((d) => d.newPool)

    const schedule = (c: number, day: number, di: number) => {
      const deck = decks[di]
      const wasMature = ivl[c] >= 21
      const raw = nextInterval(S[c], retentionOf(deck), deck.params)
      ivl[c] = fuzzInterval(Math.min(raw, deck.maxInterval), deck.maxInterval, rand())
      last[c] = day
      if (wasMature !== ivl[c] >= 21) mature += ivl[c] >= 21 ? 1 : -1
      const due = day + ivl[c]
      if (due < H) buckets[di][due].push(c)
    }

    let limited = 0 // cards held back by the review limit on the most recent study day
    for (let day = 0; day < H; day++) {
      let waiting = 0
      for (let di = 0; di < decks.length; di++) {
        const deck = decks[di]
        const queue = carry[di].length ? carry[di].concat(buckets[di][day]) : buckets[di][day]
        buckets[di][day] = []
        if (!study[day]) {
          carry[di] = queue // rest day: everything waits for the next study day
          continue
        }
        const todays = queue.length > deck.reviewLimit ? queue.slice(0, deck.reviewLimit) : queue
        carry[di] = queue.length > deck.reviewLimit ? queue.slice(deck.reviewLimit) : []
        waiting += carry[di].length
        for (const c of todays) {
          const elapsed = Math.max(day - last[c], 0)
          const r = retrievability(elapsed, S[c], deck.params)
          const pFail = settings.recall === 'calibrated' ? (1 - r) * deck.failRatio : 1 - r
          let reviews = 1
          let state = { stability: S[c], difficulty: D[c] }
          if (rand() >= pFail) {
            state = step(state, (2 + sample(deck.passRating, rand())) as Rating, elapsed, deck.params)
          } else {
            state = step(state, 1, elapsed, deck.params)
            // Relearning steps the same day, each answered Good
            for (let k = 0; k < deck.relearnSteps; k++) state = step(state, 3, 0, deck.params)
            reviews += deck.relearnSteps
          }
          S[c] = state.stability
          D[c] = state.difficulty
          if (origin[c] === 2) {
            daily.fresh[day] += reviews
            perDeck[di].fresh[day] += reviews
          } else {
            ;(origin[c] === 0 ? daily.known : daily.followUp)[day] += reviews
            perDeck[di].existing[day] += reviews
            origin[c] = 1
          }
          runDaily[day] += reviews
          schedule(c, day, di)
        }
      }

      // New cards
      if (study[day] && settings.newPerDay > 0) {
        const split = splitNew(settings.newPerDay, pools)
        for (let di = 0; di < decks.length; di++) {
          const deck = decks[di]
          for (let k = 0; k < split[di]; k++) {
            const c = n++
            const g = (sample(deck.firstRating, rand()) + 1) as Rating
            let state = step(null, g, 0, deck.params)
            // Learning steps until graduation, each answered Good: Again/Hard restart, Good advances, Easy graduates
            const stepsLeft = g === 4 ? 0 : g === 3 ? deck.learnSteps - 1 : deck.learnSteps
            for (let j = 0; j < stepsLeft; j++) state = step(state, 3, 0, deck.params)
            S[c] = state.stability
            D[c] = state.difficulty
            ivl[c] = 0
            deckOf[c] = di
            origin[c] = 2
            // Count the answers you actually give on a new card's first day (measured)
            const m = deck.learningReviewsPerNewCard
            const reviews = Math.floor(m) + (rand() < m - Math.floor(m) ? 1 : 0)
            daily.fresh[day] += reviews
            perDeck[di].fresh[day] += reviews
            runDaily[day] += reviews
            schedule(c, day, di)
          }
          pools[di] -= split[di]
          newIntro[day] += split[di]
        }
      }
      if (study[day]) limited = waiting
      matureSum[day] += mature
      backlog[day] += limited
    }
    perRunDaily.push(runDaily)
  }

  const runTotals: Float64Array[] = []
  const runPeaks: Float64Array[] = []
  for (const r of perRunDaily) {
    const tot = new Float64Array(H)
    const peak = new Float64Array(H)
    let acc = 0
    let mx = 0
    for (let i = 0; i < H; i++) {
      acc += r[i]
      mx = Math.max(mx, r[i])
      tot[i] = acc
      peak[i] = mx
    }
    runTotals.push(tot)
    runPeaks.push(peak)
  }

  const days: SimDay[] = Array.from({ length: H }, (_, i) => {
    const totals = perRunDaily.map((r) => r[i]).sort((a, b) => a - b)
    const known = daily.known[i] / R
    const followUp = daily.followUp[i] / R
    const fresh = daily.fresh[i] / R
    return {
      day: i,
      study: study[i],
      known,
      followUp,
      fresh,
      total: known + followUp + fresh,
      p10: percentile(totals, 0.1),
      p90: percentile(totals, 0.9),
      newIntroduced: newIntro[i] / R,
      mature: matureSum[i] / R,
    }
  })

  for (const pd of perDeck) {
    let e = 0
    let f = 0
    for (let i = 0; i < H; i++) {
      e += pd.existing[i] / R
      f += pd.fresh[i] / R
      pd.existing[i] = e
      pd.fresh[i] = f
    }
  }
  for (let i = 0; i < H; i++) backlog[i] /= R

  return { days, runs: R, runTotals, runPeaks, perDeck, matureNow, backlog }
}

export interface HorizonSummary {
  horizon: number
  total: { mean: number; p10: number; p90: number }
  avgPerDay: number // across all days, rest days included
  avgPerStudyDay: number
  peak: { mean: number; p90: number }
  avgMinutesPerStudyDay: number
  matureEnd: number
  newIntroduced: number
  backlogEnd: number
  /** Average reviews per study day over the last 30 days of the horizon (≈ steady state for long horizons). */
  finalWindowPerStudyDay: number
  finalWindowMinutes: number
  /** Heaviest 30-day stretch: highest average reviews per study day over any 30 consecutive days. */
  maxWindowPerStudyDay: number
  known: number
  followUp: number
  fresh: number
  perDeck: { deckId: string; existing: number; fresh: number }[]
}

export function summarise(res: SimResult, horizon: number, secondsPerReview: number): HorizonSummary {
  const h = Math.min(horizon, res.days.length)
  const last = h - 1
  const totals = res.runTotals.map((t) => t[last]).sort((a, b) => a - b)
  const peaks = res.runPeaks.map((p) => p[last]).sort((a, b) => a - b)
  const slice = res.days.slice(0, h)
  const studyDays = slice.filter((d) => d.study).length || 1
  const mean = totals.reduce((a, x) => a + x, 0) / totals.length
  const win = slice.slice(Math.max(0, h - 30))
  const winStudy = win.filter((d) => d.study)
  const winAvg = winStudy.reduce((a, d) => a + d.total, 0) / (winStudy.length || 1)
  let maxWindow = 0
  for (let start = 0; start + Math.min(30, h) <= h; start++) {
    const w = slice.slice(start, start + Math.min(30, h)).filter((d) => d.study)
    if (w.length) maxWindow = Math.max(maxWindow, w.reduce((a, d) => a + d.total, 0) / w.length)
  }
  return {
    horizon: h,
    total: { mean, p10: percentile(totals, 0.1), p90: percentile(totals, 0.9) },
    avgPerDay: mean / h,
    avgPerStudyDay: mean / studyDays,
    peak: { mean: peaks.reduce((a, x) => a + x, 0) / peaks.length, p90: percentile(peaks, 0.9) },
    avgMinutesPerStudyDay: ((mean / studyDays) * secondsPerReview) / 60,
    matureEnd: slice[last].mature,
    newIntroduced: slice.reduce((a, d) => a + d.newIntroduced, 0),
    backlogEnd: res.backlog[last],
    finalWindowPerStudyDay: winAvg,
    finalWindowMinutes: (winAvg * secondsPerReview) / 60,
    maxWindowPerStudyDay: maxWindow,
    known: slice.reduce((a, d) => a + d.known, 0),
    followUp: slice.reduce((a, d) => a + d.followUp, 0),
    fresh: slice.reduce((a, d) => a + d.fresh, 0),
    perDeck: res.perDeck.map((p) => ({ deckId: p.deckId, existing: p.existing[last], fresh: p.fresh[last] })),
  }
}

export const SCENARIO_RETENTION = [0.8, 0.85, 0.9, 0.95]
const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Desired-retention values to compare: the standard set plus whatever is actually in use, i.e. the
 * custom override, or each selected deck's own preset value, so the user's setting always has a bar.
 */
export function retentionScenarioValues(decks: SimDeck[], settings: Pick<SimSettings, 'deckIds' | 'desiredRetention'>) {
  const inUse =
    settings.desiredRetention !== undefined
      ? [settings.desiredRetention]
      : decks.filter((d) => settings.deckIds.includes(d.deckId)).map((d) => d.desiredRetention)
  return [...new Set([...SCENARIO_RETENTION, ...inUse.map(round2)])].sort((a, b) => a - b)
}

/** "90%", "85–92%", or "" when no deck is selected. */
export function presetRetentionLabel(values: number[]) {
  if (!values.length) return ''
  const pct = [...new Set(values.map((v) => Math.round(v * 100)))]
  return pct.length === 1 ? `${pct[0]}%` : `${Math.min(...pct)}–${Math.max(...pct)}%`
}
