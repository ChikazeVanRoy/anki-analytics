// FSRS-6 memory model, as used by Anki 25+ (formulas follow fsrs-rs, the library Anki uses).
// No imports, so the Node API and the browser can both use it.
//
// Memory state per card:
//   stability S  = days until recall probability falls to 90%
//   difficulty D = 1 (easy) … 10 (hard); Anki shows it as (D - 1) / 9 in percent
// Retrievability R = predicted probability of recalling the card right now.

export type Rating = 1 | 2 | 3 | 4 // Again, Hard, Good, Easy

/** Anki's definition of a mature card: an interval of 21 days or more. */
export const MATURE_DAYS = 21

export interface MemoryState {
  stability: number
  difficulty: number
}

/** FSRS-6 default parameters (fsrs-rs DEFAULT_PARAMETERS). Anki uses these until a preset is optimised. */
export const DEFAULT_PARAMS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483,
  0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]

/**
 * Turns a preset's stored parameters into FSRS-6's 21, as Anki's engine (fsrs-rs) does when it loads
 * an older preset. Returns null for any other length.
 * - FSRS-5 (19): no short-term power term (w19 = 0) and the fixed decay 0.5.
 * - FSRS-4.5 (17): also no same-day terms (w17 = w18 = 0); its linear initial difficulty
 *   w4 - w5·(G-3) and difficulty step are re-expressed for FSRS-5's exponential form.
 * Checked against Anki 26.9.3's states for an FSRS-4.5 preset (fixtures/anki-fsrs-reference.json).
 */
export function toFsrs6Params(stored: readonly number[]): number[] | null {
  if (stored.length === 21) return [...stored]
  if (stored.length === 19) return [...stored, 0, 0.5]
  if (stored.length === 17) {
    const w = [...stored]
    w[4] = w[5] * 2 + w[4]
    w[5] = Math.log(w[5] * 3 + 1) / 3
    w[6] = w[6] + 0.5
    return [...w, 0, 0, 0, 0.5]
  }
  return null
}

const S_MIN = 0.001
const S_MAX = 36500

const clampS = (s: number) => Math.min(Math.max(s, S_MIN), S_MAX)
const clampD = (d: number) => Math.min(Math.max(d, 1), 10)

/** Constant that makes R = 0.9 when elapsed time equals stability, for the parameter-defined decay. */
function factor(w: readonly number[]) {
  return Math.pow(0.9, -1 / w[20]) - 1
}

/** Probability of recall after `elapsedDays` with stability `s` (FSRS-6 power forgetting curve). */
export function retrievability(elapsedDays: number, s: number, w: readonly number[] = DEFAULT_PARAMS): number {
  if (s <= 0) return 0
  return Math.pow(1 + (factor(w) * Math.max(elapsedDays, 0)) / s, -w[20])
}

/** Days until R falls to `desiredRetention` (unrounded, before fuzz and limits). */
export function nextInterval(s: number, desiredRetention: number, w: readonly number[] = DEFAULT_PARAMS): number {
  return (s / factor(w)) * (Math.pow(desiredRetention, -1 / w[20]) - 1)
}

const initStability = (g: Rating, w: readonly number[]) => clampS(w[g - 1])
const initDifficultyRaw = (g: Rating, w: readonly number[]) => w[4] - Math.exp(w[5] * (g - 1)) + 1

function nextDifficulty(d: number, g: Rating, w: readonly number[]) {
  const delta = -w[6] * (g - 3)
  const damped = d + (delta * (10 - d)) / 9 // linear damping: changes shrink as D approaches 10
  return clampD(w[7] * initDifficultyRaw(4, w) + (1 - w[7]) * damped) // mean reversion
}

function recallStability(d: number, s: number, r: number, g: Rating, w: readonly number[]) {
  const hard = g === 2 ? w[15] : 1
  const easy = g === 4 ? w[16] : 1
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard * easy)
}

function forgetStability(d: number, s: number, r: number, w: readonly number[]) {
  const longTerm = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14])
  return Math.min(longTerm, s / Math.exp(w[17] * w[18]))
}

/**
 * Same-day review (learning/relearning steps). Only Again can lower stability: for Hard, Good and
 * Easy the increase is floored at 1, as in Anki's engine (checked against Anki 26.9.3, see
 * fixtures/anki-fsrs-reference.json).
 */
function shortTermStability(s: number, g: Rating, w: readonly number[]) {
  let inc = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(s, -w[19])
  if (g >= 2) inc = Math.max(inc, 1)
  return s * inc
}

/**
 * Memory state after one review. `elapsedDays` is whole Anki days since the previous review
 * (0 = same day, which uses the short-term formula). `state` is null for a card's first review.
 */
export function step(state: MemoryState | null, g: Rating, elapsedDays: number, w: readonly number[] = DEFAULT_PARAMS) {
  if (!state) return { stability: initStability(g, w), difficulty: clampD(initDifficultyRaw(g, w)) }
  const { stability: s, difficulty: d } = state
  let next: number
  if (elapsedDays === 0) next = shortTermStability(s, g, w)
  else {
    const r = retrievability(elapsedDays, s, w)
    next = g === 1 ? forgetStability(d, s, r, w) : recallStability(d, s, r, g, w)
  }
  return { stability: clampS(next), difficulty: nextDifficulty(d, g, w) }
}

/** Replays a card's reviews (oldest first). Each entry: whole Anki-day number and rating. */
export function replay(reviews: { day: number; rating: Rating }[], w: readonly number[] = DEFAULT_PARAMS) {
  let state: MemoryState | null = null
  let lastDay = 0
  const predicted: number[] = [] // R just before each review (NaN for the first)
  const states: MemoryState[] = [] // the state after each review
  for (const { day, rating } of reviews) {
    predicted.push(state && day > lastDay ? retrievability(day - lastDay, state.stability, w) : NaN)
    state = step(state, rating, state ? day - lastDay : 0, w)
    states.push(state)
    lastDay = day
  }
  return { state, predicted, states }
}

/** Anki shows difficulty as a percentage: D 1 -> 0%, D 10 -> 100%. */
export const difficultyPercent = (d: number) => (d - 1) / 9
