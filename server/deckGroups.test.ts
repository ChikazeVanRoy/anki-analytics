import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  DeckConfigError,
  loadDeckColors,
  loadDeckConfig,
  namePattern,
  parseDeckConfig,
  planDeckGroups,
  saveDeckColors,
} from './deckGroups.ts'

// A collection that has nothing in common with the author's: Anki deck ids are creation timestamps
const decks = [
  { id: 100, name: 'Default' },
  { id: 200, name: 'Medicine' },
  { id: 201, name: 'Medicine\x1fPharmacology' },
  { id: 300, name: 'Japanese' },
  { id: 400, name: 'Law' },
  { id: 500, name: 'Geography' },
  { id: 600, name: 'Cram session' }, // a filtered deck: its cards are counted in their home decks
  { id: 700, name: 'Shared 20k deck' }, // imported, never studied
]
// Studied (learning + review) cards per deck; the shared deck has thousands of cards but none studied
const cards = new Map([
  [200, 300],
  [201, 900], // Medicine 1,200 in all
  [300, 2_000],
  [400, 50],
  [500, 400],
])

const plan = (config = {}) => planDeckGroups(decks, cards, config)
const shown = (config = {}) => plan(config).groups.map((g) => [g.name, g.color])

describe('planDeckGroups without a config', () => {
  it('shows the three most-studied top-level decks and folds the rest into Other decks', () => {
    expect(shown()).toEqual([
      ['Medicine', 1], // created first of the three, so the first colour
      ['Japanese', 2],
      ['Geography', 3],
      ['Other decks', undefined],
    ])
  })

  it('puts subdecks with their top-level deck, and small, empty and filtered decks in Other', () => {
    const { deckGroup } = plan()
    expect(deckGroup.get(201)).toBe('medicine')
    expect([100, 400, 600, 700].map((id) => deckGroup.get(id))).toEqual(['other', 'other', 'other', 'other'])
  })

  it('colours decks by creation order, not size, so a deck keeps its colour as counts change', () => {
    const bigger = planDeckGroups(decks, new Map([...cards, [500, 5_000]]))
    const colour = (name: string) => bigger.groups.find((g) => g.name === name)?.color
    expect([colour('Medicine'), colour('Japanese'), colour('Geography')]).toEqual([1, 2, 3])
  })

  it('keeps remembered colours when another deck takes a place, instead of repainting the survivors', () => {
    const first = plan()
    const remembered = new Map(first.groups.flatMap((g) => (g.color ? [[g.id, g.color] as const] : [])))
    // Default (created before every other deck) starts being studied and pushes Geography out. By creation
    // order alone it would take slot 1 and repaint Medicine and Japanese.
    const grown = new Map([...cards, [100, 1_000]])
    const colour = (p: ReturnType<typeof plan>, name: string) => p.groups.find((g) => g.name === name)?.color
    expect(colour(planDeckGroups(decks, grown), 'Medicine')).toBe(2) // what memory prevents
    const later = planDeckGroups(decks, grown, {}, remembered)
    expect([colour(later, 'Medicine'), colour(later, 'Japanese')]).toEqual([1, 2])
    expect(colour(later, 'Default')).toBe(3) // the slot Geography left free
    expect(later.groups.map((g) => g.name)).not.toContain('Geography')
  })

  it('works with a single deck, or none', () => {
    expect(planDeckGroups([{ id: 1, name: 'Spanish' }], new Map([[1, 10]])).groups.map((g) => g.name)).toEqual([
      'Spanish',
      'Other decks',
    ])
    expect(planDeckGroups([], new Map()).groups.map((g) => g.id)).toEqual(['other'])
  })

  it('gives decks distinct ids, even when names only differ in case or symbols', () => {
    const ids = planDeckGroups(
      [
        { id: 1, name: 'Other' },
        { id: 2, name: 'Español 🇪🇸' },
        { id: 3, name: '日本語' },
      ],
      new Map([
        [1, 30],
        [2, 20],
        [3, 10],
      ]),
    ).groups.map((g) => g.id)
    expect(ids).toEqual(['other-2', 'espanol', 'deck', 'other'])
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('planDeckGroups with a config', () => {
  it('merges matching top-level decks into a named group, which keeps its slot', () => {
    const config = { groups: [{ name: 'Languages', decks: ['Japanese', 'Geo*'] }] }
    expect(shown(config)).toEqual([
      ['Languages', 1],
      ['Medicine', 2],
      ['Law', 3], // the next largest fills the free slot
      ['Other decks', undefined],
    ])
    expect([300, 500].map((id) => plan(config).deckGroup.get(id))).toEqual(['languages', 'languages'])
  })

  it('leaves out a group that matches no deck, so a typo doesn’t cost a place, and reports it', () => {
    const result = plan({ groups: [{ name: 'Spanish', decks: ['Spansh*'] }] })
    expect(result.unmatched).toEqual(['Spanish'])
    expect(result.groups.map((g) => [g.name, g.color])).toEqual([
      ['Medicine', 1],
      ['Japanese', 2],
      ['Geography', 3],
      ['Other decks', undefined],
    ])
  })

  it('excludes decks from everything', () => {
    const { groups, excluded, deckGroup } = plan({ exclude: ['medicine'] })
    expect(groups.map((g) => g.name)).not.toContain('Medicine')
    expect([...excluded].sort()).toEqual([200, 201])
    expect(deckGroup.has(201)).toBe(false)
  })

  it('pins colours and limits how many decks show on their own', () => {
    expect(shown({ groups: [{ name: 'Med', decks: ['Medicine'], color: 3 }], maxDecks: 2 })).toEqual([
      ['Japanese', 1],
      ['Med', 3],
      ['Other decks', undefined],
    ])
    expect(shown({ maxDecks: 0 })).toEqual([['Other decks', undefined]])
  })
})

describe('deck name patterns', () => {
  it('match whole names, ignore case, and treat only * as special', () => {
    expect(namePattern('castilian*').test('Castilian🇪🇸')).toBe(true)
    expect(namePattern('Law').test('Lawyers')).toBe(false)
    expect(namePattern('C++ (notes)').test('c++ (notes)')).toBe(true)
  })
})

describe('parseDeckConfig', () => {
  it('accepts a full config', () => {
    const config = { groups: [{ name: 'Spanish', decks: ['Castilian*'], color: 2 }], exclude: ['Old'], maxDecks: 2 }
    expect(parseDeckConfig(config)).toEqual(config)
  })

  it.each([
    [[], 'expected an object'],
    [{ groups: {} }, '"groups" must be a list'],
    [{ groups: [{ decks: ['A'] }] }, 'groups[0].name'],
    [{ groups: [{ name: 'A', decks: 'A' }] }, 'groups[0].decks'],
    [{ groups: [{ name: 'A', decks: ['A'], color: 4 }] }, 'groups[0].color'],
    [{ groups: [1, 2, 3, 4].map((n) => ({ name: `G${n}`, decks: [`D${n}`] })) }, 'at most 3 groups'],
    [{ groups: ['A', 'B'].map((name) => ({ name, decks: [name], color: 1 })) }, 'same color'],
    [{ exclude: [''] }, '"exclude"'],
    [{ maxDecks: 5 }, '"maxDecks"'],
    [{ groups: [{ name: 'A', decks: ['A'] }, { name: 'B', decks: ['B'] }], maxDecks: 1 }, 'smaller than the number of groups'],
    [{ exclude: ['A'], excludes: ['B'] }, 'unknown key "excludes"'],
    [{ groups: [{ name: 'A', decks: ['A'], colour: 2 }] }, 'did you mean "color"'],
    [{ groups: [null] }, 'groups[0] must be an object'],
  ])('rejects %j with a message that says what to fix', (raw, message) => {
    expect(() => parseDeckConfig(raw)).toThrow(DeckConfigError)
    expect(() => parseDeckConfig(raw)).toThrow(message)
  })
})

describe('loadDeckConfig and remembered colours', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-config-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('remembers colour slots, keeping those of decks no longer shown', () => {
    const path = join(dir, 'sub', 'deck-colors.json')
    expect(loadDeckColors(path)).toEqual(new Map())
    saveDeckColors([{ id: 'medicine', color: 1 }, { id: 'other' }], new Map([['law', 3]]), path)
    expect(loadDeckColors(path)).toEqual(new Map([['law', 3], ['medicine', 1]]))
    writeFileSync(path, 'not json')
    expect(loadDeckColors(path)).toEqual(new Map()) // a damaged file just means nothing is remembered
  })

  it('treats a missing file as no config, and explains a file that isn’t JSON', () => {
    expect(loadDeckConfig(join(dir, 'missing.json'))).toEqual({})
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{ "exclude": [ }')
    expect(() => loadDeckConfig(bad)).toThrow(/not valid JSON/)
  })
})
