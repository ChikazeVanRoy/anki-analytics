import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { gitIn, readVersion, updateFromGitHub } from './version.ts'

const root = mkdtempSync(join(tmpdir(), 'anki-analytics-version-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const g = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/** A bare "GitHub" with one commit, and a clone of it. */
function setup(name: string) {
  const remote = join(root, `${name}.git`)
  const seed = join(root, `${name}-seed`)
  const clone = join(root, name)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  execFileSync('git', ['clone', '-q', remote, seed], { stdio: 'ignore' })
  g(seed, 'checkout', '-q', '-B', 'main')
  g(seed, 'commit', '-q', '--allow-empty', '-m', 'one')
  g(seed, 'push', '-q', '-u', 'origin', 'main')
  execFileSync('git', ['clone', '-q', remote, clone], { stdio: 'ignore' })
  const publish = () => {
    g(seed, 'commit', '-q', '--allow-empty', '-m', 'next')
    g(seed, 'push', '-q')
  }
  return { clone, publish }
}

const update = (clone: string) => updateFromGitHub(gitIn(clone), () => readVersion(clone))

describe('readVersion', () => {
  it('reads the commit and its date', () => {
    const { clone } = setup('read')
    expect(readVersion(clone)).toEqual({ commit: g(clone, 'rev-parse', '--short', 'HEAD'), date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
  })
  it('says nothing outside a git checkout', () => {
    expect(readVersion(mkdtempSync(join(root, 'plain-')))).toEqual({ commit: null, date: null })
  })
})

describe('updateFromGitHub', () => {
  it('has nothing to do when already current', async () => {
    const { clone } = setup('current')
    expect(await update(clone)).toEqual({ outcome: 'current' })
  })
  it('fast-forwards to new commits', async () => {
    const { clone, publish } = setup('behind')
    publish()
    publish()
    const result = await update(clone)
    expect(result).toMatchObject({ outcome: 'updated', commits: 2 })
    expect(g(clone, 'rev-parse', 'HEAD')).toBe(g(clone, 'rev-parse', '@{upstream}'))
  })
  it('leaves uncommitted changes alone', async () => {
    const { clone, publish } = setup('dirty')
    writeFileSync(join(clone, 'f'), 'x')
    g(clone, 'add', 'f')
    publish()
    const before = g(clone, 'rev-parse', 'HEAD')
    expect(await update(clone)).toMatchObject({ outcome: 'blocked' })
    expect(g(clone, 'rev-parse', 'HEAD')).toBe(before)
  })
  it('does not touch commits of its own that GitHub lacks', async () => {
    const { clone, publish } = setup('diverged')
    g(clone, 'commit', '-q', '--allow-empty', '-m', 'mine')
    publish()
    const before = g(clone, 'rev-parse', 'HEAD')
    expect(await update(clone)).toMatchObject({ outcome: 'blocked' })
    expect(g(clone, 'rev-parse', 'HEAD')).toBe(before)
  })
  it('is current when only ahead of GitHub', async () => {
    const { clone } = setup('ahead')
    g(clone, 'commit', '-q', '--allow-empty', '-m', 'mine')
    expect(await update(clone)).toEqual({ outcome: 'current' })
  })
  it('reports being offline', async () => {
    const { clone } = setup('offline')
    g(clone, 'remote', 'set-url', 'origin', join(root, 'does-not-exist.git'))
    expect(await update(clone)).toMatchObject({ outcome: 'offline' })
  })
  it('needs a branch that follows GitHub', async () => {
    const { clone } = setup('untracked')
    g(clone, 'checkout', '-q', '-b', 'local-only')
    expect(await update(clone)).toMatchObject({ outcome: 'blocked' })
  })
})
