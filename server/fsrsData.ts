// FSRS data for the dashboard: current memory states (as Anki stored them), preset settings,
// measured answer behaviour, and a replay of the review log to reconstruct past predictions.

import { existsSync, readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type {
  CardPreset,
  CalibrationBin,
  CalibrationPoint,
  DeckBehaviour,
  DeckPreset,
  FsrsCard,
  FsrsData,
} from '../src/data/types.ts'
import { ankiDayKey, dayNumber, keyFromDayNumber } from '../src/lib/dates.ts'
import { DEFAULT_PARAMS, replay, toFsrs6Params, type MemoryState, type Rating } from '../src/lib/fsrs.ts'
import { readConfigJson } from './ankiConfig.ts'
import { firstBytes, firstFloat, firstVarint, floats, parseProto } from './protobuf.ts'

const MATURE_DAYS = 21
const WINDOW_DAYS = 180 // window for measured answer behaviour
const BIN_EDGES = [0, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0001]

interface Context {
  db: DatabaseSync
  deckGroup: Map<number, string> // Anki deck id -> dashboard deck id
  excludedDecks: Set<number>
  dayStartHour: number
  groupIds: string[]
  now: number // ms
}

interface RevlogRow {
  id: number
  cid: number
  ease: number
  type: number
  time: number
  lastIvl: number
  factor: number
}

// DeckConfig.Config field numbers (anki/proto/anki/deck_config.proto), checked against Anki 26.9.3's
// bundled descriptor and against blobs it writes (src/lib/fixtures/anki-fsrs-reference.json).
const CONFIG = {
  learnSteps: 1,
  relearnSteps: 2,
  fsrsParams: [6, 5, 3], // fsrs_params_6, _5, _4: Anki uses the newest one that isn't empty
  newPerDay: 9,
  reviewsPerDay: 10,
  maxInterval: 16,
  desiredRetention: 37,
}

export function readPreset(blob: Uint8Array) {
  const f = parseProto(blob)
  // The newest non-empty parameter set, upgraded to FSRS-6 as Anki's engine does (FSRS-4.5 has 17, FSRS-5 19)
  const stored = CONFIG.fsrsParams.map((n) => floats(f, n)).find((p) => p.length > 0) ?? []
  const params = toFsrs6Params(stored)
  // Protobuf (proto3) leaves out fields that hold 0, so a missing daily limit means 0 ("no new cards").
  // Only a blob with no readable fields at all falls back to Anki's defaults.
  const limit = (n: number, fallback: number) => firstVarint(f, n) ?? (f.size ? 0 : fallback)
  return {
    learnSteps: floats(f, CONFIG.learnSteps),
    relearnSteps: floats(f, CONFIG.relearnSteps),
    newPerDay: limit(CONFIG.newPerDay, 20),
    reviewsPerDay: limit(CONFIG.reviewsPerDay, 200),
    // 0 isn't a valid maximum interval or desired retention, so absence means unreadable: use the defaults
    maxInterval: firstVarint(f, CONFIG.maxInterval) || 36500,
    desiredRetention: firstFloat(f, CONFIG.desiredRetention) || 0.9,
    params: params ?? [...DEFAULT_PARAMS],
    paramsSource: (params ? 'optimised' : 'default') as DeckPreset['paramsSource'],
  }
}

// Day numbers are small (days since the collection was created); larger values are Unix timestamps
// in seconds, which intraday learning cards keep even while buried or in preview.
const TIMESTAMP_MIN = 1_000_000_000

/** Anki day a card is due, from its raw due value; null if the value can't be a valid date. */
export function dueKey(raw: number, crtDay: number, dayKey: (ms: number) => string): string | null {
  if (!Number.isFinite(raw)) return null
  if (raw >= TIMESTAMP_MIN) return dayKey(raw * 1000)
  if (raw < 0 || raw > 100_000) return null // e.g. a filtered deck's queue position, not a date
  return keyFromDayNumber(crtDay + raw)
}

/** Preset id of a normal deck: DeckKind.normal (field 1) -> config_id (field 1). */
function presetIdOf(kind: Uint8Array): number | undefined {
  const normal = firstBytes(parseProto(kind), 1)
  return normal ? firstVarint(parseProto(normal), 1) : undefined
}

function ankiVersion(): string | null {
  const plist = '/Applications/Anki.app/Contents/Info.plist'
  if (!existsSync(plist)) return null
  const m = readFileSync(plist, 'utf8').match(/CFBundleShortVersionString<\/key>\s*<string>([^<]+)</)
  return m?.[1] ?? null
}

/** Review history Anki uses for FSRS: entries after the last "Forget" reset, without manual entries. */
/** A manual entry with ease 0 and factor 0 is a "Forget" reset. */
const isReset = (e: RevlogRow) => e.type === 4 && e.ease === 0 && e.factor === 0

export function fsrsHistory(entries: RevlogRow[]): RevlogRow[] {
  let start = 0
  entries.forEach((e, i) => {
    if (isReset(e)) start = i + 1
  })
  return entries.slice(start).filter((e) => e.type <= 3 && e.ease >= 1 && e.ease <= 4)
}

export function readFsrsData(ctx: Context): FsrsData {
  const { db, deckGroup, excludedDecks, dayStartHour, groupIds } = ctx
  const dayKey = (ms: number) => ankiDayKey(ms, dayStartHour)
  const keptGroup = (did: number) => (excludedDecks.has(did) ? undefined : deckGroup.get(did))

  const enabled = readConfigJson(db, 'fsrs') === true

  // Collection creation day: review-card due numbers count days from here.
  const crtSecs = Number(db.prepare('SELECT crt FROM col').get()!.crt)
  const crtDay = dayNumber(ankiDayKey(crtSecs * 1000 + dayStartHour * 3_600_000, dayStartHour))

  // --- Presets: each group shows the preset most of its cards use (limits, steps); cards keep their own ---
  const presetRows = new Map<number, { name: string; blob: Uint8Array }>()
  for (const r of db.prepare('SELECT id, name, config FROM deck_config').all()) {
    presetRows.set(Number(r.id), { name: String(r.name), blob: r.config as Uint8Array })
  }
  // Parsed presets, and the ones studied cards use (FsrsCard.preset indexes cardPresets)
  const parsed = new Map<number, ReturnType<typeof readPreset>>()
  const presetSettings = (id: number) => parsed.get(id) ?? parsed.set(id, readPreset(presetRows.get(id)!.blob)).get(id)!
  const cardPresets: CardPreset[] = []
  const cardPresetIndex = (id: number) => {
    let i = cardPresets.findIndex((p) => p.presetId === id)
    if (i < 0) {
      const p = presetSettings(id)
      i = cardPresets.push({
        presetId: id,
        presetName: presetRows.get(id)!.name,
        params: p.params,
        paramsSource: p.paramsSource,
        desiredRetention: p.desiredRetention,
        maxInterval: p.maxInterval,
      }) - 1
    }
    return i
  }
  const deckPreset = new Map<number, number>()
  for (const r of db.prepare('SELECT id, kind FROM decks').all()) {
    const id = presetIdOf(r.kind as Uint8Array)
    if (id !== undefined) deckPreset.set(Number(r.id), id)
  }
  // --- One pass over the cards: home deck, preset votes, current states, new/suspended counts ---
  const presetVotes = new Map<string, Map<number, number>>()
  const cardGroup = new Map<number, string>() // card id -> deck group, for the review log below
  const cardPresetId = new Map<number, number>() // card id -> preset of its home deck
  const cards: FsrsCard[] = []
  const newCards: Record<string, number> = {}
  const suspended: Record<string, number> = {}
  const missingState: Record<string, number> = {}
  const invalidDue: Record<string, number> = {}
  const storedState = new Map<number, MemoryState>()
  const add = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1)
  for (const r of db.prepare('SELECT id, did, odid, type, queue, due, odue, ivl, data FROM cards').all()) {
    // A card in a filtered deck keeps its home deck in odid and its real due value in odue
    const filtered = Number(r.odid) !== 0
    const home = filtered ? Number(r.odid) : Number(r.did)
    const group = keptGroup(home)
    if (!group) continue
    cardGroup.set(Number(r.id), group)
    const preset = deckPreset.get(home)
    if (preset !== undefined && presetRows.has(preset)) cardPresetId.set(Number(r.id), preset)
    if (preset !== undefined) {
      const votes = presetVotes.get(group) ?? presetVotes.set(group, new Map()).get(group)!
      votes.set(preset, (votes.get(preset) ?? 0) + 1)
    }
    const type = Number(r.type)
    const queue = Number(r.queue)
    if (queue === -1) {
      add(suspended, group)
      continue
    }
    if (type === 0) {
      add(newCards, group)
      continue
    }
    let data: { s?: unknown; d?: unknown; lrt?: unknown } = {}
    try {
      const parsed: unknown = JSON.parse(String(r.data || '{}'))
      // `null`, numbers or arrays are valid JSON but not card data: treat them as missing state
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed
    } catch {
      // invalid JSON: treated as missing state below
    }
    if (typeof data.s !== 'number' || typeof data.d !== 'number' || typeof data.lrt !== 'number') {
      add(missingState, group)
      continue
    }
    const dueRaw = Number(filtered ? r.odue : r.due)
    const due = dueKey(dueRaw, crtDay, dayKey)
    if (!due) {
      add(invalidDue, group)
      continue
    }
    storedState.set(Number(r.id), { stability: data.s, difficulty: data.d })
    const presetIndex = cardPresetId.has(Number(r.id)) ? cardPresetIndex(cardPresetId.get(Number(r.id))!) : undefined
    cards.push({
      deckId: group,
      stability: data.s,
      difficulty: data.d,
      lastReview: dayKey(data.lrt * 1000),
      due,
      interval: Math.max(0, Number(r.ivl)),
      state: type === 2 ? 'review' : type === 3 ? 'relearning' : 'learning',
      ...(presetIndex !== undefined && { preset: presetIndex }),
    })
  }

  const presets: DeckPreset[] = []
  for (const group of groupIds) {
    const votes = presetVotes.get(group)
    if (!votes) continue
    const presetId = [...votes].sort((a, b) => b[1] - a[1])[0][0]
    const row = presetRows.get(presetId)
    if (!row) continue
    presets.push({ deckId: group, presetId, presetName: row.name, ...presetSettings(presetId) })
  }
  // Each card uses its own home deck's preset, as Anki does; the group's preset is only a fallback
  const paramsFor = (cid: number, group: string) => {
    const id = cardPresetId.get(cid)
    return id !== undefined ? presetSettings(id).params : (presets.find((p) => p.deckId === group)?.params ?? [...DEFAULT_PARAMS])
  }

  // --- Review log: replay for calibration + validation, and measure behaviour ---
  const byCard = new Map<number, RevlogRow[]>()
  for (const r of db.prepare('SELECT id, cid, ease, type, time, lastIvl, factor FROM revlog ORDER BY id').all()) {
    const cid = Number(r.cid)
    if (!cardGroup.has(cid)) continue
    const row: RevlogRow = {
      id: Number(r.id),
      cid,
      ease: Number(r.ease),
      type: Number(r.type),
      time: Number(r.time),
      lastIvl: Number(r.lastIvl),
      factor: Number(r.factor),
    }
    ;(byCard.get(cid) ?? byCard.set(cid, []).get(cid)!).push(row)
  }

  const calib = new Map<string, CalibrationPoint>()
  const bins = new Map<string, CalibrationBin>()
  const validation = { cards: 0, stabilityMatched: 0, difficultyMatched: 0 }
  let resetCards = 0
  let incompleteHistory = 0
  const windowStart = dayNumber(dayKey(ctx.now)) - WINDOW_DAYS
  const behaviour = new Map<string, DeckBehaviour & { timeSum: number; timeN: number; learnN: number }>()
  for (const g of groupIds) {
    behaviour.set(g, {
      deckId: g,
      firstRating: [0, 0, 0, 0],
      passRating: [0, 0, 0],
      reviewAgain: 0,
      secondsPerReview: 0,
      answers: 0,
      learningReviewsPerNewCard: 0,
      newCardsIntroduced: 0,
      timeSum: 0,
      timeN: 0,
      learnN: 0,
    })
  }

  for (const [cid, entries] of byCard) {
    const group = cardGroup.get(cid)!
    if (entries.some(isReset)) resetCards++
    const history = fsrsHistory(entries)
    if (history.length === 0) continue
    const days = history.map((e) => dayNumber(dayKey(e.id)))
    // A history that doesn't start with a learning answer can't be replayed from scratch: Anki seeds it
    // from SM-2 values. Its predictions are not reconstructed (never inferred), so it's left out below.
    const complete = history[0].type === 0
    if (!complete) incompleteHistory++
    const { state, predicted } = replay(
      history.map((e, i) => ({ day: days[i], rating: e.ease as Rating })),
      paramsFor(cid, group),
    )

    // Validation against Anki's stored state (only meaningful for a complete history)
    const stored = storedState.get(cid)
    if (stored && state && complete) {
      validation.cards++
      if (Math.abs(state.stability - stored.stability) / stored.stability < 0.01) validation.stabilityMatched++
      if (Math.abs(state.difficulty - stored.difficulty) < 0.01) validation.difficultyMatched++
    }

    const b = behaviour.get(group)!
    history.forEach((e, i) => {
      const passed = e.ease > 1
      if (days[i] >= windowStart) {
        b.timeSum += Math.min(e.time, 60_000) / 1000
        b.timeN++
        if (e.type === 1) {
          if (passed) b.passRating[e.ease - 2]++
          else b.reviewAgain++
        }
      }
      // Calibration: reviews of graduated cards with a replayed prior state and at least a day's gap
      if (!complete || e.type !== 1 || Number.isNaN(predicted[i])) return
      const month = keyFromDayNumber(days[i]).slice(0, 7)
      const key = `${month}|${group}`
      const p = calib.get(key) ?? {
        month,
        deckId: group,
        reviews: 0,
        passed: 0,
        predicted: 0,
        matureReviews: 0,
        maturePassed: 0,
        maturePredicted: 0,
      }
      p.reviews++
      p.predicted += predicted[i]
      if (passed) p.passed++
      if (e.lastIvl >= MATURE_DAYS) {
        p.matureReviews++
        p.maturePredicted += predicted[i]
        if (passed) p.maturePassed++
      }
      calib.set(key, p)
      const bi = BIN_EDGES.findIndex((edge, j) => predicted[i] >= edge && predicted[i] < BIN_EDGES[j + 1])
      const binKey = `${group}|${bi}`
      const bin = bins.get(binKey) ?? {
        deckId: group,
        from: BIN_EDGES[bi],
        to: Math.min(BIN_EDGES[bi + 1], 1),
        reviews: 0,
        passed: 0,
        predicted: 0,
      }
      bin.reviews++
      bin.predicted += predicted[i]
      if (passed) bin.passed++
      bins.set(binKey, bin)
    })

    // New-card behaviour: first answer, and same-day learning answers on the introduction day
    if (history[0].type === 0 && days[0] >= windowStart) {
      b.firstRating[history[0].ease - 1]++
      b.newCardsIntroduced++
      b.learnN += history.filter((e, i) => e.type === 0 && days[i] === days[0]).length
    }
  }

  return {
    enabled,
    version: 'FSRS-6',
    ankiVersion: ankiVersion(),
    windowDays: WINDOW_DAYS,
    presets,
    cards,
    newCards,
    suspended,
    missingState,
    invalidDue,
    resetCards,
    incompleteHistory,
    cardPresets,
    calibration: [...calib.values()].sort((a, b) => a.month.localeCompare(b.month)),
    calibrationBins: [...bins.values()].sort((a, b) => a.deckId.localeCompare(b.deckId) || a.from - b.from),
    behaviour: [...behaviour.values()]
      .filter((b) => b.timeN > 0 || b.newCardsIntroduced > 0)
      .map(({ timeSum, timeN, learnN, ...b }) => ({
        ...b,
        secondsPerReview: timeN ? timeSum / timeN : 0,
        answers: timeN,
        learningReviewsPerNewCard: b.newCardsIntroduced ? learnN / b.newCardsIntroduced : 0,
      })),
    validation,
  }
}
