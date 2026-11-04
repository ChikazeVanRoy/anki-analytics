// The rules that protect your Anki files. Everything here runs in throwaway folders: nothing touches Anki's
// real folder or the real copy in ./data, and the process check is faked.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ankiIsRunning, ankiStatus, copyCollection, CopyError, type CopyPlaces } from './collection.ts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))

let root: string
let ankiDir: string
let copyPath: string
let savedProfile: string | undefined
const places = (running = false): CopyPlaces => ({ ankiDir, copyPath, ankiRunning: () => running })

/** A profile folder holding a collection, as Anki lays it out. */
function profile(name: string, contents = `collection of ${name}`) {
  mkdirSync(join(ankiDir, name), { recursive: true })
  const source = join(ankiDir, name, 'collection.anki2')
  writeFileSync(source, contents)
  return source
}

/** Every file under Anki's folder with its contents and modified time, to prove nothing changed. */
function snapshot() {
  return readdirSync(ankiDir, { recursive: true, encoding: 'utf8' })
    .map((name) => join(ankiDir, name))
    .filter((path) => statSync(path).isFile())
    .sort()
    .map((path) => [path, readFileSync(path, 'utf8'), statSync(path).mtimeMs])
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'anki-analytics-copy-'))
  ankiDir = join(root, 'Anki2')
  copyPath = join(root, 'data', 'collection.anki2')
  mkdirSync(ankiDir)
  savedProfile = process.env.ANKI_PROFILE
  delete process.env.ANKI_PROFILE
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  if (savedProfile !== undefined) process.env.ANKI_PROFILE = savedProfile
})

describe('copyCollection', () => {
  it('refuses while Anki is running, and leaves the existing copy alone', () => {
    profile('User 1', 'newer')
    mkdirSync(join(root, 'data'))
    writeFileSync(copyPath, 'existing copy')
    expect(() => copyCollection(undefined, places(true))).toThrow(CopyError)
    expect(() => copyCollection(undefined, places(true))).toThrow(/Anki is running/)
    expect(readFileSync(copyPath, 'utf8')).toBe('existing copy')
  })

  it('checks Anki before anything else, so a running Anki never gets its folder read', () => {
    const running = places(true)
    expect(() => copyCollection('anything', { ...running, ankiDir: join(root, 'missing') })).toThrow(/Anki is running/)
  })

  it('refuses after an unclean close, when the copy could be incomplete', () => {
    const source = profile('User 1')
    writeFileSync(`${source}-wal`, 'unsaved changes')
    expect(() => copyCollection(undefined, places())).toThrow(/did not close cleanly/)
    expect(existsSync(copyPath)).toBe(false)
  })

  it('only accepts an existing profile, so a name can’t reach outside Anki’s folder', () => {
    profile('User 1')
    writeFileSync(join(root, 'collection.anki2'), 'not a profile')
    for (const name of ['..', '../..', 'Nobody', 'User 1/..']) {
      expect(() => copyCollection(name, places())).toThrow(/Unknown profile/)
    }
    expect(existsSync(copyPath)).toBe(false)
  })

  it('won’t guess between profiles', () => {
    profile('User 1')
    profile('User 2')
    expect(() => copyCollection(undefined, places())).toThrow(/ANKI_PROFILE/)
    expect(existsSync(copyPath)).toBe(false)
  })

  it('explains when there is nothing to copy', () => {
    expect(() => copyCollection(undefined, places())).toThrow(/Found profiles: none/)
    rmSync(ankiDir, { recursive: true })
    expect(() => copyCollection(undefined, places())).toThrow(/Found profiles: none/)
  })

  it('copies the chosen profile exactly', () => {
    profile('User 1', 'first')
    profile('User 2', 'second')
    expect(copyCollection('User 2', places())).toEqual({ profile: 'User 2', bytes: 'second'.length })
    expect(readFileSync(copyPath, 'utf8')).toBe('second')
  })

  it('uses the only profile, or ANKI_PROFILE, without being told', () => {
    profile('User 1', 'first')
    expect(copyCollection(undefined, places()).profile).toBe('User 1')
    profile('User 2', 'second')
    process.env.ANKI_PROFILE = 'User 2'
    expect(copyCollection(undefined, places()).profile).toBe('User 2')
  })

  it('never changes anything in Anki’s folder', () => {
    profile('User 1')
    const before = snapshot()
    copyCollection(undefined, places())
    expect(snapshot()).toEqual(before)
  })

  it('replaces the old copy and removes its side-files, so they can’t be replayed onto the new one', () => {
    profile('User 1', 'new')
    mkdirSync(join(root, 'data'))
    writeFileSync(copyPath, 'old')
    writeFileSync(`${copyPath}-wal`, 'old log')
    writeFileSync(`${copyPath}-shm`, 'old index')
    copyCollection(undefined, places())
    expect(readFileSync(copyPath, 'utf8')).toBe('new')
    expect(existsSync(`${copyPath}-wal`)).toBe(false)
    expect(existsSync(`${copyPath}-shm`)).toBe(false)
  })
})

