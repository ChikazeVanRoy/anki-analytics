// FSRS data for the dashboard: current memory states (as Anki stored them), preset settings,
// measured answer behaviour, and a replay of the review log to reconstruct past predictions.

import { existsSync, readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type {
  CardPreset,
  CalibrationBin,
  CalibrationDay,
  CalibrationPoint,
  DeckBehaviour,
  DeckPreset,
  FsrsCard,
  FsrsData,
  KnowledgePoint,
  TroubleCard,
} from '../src/data/types.ts'
import { ankiDayKey, dayNumber, keyFromDayNumber } from '../src/lib/dates.ts'
import { DEFAULT_PARAMS, MATURE_DAYS, replay, retrievability, toFsrs6Params, type MemoryState, type Rating } from '../src/lib/fsrs.ts'
import { readConfigJson } from './ankiConfig.ts'
import { cardTextReader } from './cardText.ts'
import { firstBytes, firstFloat, firstVarint, floats, parseProto } from './protobuf.ts'

const WINDOW_DAYS = 180 // window for measured answer behaviour
const BIN_EDGES = [0, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0001]
const KNOWLEDGE_POINTS = 60 // most days the knowledge curve is sampled on, per deck
const TROUBLE_WINDOW_DAYS = 90
const TROUBLE_MIN_ANSWERS = 3 // Again or Hard answers in the window that make a card worth listing
const TROUBLE_MAX_CARDS = 30
const GARDEN_TEXT_CARDS = 5_000 // above this, the garden goes without card text to keep the answer small
const CARD_TEXT_COLUMNS = 'c.id AS id, c.ord AS ord, n.mid AS mid, n.flds AS flds, n.sfld AS sfld'

interface Context {
  db: DatabaseSync
  deckGroup: Map<number, string> // Anki deck id -> dashboard deck id
  excludedDecks: Set<number>
  dayStartHour: number
  groupIds: string[]
  now: number // ms
  copiedAt: number // ms, when the copy being read was made
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

/**
 * A deck's own daily limits, which beat its preset's: "This deck" (Deck.Normal.review_limit / new_limit) and "Today only"
 * (review_limit_today / new_limit_today, which only count on the Anki day they were set for, `ankiDay`, days since the
 * collection was created). A limit that isn't set here is null, meaning the preset's applies.
 */
export function readDeckLimits(kind: Uint8Array, ankiDay: number): { newPerDay: number | null; reviewsPerDay: number | null } {
  const normal = firstBytes(parseProto(kind), 1)
  if (!normal) return { newPerDay: null, reviewsPerDay: null }
  const f = parseProto(normal)
  const pick = (todayField: number, deckField: number) => {
    const t = firstBytes(f, todayField)
    if (t) {
      const day = parseProto(t)
      if ((firstVarint(day, 2) ?? 0) === ankiDay) return firstVarint(day, 1) ?? 0
    }
    return firstVarint(f, deckField) ?? null
  }
  return { reviewsPerDay: pick(8, 6), newPerDay: pick(9, 7) }
}

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

/** A manual entry with ease 0 and factor 0 is a "Forget" reset. */
const isReset = (e: RevlogRow) => e.type === 4 && e.ease === 0 && e.factor === 0
/** A filtered-deck answer with factor 0 didn't reschedule the card, so Anki leaves it out of FSRS. */
const isCram = (e: RevlogRow) => e.type === 3 && e.factor === 0

/**
 * Review history Anki uses for FSRS, as reviews_for_fsrs does in its scheduler: working back from the latest entry, from
 * the start of the last run of learning answers (older Ankis logged no reset, so those can't be relied on), else from
 * after the last "Forget". Manual and cram entries aren't reviews.
 */
export function fsrsHistory(entries: RevlogRow[]): RevlogRow[] {
  let start = 0
  let learning = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (isCram(e)) continue
    if (e.type === 0 && e.ease >= 1) learning = i
    else if (isReset(e)) {
      start = i + 1
      break
    } else if (learning >= 0) break
  }
  return entries.slice(learning >= 0 ? learning : start).filter((e) => e.type <= 3 && e.ease >= 1 && e.ease <= 4 && !isCram(e))
}

/** The days to sample, oldest first, always ending today. */
export function sampleDays(first: number, today: number, points = KNOWLEDGE_POINTS): number[] {
  const every = Math.max(1, Math.ceil((today - first) / Math.max(1, points - 1)))
  const out: number[] = []
  for (let d = today; d >= first; d -= every) out.unshift(d)
  return out
}

export function readFsrsData(ctx: Context): FsrsData {
  const { db, deckGroup, excludedDecks, dayStartHour, groupIds } = ctx
  const dayKey = (ms: number) => ankiDayKey(ms, dayStartHour)
  const keptGroup = (did: number) => (excludedDecks.has(did) ? undefined : deckGroup.get(did))

  const enabled = readConfigJson(db, 'fsrs') === true

  // Collection creation day: review-card due numbers count days from here.
  const crtSecs = Number(db.prepare('SELECT crt FROM col').get()!.crt)
  const crtDay = dayNumber(ankiDayKey(crtSecs * 1000 + dayStartHour * 3_600_000, dayStartHour))

  // Anki unburies when it first opens on a new day, so a card may still say buried from an earlier day. One
  // changed today stays buried whatever `lastUnburied` says, as it may have been buried on another device
  const lastUnburied = readConfigJson(db, 'lastUnburied')
  const todayKey = dayKey(ctx.now)
  const unburyPending = typeof lastUnburied === 'number' && lastUnburied < dayNumber(todayKey) - crtDay
  const isBuried = (queue: number, modSecs: number) =>
    (queue === -2 || queue === -3) && (!unburyPending || dayKey(modSecs * 1000) === todayKey)

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
  // The Anki day "Today only" limits are judged against: the same clock as everything else here (`todayKey`), since
  // the dashboard's estimates are about today
  const ankiDay = dayNumber(todayKey) - crtDay
  // What studying a dashboard deck allows per day: each top-level deck's own limit, else its preset's (Anki caps a
  // sub-deck by its parents, so the top deck is the one that sets the day's total). A merged group adds its tops up.
  const groupLimits = new Map<string, { newPerDay: number; reviewsPerDay: number }>()
  for (const r of db.prepare('SELECT id, name, kind FROM decks').all()) {
    const id = Number(r.id)
    const preset = presetIdOf(r.kind as Uint8Array)
    if (preset !== undefined) deckPreset.set(id, preset)
    const group = keptGroup(id)
    if (!group || String(r.name).includes('\x1f') || preset === undefined || !presetRows.has(preset)) continue
    const own = readDeckLimits(r.kind as Uint8Array, ankiDay)
    const base = presetSettings(preset)
    const total = groupLimits.get(group) ?? groupLimits.set(group, { newPerDay: 0, reviewsPerDay: 0 }).get(group)!
    total.newPerDay += own.newPerDay ?? base.newPerDay
    total.reviewsPerDay += own.reviewsPerDay ?? base.reviewsPerDay
  }
  // --- One pass over the cards: home deck, preset votes, current states, new/suspended counts ---
  const presetVotes = new Map<string, Map<number, number>>()
  const cardGroup = new Map<number, string>() // card id -> deck group, for the review log below
  const cardPresetId = new Map<number, number>() // card id -> preset of its home deck
  const cards: FsrsCard[] = []
  const cardById = new Map<number, FsrsCard>()
  const newCards: Record<string, number> = {}
  const buriedNew: Record<string, number> = {}
  const suspended: Record<string, number> = {}
  const missingState: Record<string, number> = {}
  const invalidDue: Record<string, number> = {}
  const proven: Record<string, number> = {}
  const matureNow = new Set<number>() // cards counted as "known well" today
  const storedState = new Map<number, MemoryState>()
  const add = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1)
  for (const r of db.prepare('SELECT id, did, odid, type, queue, due, odue, ivl, mod, data FROM cards').all()) {
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
    if (queue !== -1 && type === 2 && Number(r.ivl) >= MATURE_DAYS) matureNow.add(Number(r.id))
    if (queue === -1) {
      add(suspended, group)
      continue
    }
    if (type === 0) {
      add(newCards, group)
      if (isBuried(queue, Number(r.mod))) add(buriedNew, group)
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
    const stored: FsrsCard = {
      deckId: group,
      stability: data.s,
      difficulty: data.d,
      lastReview: dayKey(data.lrt * 1000),
      due,
      interval: Math.max(0, Number(r.ivl)),
      state: type === 2 ? 'review' : type === 3 ? 'relearning' : 'learning',
      ...(presetIndex !== undefined && { preset: presetIndex }),
      ...(isBuried(queue, Number(r.mod)) && { buried: true }),
      ...(queue === 3 && { interday: true }),
    }
    cards.push(stored)
    cardById.set(Number(r.id), stored)
  }
  const cardText = cardTextReader(db, ctx.copiedAt)
  if (cards.length <= GARDEN_TEXT_CARDS) {
    for (const r of db.prepare(`SELECT ${CARD_TEXT_COLUMNS} FROM cards c JOIN notes n ON n.id = c.nid WHERE c.type != 0`).all()) {
      const card = cardById.get(Number(r.id))
      const front = card && cardText(r)
      if (front) card.front = front
    }
  }

  const presets: DeckPreset[] = []
  for (const group of groupIds) {
    const votes = presetVotes.get(group)
    if (!votes) continue
    const presetId = [...votes].sort((a, b) => b[1] - a[1])[0][0]
    const row = presetRows.get(presetId)
    if (!row) continue
    presets.push({ deckId: group, presetId, presetName: row.name, ...presetSettings(presetId), ...groupLimits.get(group) })
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
  const calibDays = new Map<string, CalibrationDay>()
  const bins = new Map<string, CalibrationBin>()
  const validation = { cards: 0, stabilityMatched: 0, difficultyMatched: 0 }
  const replayed: { group: string; days: number[]; states: MemoryState[]; params: number[] }[] = []
  const trouble: Omit<TroubleCard, 'front'>[] = []
  let resetCards = 0
  let incompleteHistory = 0
  const today = dayNumber(dayKey(ctx.now))
  const windowStart = today - WINDOW_DAYS + 1
  const newToday: Record<string, number> = {}
  const reviewsToday: Record<string, number> = {}
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
    // Newest first, stopping at earlier days. From the full log: a later Forget doesn't refund the review limit
    for (let i = entries.length - 1; i >= 0; i--) {
      const entryDay = dayNumber(dayKey(entries[i].id))
      if (entryDay < today) break
      if (entryDay === today && entries[i].type === 1 && entries[i].ease >= 1) add(reviewsToday, group)
    }
    const history = fsrsHistory(entries)
    if (history.length === 0) continue
    const days = history.map((e) => dayNumber(dayKey(e.id)))
    // A history that doesn't start with a learning answer can't be replayed from scratch: Anki seeds it
    // from SM-2 values. Its predictions are not reconstructed (never inferred), so it's left out below.
    const complete = history[0].type === 0
    if (!complete) incompleteHistory++
    const params = paramsFor(cid, group)
    const { state, predicted, states } = replay(
      history.map((e, i) => ({ day: days[i], rating: e.ease as Rating })),
      params,
    )
    // Only cards shown elsewhere as studied, with a history that can be replayed from its first answer
    if (complete && storedState.has(cid)) replayed.push({ group, days, states, params })

    const scheduled = history.filter((e, i) => e.type === 1 && days[i] > today - TROUBLE_WINDOW_DAYS)
    const again = scheduled.filter((e) => e.ease === 1).length
    const hard = scheduled.filter((e) => e.ease === 2).length
    if (storedState.has(cid) && again + hard >= TROUBLE_MIN_ANSWERS) {
      trouble.push({ cardId: String(cid), deckId: group, again, hard, reviews: scheduled.length })
    }

    // Validation against Anki's stored state (only meaningful for a complete history)
    const stored = storedState.get(cid)
    if (stored && state && complete) {
      validation.cards++
      if (Math.abs(state.stability - stored.stability) / stored.stability < 0.01) validation.stabilityMatched++
      if (Math.abs(state.difficulty - stored.difficulty) < 0.01) validation.difficultyMatched++
    }

    // Reaching a long interval is a promise; passing a review at that interval is the evidence for it
    if (matureNow.has(cid) && history.some((e) => e.type === 1 && e.ease > 1 && e.lastIvl >= MATURE_DAYS)) {
      add(proven, group)
      const card = cardById.get(cid)
      if (card) card.proven = true
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
      const date = keyFromDayNumber(days[i])
      const dayKeyed = `${date}|${group}`
      const d = calibDays.get(dayKeyed) ?? { date, deckId: group, reviews: 0, passed: 0, predicted: 0 }
      d.reviews++
      d.predicted += predicted[i]
      if (passed) d.passed++
      calibDays.set(dayKeyed, d)
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

    // What counts against today's limits
    if (history[0].type === 0 && days[0] === today) add(newToday, group)

    // New-card behaviour: first answer, and same-day learning answers on the introduction day
    if (history[0].type === 0 && days[0] >= windowStart) {
      b.firstRating[history[0].ease - 1]++
      b.newCardsIntroduced++
      b.learnN += history.filter((e, i) => e.type === 0 && days[i] === days[0]).length
    }
  }

  // --- Knowledge curve: each card's recall probability on sampled past days, from its replayed states ---
  // It stops on the copy's day: reviews since then aren't in it, so later days would read as pure forgetting
  const lastDay = Math.min(today, dayNumber(dayKey(ctx.copiedAt)))
  const firstDay = replayed.reduce((min, c) => Math.min(min, c.days[0]), lastDay)
  const samples = sampleDays(firstDay, lastDay)
  const knowledge = new Map<string, KnowledgePoint>()
  for (const c of replayed) {
    let i = -1
    for (const d of samples) {
      while (i + 1 < c.days.length && c.days[i + 1] <= d) i++
      if (i < 0) continue
      const date = keyFromDayNumber(d)
      const key = `${date}|${c.group}`
      const point = knowledge.get(key) ?? { date, deckId: c.group, started: 0, recalled: 0 }
      point.started++
      point.recalled += retrievability(d - c.days[i], c.states[i].stability, c.params)
      knowledge.set(key, point)
    }
  }

  // --- Trouble cards: worst first, with Again counting double; their text is read only for the few listed ---
  const worst = trouble.sort((a, b) => b.again * 2 + b.hard - (a.again * 2 + a.hard) || a.cardId.localeCompare(b.cardId)).slice(0, TROUBLE_MAX_CARDS)
  const fronts = new Map<string, string>()
  if (worst.length) {
    const rows = db.prepare(`SELECT ${CARD_TEXT_COLUMNS} FROM cards c JOIN notes n ON n.id = c.nid WHERE c.id IN (${worst.map(() => '?').join(',')})`)
    for (const r of rows.all(...worst.map((t) => Number(t.cardId)))) fronts.set(String(r.id), cardText(r))
  }

  return {
    enabled,
    version: 'FSRS-6',
    ankiVersion: ankiVersion(),
    windowDays: WINDOW_DAYS,
    presets,
    cards,
    newCards,
    buriedNew,
    newToday,
    reviewsToday,
    newCardsIgnoreReviewLimit: readConfigJson(db, 'newCardsIgnoreReviewLimit') === true,
    suspended,
    proven,
    missingState,
    invalidDue,
    resetCards,
    incompleteHistory,
    cardPresets,
    calibration: [...calib.values()].sort((a, b) => a.month.localeCompare(b.month)),
    calibrationDaily: [...calibDays.values()].sort((a, b) => a.date.localeCompare(b.date) || a.deckId.localeCompare(b.deckId)),
    knowledge: [...knowledge.values()].sort((a, b) => a.date.localeCompare(b.date) || a.deckId.localeCompare(b.deckId)),
    troubleCards: worst.map((t) => ({ ...t, front: fronts.get(t.cardId) ?? '' })),
    troubleWindowDays: TROUBLE_WINDOW_DAYS,
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
