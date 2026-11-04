import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { AnkiData } from '../src/data/types.ts'
import { isPhoneRequest, isTailscaleName, loadPhoneHost, phoneSnapshot, removePhoneHost, savePhoneHost, withoutNoteText } from './phoneAccess.ts'

const dir = mkdtempSync(join(tmpdir(), 'anki-analytics-phone-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const phone = 'my-mac.my-tailnet.ts.net'

describe('isTailscaleName', () => {
  it('accepts a machine name in a tailnet', () => {
    expect(isTailscaleName(phone)).toBe(true)
  })
  it('refuses anything a website could point here', () => {
    for (const name of ['evil.example', 'ts.net', 'my-mac.ts.net', 'my-mac.my-tailnet.ts.net.evil.example', 'a.b.ts.net:443', '']) {
      expect(isTailscaleName(name)).toBe(false)
    }
  })
})

describe('the saved machine name', () => {
  const file = join(dir, 'phone-host.txt')

  it('is off with no file, and can be turned on and off', () => {
    expect(loadPhoneHost(file)).toBeNull()
    savePhoneHost(phone, file)
    expect(loadPhoneHost(file)).toBe(phone)
    removePhoneHost(file)
    expect(loadPhoneHost(file)).toBeNull()
  })

  it('counts as off if the file was edited to anything else', () => {
    writeFileSync(file, 'evil.example\n')
    expect(loadPhoneHost(file)).toBeNull()
  })
})

describe('isPhoneRequest', () => {
  it('matches the saved name on any port, in any case', () => {
    expect(isPhoneRequest({ host: phone }, phone)).toBe(true)
    expect(isPhoneRequest({ host: `${phone.toUpperCase()}:443` }, phone)).toBe(true)
  })
  it('refuses when off, on another name, with no host, or through Funnel', () => {
    expect(isPhoneRequest({ host: phone }, null)).toBe(false)
    expect(isPhoneRequest({ host: 'evil.example' }, phone)).toBe(false)
    expect(isPhoneRequest({}, phone)).toBe(false)
    expect(isPhoneRequest({ host: phone, 'tailscale-funnel-request': '?1' }, phone)).toBe(false)
  })
})

describe('withoutNoteText', () => {
  const data = {
    source: 'anki',
    fsrs: { cards: [{ deckId: 'a', stability: 2, front: 'Secret' }], troubleCards: [{ cardId: '1', again: 3, front: 'Secret' }] },
  } as unknown as AnkiData

  it('removes the text and keeps every number', () => {
    const safe = withoutNoteText(data)
    expect(JSON.stringify(safe)).not.toContain('Secret')
    expect(safe.fsrs?.cards[0]).toEqual({ deckId: 'a', stability: 2 })
    expect(safe.fsrs?.troubleCards?.[0]).toEqual({ cardId: '1', again: 3, front: '' })
  })

  it('leaves data without FSRS as it is', () => {
    const plain = { source: 'anki' } as AnkiData
    expect(withoutNoteText(plain)).toBe(plain)
  })

  it('covers every field of a saved snapshot that holds note text', () => {
    const saved = JSON.stringify({ version: 1, data })
    expect(phoneSnapshot(saved)).not.toContain('Secret')
    expect(JSON.parse(phoneSnapshot(saved)).version).toBe(1)
  })
})