describe('ankiStatus', () => {
  /** A collection and a copy with the given modified times, in seconds. */
  function withDates(sourceSecs: number, copySecs: number) {
    const source = profile('User 1')
    utimesSync(source, sourceSecs, sourceSecs)
    mkdirSync(join(root, 'data'))
    writeFileSync(copyPath, 'copy')
    utimesSync(copyPath, copySecs, copySecs)
    return source
  }

  it('offers an update once Anki is closed and its collection is newer than the copy', () => {
    withDates(2_000, 1_000)
    expect(ankiStatus(undefined, places())).toEqual({ ankiRunning: false, updateAvailable: true, sourceModified: 2_000_000 })
  })

  it('offers nothing with no new reviews, or while Anki is open', () => {
    withDates(1_000, 2_000)
    expect(ankiStatus(undefined, places()).updateAvailable).toBe(false)
    rmSync(root, { recursive: true })
    mkdirSync(ankiDir, { recursive: true })
    withDates(2_000, 1_000)
    expect(ankiStatus(undefined, places(true))).toMatchObject({ ankiRunning: true, updateAvailable: false })
  })

  it('offers nothing after an unclean close, because the refresh would fail', () => {
    const source = withDates(2_000, 1_000)
    writeFileSync(`${source}-wal`, 'unsaved changes')
    expect(ankiStatus(undefined, places()).updateAvailable).toBe(false)
  })

  it('offers the first copy when there is none', () => {
    profile('User 1')
    expect(ankiStatus(undefined, places()).updateAvailable).toBe(true)
  })

  it('stays quiet when it can’t tell which collection is meant', () => {
    profile('User 1')
    profile('User 2')
    expect(ankiStatus(undefined, places())).toEqual({ ankiRunning: false, updateAvailable: false, sourceModified: null })
    expect(ankiStatus('../..', places()).sourceModified).toBeNull()
  })

  it('copes with no Anki folder at all', () => {
    rmSync(ankiDir, { recursive: true })
    expect(ankiStatus(undefined, places())).toEqual({ ankiRunning: false, updateAvailable: false, sourceModified: null })
  })

  it('never changes anything, and doesn’t create the copy', () => {
    profile('User 1')
    const before = snapshot()
    ankiStatus(undefined, places())
    expect(snapshot()).toEqual(before)
    expect(existsSync(copyPath)).toBe(false)
  })
})

describe('ankiIsRunning', () => {
  const pgrep = vi.mocked(execFileSync)
  const running = (found: (args: string[]) => boolean) =>
    pgrep.mockImplementation(((_: string, args: string[]) => {
      if (!found(args)) throw new Error('no match')
      return ''
    }) as unknown as typeof execFileSync)

  beforeEach(() => {
    pgrep.mockReset()
  })

  it('finds Anki by its exact process name', () => {
    running((args) => args.includes('-x'))
    expect(ankiIsRunning()).toBe(true)
  })

  it('finds anything launched from Anki.app', () => {
    running((args) => args.includes('-f'))
    expect(ankiIsRunning()).toBe(true)
  })

  it('is false when neither search matches', () => {
    running(() => false)
    expect(ankiIsRunning()).toBe(false)
  })

  it('searches narrowly and without a shell, so "voicebankingd" can’t count as Anki', () => {
    running(() => false)
    ankiIsRunning()
    expect(pgrep.mock.calls.map((c) => c[0])).toEqual(['pgrep', 'pgrep'])
    expect(pgrep.mock.calls.map((c) => c[1])).toEqual([['-x', '-i', 'anki'], ['-f', 'Anki\\.app/Contents/']])
  })
})
