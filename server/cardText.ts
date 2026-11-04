// The text that stands for a card in the dashboard. The note's sort field is often the wrong one: it can be
// the translation, a sound file or a frequency rank. So each card's own template decides: the first field
// it shows, question side first, that holds any text.

import { DatabaseSync } from 'node:sqlite'
import { firstBytes, parseProto } from './protobuf.ts'

const NOT_FIELDS = new Set(['FrontSide', 'Tags', 'Type', 'Deck', 'Subdeck', 'Card', 'CardFlag']) // Anki's own template names

/** One short line of plain text. Fields are stored as written, so this also removes HTML, sound tags and furigana and cloze markup. */
export function plainFront(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\[sound:[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\{c\d+::image-occlusion:[^}]*\}\}/g, ' ') // where a mask sits on an image, not text
    .replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, '$1') // {{c1::answer::hint}}
    .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]) ?\[[\p{Script=Hiragana}\p{Script=Katakana}][^\]]*\]/gu, '') // 食[た]べる
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  const characters = Array.from(text) // by character, so an emoji is never cut in half
  return characters.length > 80 ? `${characters.slice(0, 79).join('')}…` : text
}

/** The field names a template shows, in order: `{{Hanzi}}` or `{{furigana:Word}}`, but not `{{#Word}}`, `{{FrontSide}}` or what `{{^Word}}` hides. */
export function fieldsInTemplate(template: string): string[] {
  const names: string[] = []
  const visible = template.replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{\^\s*([^{}]+?)\s*\}\}[\s\S]*?\{\{\/\s*\1\s*\}\}/g, '')
  for (const [, tag] of visible.matchAll(/\{\{([^{}]+)\}\}/g)) {
    if (/^\s*[#^/!]/.test(tag)) continue
    const name = tag.slice(tag.lastIndexOf(':') + 1).trim()
    if (!NOT_FIELDS.has(name)) names.push(name)
  }
  return names
}

/**
 * Anki's field and template tables sort names with its own `unicase` collation, and SQLite refuses to read them
 * without it, which node:sqlite can't provide. So they are read from a throwaway copy held in memory, with the
 * collation dropped from that copy's schema. The collection on disk is never touched.
 */
function withoutUnicase(db: DatabaseSync): DatabaseSync {
  const bytes = db.serialize()
  bytes[18] = bytes[19] = 1 // the header's WAL mode needs a file; this copy has none
  const copy = new DatabaseSync(':memory:')
  try {
    copy.deserialize(bytes)
    copy.enableDefensive(false)
    copy.exec(`
      PRAGMA writable_schema = ON;
      UPDATE sqlite_schema SET sql = replace(sql, 'COLLATE unicase', '') WHERE lower(tbl_name) IN ('fields', 'templates');
      PRAGMA writable_schema = RESET;
    `)
    return copy
  } catch (err) {
    copy.close()
    throw err
  }
}

/** For each note type and card template (`noteType:template`), the positions of the fields it shows, in order. */
function readFieldsShown(db: DatabaseSync): Map<string, number[]> {
  const shown = new Map<string, number[]>()
  const copy = withoutUnicase(db)
  try {
    const fields = new Map<string, number>()
    for (const r of copy.prepare('SELECT ntid, ord, name FROM fields').all()) fields.set(`${r.ntid}:${r.name}`, Number(r.ord))
    const decoder = new TextDecoder()
    for (const r of copy.prepare('SELECT ntid, ord, config FROM templates').all()) {
      const config = parseProto(r.config as Uint8Array)
      const sides = [1, 2].map((side) => decoder.decode(firstBytes(config, side) ?? new Uint8Array())) // question, answer
      const positions = sides.flatMap(fieldsInTemplate).flatMap((name) => fields.get(`${r.ntid}:${name}`) ?? [])
      shown.set(`${r.ntid}:${r.ord}`, positions)
    }
  } finally {
    copy.close()
  }
  return shown
}

/** The last templates read, as they only change with a new copy and reading them means copying the whole collection. */
let latest: { copy: string; shown: Map<string, number[]> } | null = null

/**
 * Returns a function giving a card's text from a row with its `ord` and its note's `mid`, `flds` and `sfld`.
 * Templates are read on the first call. If they can't be, every card falls back to its sort field.
 * `copiedAt` identifies this copy of the collection, so that a later read of it needn't read them again.
 */
export function cardTextReader(db: DatabaseSync, copiedAt?: number) {
  const copy = copiedAt === undefined ? null : `${db.location()}:${copiedAt}`
  let shown = copy !== null && latest?.copy === copy ? latest.shown : undefined
  return (card: Record<string, unknown>): string => {
    if (!shown) {
      try {
        shown = readFieldsShown(db)
        if (copy !== null) latest = { copy, shown }
      } catch (err) {
        console.warn('Could not read card templates; showing sort fields instead.', err)
        shown = new Map()
      }
    }
    const fields = String(card.flds ?? '').split('\x1f')
    const positions = shown.get(`${card.mid}:${card.ord}`) ?? shown.get(`${card.mid}:0`) ?? [] // cloze cards share template 0
    for (const position of positions) {
      const text = plainFront(fields[position])
      if (text) return text
    }
    return plainFront(card.sfld)
  }
}
