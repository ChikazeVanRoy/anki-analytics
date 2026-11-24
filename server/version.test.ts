import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { gitIn, pagesOutdated, readVersion, SERVER_SCRIPTS, serverCodeChanged, startedBy, updateFromGitHub } from './version.ts'

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

describe('whether a restart is needed', () => {
  it('only counts changes to code the server runs, not its command-line scripts, tests or the pages', () => {
    const repo = join(root, 'restart')
    mkdirSync(join(repo, 'server'), { recursive: true })
    mkdirSync(join(repo, 'src', 'lib'), { recursive: true })
    g(root, 'init', '-q', '-b', 'main', repo)
    const commit = (file: string) => {
      writeFileSync(join(repo, file), String(Math.random()))
      g(repo, 'add', '-A')
      g(repo, 'commit', '-q', '-m', file)
      return g(repo, 'rev-parse', '--short', 'HEAD')
    }
    const start = commit('server/app.ts')
    const scripts = [commit('server/cloud-cli.ts'), commit('server/app.test.ts'), commit('src/lib/stats.ts')].at(-1)!
    expect(serverCodeChanged(repo, start, scripts)).toBe(false)
    expect(serverCodeChanged(repo, start, commit('src/lib/fsrs.ts'))).toBe(true) // the server imports it
    expect(serverCodeChanged(repo, scripts, commit('server/app.ts'))).toBe(true)
    expect(serverCodeChanged(repo, start, start)).toBe(false)
    expect(serverCodeChanged(repo, 'nosuchcommit', start)).toBe(true) // can't tell, so suggest it
  })

  it('says the pages need building when any of their source is newer than the build', () => {
    const app = join(root, 'pages')
    mkdirSync(join(app, 'src', 'deep'), { recursive: true })
    mkdirSync(join(app, 'dist'), { recursive: true })
    expect(pagesOutdated(app)).toBe(true) // never built
    writeFileSync(join(app, 'src', 'deep', 'a.ts'), '')
    writeFileSync(join(app, 'dist', 'index.html'), '')
    const old = new Date(Date.now() - 60_000)
    utimesSync(join(app, 'src', 'deep', 'a.ts'), old, old)
    utimesSync(join(app, 'src', 'deep'), old, old)
    utimesSync(join(app, 'src'), old, old)
    expect(pagesOutdated(app)).toBe(false)
    writeFileSync(join(app, 'src', 'deep', 'a.test.ts'), '') // not built: no new build needed
    utimesSync(join(app, 'src', 'deep'), old, old)
    expect(pagesOutdated(app)).toBe(false)
    writeFileSync(join(app, 'src', 'deep', 'a.ts'), 'changed')
    expect(pagesOutdated(app)).toBe(true)
  })

  it('lists exactly the command-line scripts package.json runs, and the server imports none of them', () => {
    const scripts = Object.values(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts as Record<string, string>)
    const run = new Set(scripts.flatMap((s) => [...s.matchAll(/server\/([\w-]+\.ts)/g)].map((m) => m[1])))
    run.delete('index.ts') // the server itself
    expect([...run].sort()).toEqual([...SERVER_SCRIPTS].sort())
    const serverDir = new URL('.', import.meta.url)
    for (const file of readdirSync(serverDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !SERVER_SCRIPTS.includes(f))) {
      const source = readFileSync(new URL(file, serverDir), 'utf8')
      for (const script of SERVER_SCRIPTS) expect(source, `${file} imports ${script}`).not.toContain(`./${script}`)
    }
  })

  it('knows when launchd runs it as the background service', () => {
    expect(startedBy({ XPC_SERVICE_NAME: 'local.anki-analytics' })).toBe('service')
    expect(startedBy({ XPC_SERVICE_NAME: '0' })).toBe('other')
    expect(startedBy({})).toBe('other')
  })
})
