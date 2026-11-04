// Which dashboard deck each Anki deck belongs to. Without a config file every top-level Anki deck is its own
// dashboard deck: the ones with the most studied cards are shown on their own and the rest are folded into
// "Other decks" (a big imported deck you never studied doesn't take a place). An optional, git-ignored
// anki-analytics.config.json merges, renames, excludes or pins decks. Colour slots are remembered between
// visits (data/deck-colors.json), so a deck keeps its colour when other decks come and go.
// planDeckGroups and parseDeckConfig are pure, so the grouping can be tested with any set of deck names.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Number of deck colours (validated as a set, see src/lib/theme.ts). Past this, decks fold into "Other". */
export const DECK_COLORS = 3

export interface DeckConfig {
  /** Dashboard decks made of one or more top-level Anki decks, matched by name (case-insensitive, `*` = anything). */
  groups?: { name: string; decks: string[]; color?: number }[]
  /** Top-level Anki decks left out entirely (cards and reviews), matched the same way. */
  exclude?: string[]
  /** How many dashboard decks to show on their own (at most DECK_COLORS); the rest become "Other decks". */
  maxDecks?: number
}

export interface DeckGroup {
  id: string
  name: string
  color?: number // 1-based colour slot; absent for "Other decks" (neutral)
}

export interface DeckGroupPlan {
  groups: DeckGroup[] // shown decks in colour order, then "Other decks"
  deckGroup: Map<number, string> // Anki deck id -> dashboard deck id
  excluded: Set<number> // Anki deck ids left out
  /** Configured groups whose patterns matched no deck (likely a typo); they're left out. */
  unmatched: string[]
}

/** The config file exists but can't be used; the message says what to fix. */
export class DeckConfigError extends Error {}

export const OTHER: DeckGroup = { id: 'other', name: 'Other decks' }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CONFIG_PATH = join(ROOT, 'anki-analytics.config.json')
/** Remembered colour slots per dashboard deck id. Our own file in the git-ignored data folder, never Anki's. */
export const COLORS_PATH = join(ROOT, 'data', 'deck-colors.json')

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
/** A deck-name pattern: case-insensitive, whole name, `*` matches anything. */
export const namePattern = (p: string) => new RegExp(`^${p.split('*').map(escape).join('.*')}$`, 'iu')

const slug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // drop accents: "Español" -> "espanol"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-') // keeps any script: a deck's id must not depend on its rank among others
    .replace(/^-|-$/g, '') || 'deck'

/** Reads and checks the optional config file. Missing file: no config. Invalid file: an error saying why. */
export function loadDeckConfig(path = CONFIG_PATH): DeckConfig {
  if (!existsSync(path)) return {}
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new DeckConfigError(`anki-analytics.config.json is not valid JSON: ${(err as Error).message}`)
  }
  return parseDeckConfig(raw)
}

/** Remembered colour slots; a missing or unreadable file just means none are remembered yet. */
export function loadDeckColors(path = COLORS_PATH): Map<string, number> {
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Map()
    return new Map(Object.entries(raw).filter((e): e is [string, number] => Number.isInteger(e[1])))
  } catch {
    return new Map()
  }
}

