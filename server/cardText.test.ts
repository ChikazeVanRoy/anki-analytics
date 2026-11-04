import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cardTextReader, fieldsInTemplate, plainFront } from './cardText.ts'

const dir = mkdtempSync(join(tmpdir(), 'card-text-'))
const path = join(dir, 'collection.anki2')

/** A template's config: question and answer as protobuf fields 1 and 2 (short strings only). */
function config(question: string, answer: string) {
  const field = (n: number, text: string) => {
    const bytes = new TextEncoder().encode(text)
    return [n * 8 + 2, bytes.length, ...bytes]
  }
  return Uint8Array.from([...field(1, question), ...field(2, answer)])
}

beforeAll(() => {
  // Built without the collation, which node:sqlite can't create, then given it as a real collection has it
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE fields (ntid INTEGER NOT NULL, ord INTEGER NOT NULL, name TEXT NOT NULL, config BLOB NOT NULL, PRIMARY KEY (ntid, ord)) WITHOUT ROWID;
    CREATE TABLE templates (ntid INTEGER NOT NULL, ord INTEGER NOT NULL, name TEXT NOT NULL, config BLOB NOT NULL, PRIMARY KEY (ntid, ord)) WITHOUT ROWID;
    CREATE UNIQUE INDEX idx_fields_name_ntid ON fields (name, ntid);
    CREATE UNIQUE INDEX idx_templates_name_ntid ON templates (name, ntid);
  `)
  const field = db.prepare(`INSERT INTO fields VALUES (?, ?, ?, x'')`)
  ;['Translation', 'Target', 'Audio'].forEach((name, i) => field.run(1, i, name))
  ;['Rank', 'Word', 'Meaning'].forEach((name, i) => field.run(2, i, name))
  const template = db.prepare('INSERT INTO templates VALUES (?, ?, ?, ?)')
  template.run(1, 0, 'Listening', config('{{Audio}}', '{{FrontSide}}<hr>{{Target}}<br>{{Translation}}'))
  template.run(2, 0, 'Forward', config('{{#Word}}{{furigana:Word}}{{/Word}}', '{{Meaning}}'))
  template.run(2, 1, 'Reverse', config('<!-- {{Word}} -->{{Meaning}}', '{{Word}}'))
  db.enableDefensive(false)
  db.exec(`
    PRAGMA writable_schema = ON;
    UPDATE sqlite_schema SET sql = replace(sql, 'name TEXT NOT NULL', 'name TEXT NOT NULL COLLATE unicase') WHERE type = 'table';
    PRAGMA writable_schema = RESET;
  `)
  db.close()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('cardTextReader', () => {
  const textOf = (card: Record<string, unknown>) => {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      return cardTextReader(db)(card)
    } finally {
      db.close()
    }
  }

  it('needs the workaround: the template tables cannot be read directly', () => {
    const db = new DatabaseSync(path, { readOnly: true })
    expect(() => db.prepare('SELECT ntid, ord, config FROM templates').all()).toThrow()
    db.close()
  })

  it('skips sound-only fields and uses the first text the card shows, not the sort field', () => {
    expect(textOf({ mid: 1, ord: 0, sfld: 'Hello', flds: 'Hello\x1f<div>Ciao</div>\x1f[sound:a.mp3]' })).toBe('Ciao')
  })

  it('follows each card of a note to its own template', () => {
    const flds = '574\x1fpalabra\x1fword'
    expect(textOf({ mid: 2, ord: 0, sfld: '574', flds })).toBe('palabra')
    expect(textOf({ mid: 2, ord: 1, sfld: '574', flds })).toBe('word')
  })

  it('uses the first template when a card has none of its own, as cloze cards do', () => {
    expect(textOf({ mid: 2, ord: 7, sfld: '574', flds: '574\x1fpalabra\x1fword' })).toBe('palabra')
  })

  it('falls back to the sort field when nothing the card shows has text', () => {
    expect(textOf({ mid: 1, ord: 0, sfld: 'Hello', flds: 'Hello\x1f\x1f[sound:a.mp3]' })).toBe('Hello')
    expect(textOf({ mid: 9, ord: 0, sfld: 'Unknown type', flds: 'x' })).toBe('Unknown type')
  })

  it('falls back to the sort field for every card when templates cannot be read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = new DatabaseSync(':memory:')
    expect(cardTextReader(db)({ mid: 1, ord: 0, sfld: 'Hello', flds: 'x' })).toBe('Hello')
    db.close()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('fieldsInTemplate', () => {
  it('finds fields in order, with filters removed', () => {
    expect(fieldsInTemplate('{{Audio}}<b>{{text:Word}}</b>{{ tts en_US:Sentence }}{{type:Answer}}')).toEqual(['Audio', 'Word', 'Sentence', 'Answer'])
  })

  it('leaves out what a {{^Field}} section shows only when that field is empty', () => {
    expect(fieldsInTemplate('{{^Hanzi}}{{English}}{{/Hanzi}}{{Hanzi}}')).toEqual(['Hanzi'])
  })

  it('ignores conditionals, comments, and Anki names that are not fields', () => {
    expect(fieldsInTemplate('{{#A}}{{^B}}{{/B}}{{/A}}<!-- {{C}} -->{{FrontSide}}{{Tags}}{{Deck}}')).toEqual([])
  })
})

describe('plainFront', () => {
  it('reduces a field to one short plain line', () => {
    expect(plainFront('<div>a&nbsp;b</div>[sound:x.mp3]\n c')).toBe('a b c')
    expect(plainFront(42)).toBe('42')
    expect(plainFront(null)).toBe('')
    expect(plainFront('x'.repeat(100))).toHaveLength(80)
  })

  it('decodes the HTML entities Anki stores in fields', () => {
    expect(plainFront('Tom &amp; Jerry &lt;3 &quot;hi&quot; it&#39;s')).toBe(`Tom & Jerry <3 "hi" it's`)
    expect(plainFront('&amp;lt;')).toBe('&lt;')
  })

  it('removes furigana readings but keeps other brackets', () => {
    expect(plainFront('食[た]べる 日本語[にほんご]')).toBe('食べる 日本語')
    expect(plainFront('see [note 2]')).toBe('see [note 2]')
  })

  it('shows the answer inside cloze markup', () => {
    expect(plainFront('The {{c1::cat::animal}} and {{c2::dog}}')).toBe('The cat and dog')
  })
})