/** Saves the slots shown now, merged over the remembered ones (a deck that drops out keeps its slot for later). */
export function saveDeckColors(groups: { id: string; color?: number }[], previous: Map<string, number>, path = COLORS_PATH) {
  const next = new Map(previous)
  for (const g of groups) if (g.color !== undefined) next.set(g.id, g.color)
  if (next.size === previous.size && [...next].every(([id, c]) => previous.get(id) === c)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(Object.fromEntries(next), null, 2)}\n`)
}

const KEYS = ['groups', 'exclude', 'maxDecks']
const GROUP_KEYS = ['name', 'decks', 'color']

export function parseDeckConfig(raw: unknown): DeckConfig {
  const fail = (why: string): never => {
    throw new DeckConfigError(`anki-analytics.config.json: ${why}`)
  }
  // A misspelt key would otherwise do nothing, which looks like a broken config
  const onlyKnown = (obj: object, known: string[], where: string) => {
    for (const key of Object.keys(obj)) {
      if (known.includes(key)) continue
      const hint = key.toLowerCase() === 'colour' ? ' (did you mean "color"?)' : ''
      fail(`unknown key "${key}"${where}${hint}. Known keys: ${known.join(', ')}`)
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('expected an object')
  onlyKnown(raw as object, KEYS, '')
  const { groups, exclude, maxDecks } = raw as Record<string, unknown>
  const strings = (v: unknown, what: string) =>
    Array.isArray(v) && v.every((s) => typeof s === 'string' && s.length > 0) ? (v as string[]) : fail(`${what} must be a list of deck names`)
  const config: DeckConfig = {}
  if (groups !== undefined) {
    if (!Array.isArray(groups)) fail('"groups" must be a list')
    config.groups = (groups as unknown[]).map((g, i) => {
      if (!g || typeof g !== 'object' || Array.isArray(g)) fail(`groups[${i}] must be an object`)
      onlyKnown(g as object, GROUP_KEYS, ` in groups[${i}]`)
      const { name, decks, color } = g as Record<string, unknown>
      if (typeof name !== 'string' || !name.trim()) fail(`groups[${i}].name must be a non-empty string`)
      if (color !== undefined && !(Number.isInteger(color) && (color as number) >= 1 && (color as number) <= DECK_COLORS)) {
        fail(`groups[${i}].color must be a whole number from 1 to ${DECK_COLORS}`)
      }
      return { name: (name as string).trim(), decks: strings(decks, `groups[${i}].decks`), ...(color !== undefined && { color: color as number }) }
    })
    if (config.groups.length > DECK_COLORS) fail(`at most ${DECK_COLORS} groups (one per deck colour)`)
    const pinned = config.groups.flatMap((g) => (g.color === undefined ? [] : [g.color]))
    if (new Set(pinned).size < pinned.length) fail('two groups have the same color')
  }
  if (exclude !== undefined) config.exclude = strings(exclude, '"exclude"')
  if (maxDecks !== undefined) {
    if (!(Number.isInteger(maxDecks) && (maxDecks as number) >= 0 && (maxDecks as number) <= DECK_COLORS)) {
      fail(`"maxDecks" must be a whole number from 0 to ${DECK_COLORS}`)
    }
    config.maxDecks = maxDecks as number
    if ((config.groups?.length ?? 0) > config.maxDecks) {
      fail(`"maxDecks" (${config.maxDecks}) is smaller than the number of groups (${config.groups!.length}); configured groups always show`)
    }
  }
  return config
}

/**
 * Groups Anki decks into dashboard decks.
 * - `decks`: every Anki deck (id and full name, "Parent\x1fChild").
 * - `studied`: studied (learning or review) cards per Anki deck id, cards in a filtered deck counted in their
 *   home deck, so filtered decks count as empty and never take a place of their own.
 * - `previous`: colour slots remembered from earlier visits, by dashboard deck id.
 * Configured groups always show; the remaining places go to the top-level decks with the most studied cards.
 * Colours: pinned slots first, then a deck's remembered slot if it's free, then configured groups in order
 * and other decks in the order they were created in Anki. A deck's colour never depends on its rank.
 */
export function planDeckGroups(
  decks: { id: number; name: string }[],
  studied: Map<number, number>,
  config: DeckConfig = {},
  previous: Map<string, number> = new Map(),
): DeckGroupPlan {
  const exclude = (config.exclude ?? []).map(namePattern)
  const maxDecks = Math.min(config.maxDecks ?? DECK_COLORS, DECK_COLORS)

  // Top-level decks: first-created id (Anki ids are creation timestamps), studied cards, member deck ids
  type Top = { firstId: number; studied: number; ids: number[] }
  const tops = new Map<string, Top>()
  const excluded = new Set<number>()
  for (const d of decks) {
    const top = d.name.split('\x1f')[0]
    if (exclude.some((re) => re.test(top))) {
      excluded.add(d.id)
      continue
    }
    const t = tops.get(top) ?? tops.set(top, { firstId: d.id, studied: 0, ids: [] }).get(top)!
    t.firstId = Math.min(t.firstId, d.id)
    t.ids.push(d.id)
    t.studied += studied.get(d.id) ?? 0
  }

  // Ids become keys beside the charts' own `date` and `label`, and in plain objects, where `constructor` already exists
  const used = new Set([OTHER.id, 'date', 'label', 'constructor'])
  const uniqueId = (name: string) => {
    let id = slug(name)
    for (let n = 2; used.has(id); n++) id = `${slug(name)}-${n}`
    used.add(id)
    return id
  }

  // Configured groups claim their decks first; a group that matches nothing is reported, not shown
  const configured = (config.groups ?? []).map((g) => ({ ...g, patterns: g.decks.map(namePattern), tops: [] as Top[] }))
  const unclaimed: [string, Top][] = []
  for (const [top, t] of tops) {
    const g = configured.find((c) => c.patterns.some((re) => re.test(top)))
    if (g) g.tops.push(t)
    else unclaimed.push([top, t])
  }
  const groups: (DeckGroup & { firstId: number; configured: boolean })[] = []
  const deckGroup = new Map<number, string>()
  for (const g of configured.filter((c) => c.tops.length > 0)) {
    const id = uniqueId(g.name)
    groups.push({ id, name: g.name, color: g.color, firstId: Math.min(...g.tops.map((t) => t.firstId)), configured: true })
    for (const t of g.tops) for (const deckId of t.ids) deckGroup.set(deckId, id)
  }

  // Then the top-level decks with the most studied cards, while places remain; the rest are "Other decks"
  const largest = new Set(
    unclaimed
      .filter(([, t]) => t.studied > 0)
      .sort((a, b) => b[1].studied - a[1].studied || a[1].firstId - b[1].firstId)
      .slice(0, Math.max(0, maxDecks - groups.length))
      .map(([top]) => top),
  )
  for (const [top, t] of unclaimed) {
    const id = largest.has(top) ? uniqueId(top) : OTHER.id
    if (id !== OTHER.id) groups.push({ id, name: top, firstId: t.firstId, configured: false })
    for (const deckId of t.ids) deckGroup.set(deckId, id)
  }

  // Colours
  const taken = new Set(groups.flatMap((g) => (g.color === undefined ? [] : [g.color])))
  for (const g of groups) {
    const remembered = previous.get(g.id)
    if (g.color === undefined && remembered !== undefined && remembered >= 1 && remembered <= DECK_COLORS && !taken.has(remembered)) {
      g.color = remembered
      taken.add(remembered)
    }
  }
  const nextFree = () => {
    for (let c = 1; c <= DECK_COLORS; c++) {
      if (!taken.has(c)) {
        taken.add(c)
        return c
      }
    }
    return undefined
  }
  const unassigned = groups.filter((g) => g.color === undefined)
  for (const g of unassigned.filter((g) => g.configured)) g.color = nextFree()
  for (const g of unassigned.filter((g) => !g.configured).sort((a, b) => a.firstId - b.firstId)) g.color = nextFree()

  return {
    groups: [...groups.sort((a, b) => (a.color ?? 99) - (b.color ?? 99)).map((g) => ({ id: g.id, name: g.name, color: g.color })), OTHER],
    deckGroup,
    excluded,
    unmatched: configured.filter((c) => c.tops.length === 0).map((c) => c.name),
  }
}
