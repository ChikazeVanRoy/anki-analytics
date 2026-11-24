// Which version of the code this is, and updating it from GitHub: `git fetch` then a fast-forward, nothing else.
// Never merges, discards or overwrites anything: a checkout with local changes or commits of its own is left alone.
// Git history is the only version number (package.json's is a placeholder).

import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SERVICE_LABEL } from './backgroundService.ts'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface VersionInfo {
  /** Short commit hash, or null when this isn't a git checkout. */
  commit: string | null
  /** The commit's date, YYYY-MM-DD. */
  date: string | null
}

export type UpdateResult =
  | { outcome: 'current' }
  | { outcome: 'updated'; version: VersionInfo; commits: number }
  | { outcome: 'blocked'; message: string }
  | { outcome: 'offline'; message: string }

/** Runs git and returns its trimmed output; rejects when git fails. Injectable so tests need no repository. */
export type Git = (args: string[]) => Promise<string>

// No prompts, and give up on a stalled connection instead of hanging
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_HTTP_LOW_SPEED_LIMIT: '1000',
  GIT_HTTP_LOW_SPEED_TIME: '10',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=10',
}

export function gitIn(cwd: string): Git {
  return async (args) => (await run('git', args, { cwd, env: GIT_ENV, timeout: 60_000 })).stdout.trim()
}

export function readVersion(cwd: string): VersionInfo {
  try {
    const [commit, date] = execFileSync('git', ['log', '-1', '--format=%h %cs'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split(' ')
    return { commit: commit || null, date: date || null }
  } catch {
    return { commit: null, date: null }
  }
}

/** What the server runs, and the built pages, are both read when it starts or is built, so a newer checkout needs one or the other. */
/** The command-line scripts in server/, which the running server never loads (package.json runs each one; tested). */
export const SERVER_SCRIPTS = ['background-service.ts', 'cloud-cli.ts', 'copy-collection.ts', 'make-snapshot.ts', 'phone-access.ts', 'sync-anki.ts']

// What the server loads: its own folder, and the few files it imports from src (none of which import others). Not
// its command-line scripts or tests, which the server never runs.
const SERVER_PATHS = [
  'server',
  ...SERVER_SCRIPTS.map((file) => `:(exclude)server/${file}`),
  ':(exclude)server/*.test.ts',
  'src/lib/dates.ts',
  'src/lib/fsrs.ts',
  'src/lib/firebaseRest.ts',
  'src/lib/snapshot.ts',
  'package-lock.json',
]
const PAGE_PATHS = ['src', 'public', 'index.html', 'package-lock.json', 'vite.config.ts'] // what a build reads, as the launcher checks

/** Whether the server's code changed between the running commit and the checkout: then it needs restarting. */
export function serverCodeChanged(cwd: string, running: string, current: string): boolean {
  if (running === current) return false
  try {
    const changed = execFileSync('git', ['diff', '--name-only', running, current, '--', ...SERVER_PATHS], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return changed.trim() !== ''
  } catch {
    return true // can't tell: better to suggest a restart that isn't needed than miss one
  }
}

/** Tests and their helpers sit in src but aren't built, so changing them needs no new build. */
const notBuilt = (name: string) => name === 'test' || /\.test\.tsx?$/.test(name)

/** The newest modification time among some files and folders, searched all the way down, leaving out tests. */
function newest(path: string): number {
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  return readdirSync(path)
    .filter((name) => !notBuilt(name))
    .reduce((n, name) => Math.max(n, newest(join(path, name))), stat.mtimeMs)
}

/** Whether the built pages are older than their source, so a build is needed (the server serves them as built). */
export function pagesOutdated(cwd: string): boolean {
  const built = join(cwd, 'dist', 'index.html')
  if (!existsSync(built)) return true
  const builtAt = statSync(built).mtimeMs
  return PAGE_PATHS.some((p) => newest(join(cwd, p)) > builtAt)
}

/** How this server was started, so the app can say how to restart it. launchd names its jobs in XPC_SERVICE_NAME. */
export const startedBy = (env = process.env, serviceLabel = SERVICE_LABEL): 'service' | 'other' =>
  env.XPC_SERVICE_NAME === serviceLabel ? 'service' : 'other'

export async function updateFromGitHub(git: Git, versionOf: () => VersionInfo): Promise<UpdateResult> {
  try {
    await git(['rev-parse', '--abbrev-ref', '@{upstream}'])
  } catch {
    return { outcome: 'blocked', message: 'This branch doesn’t follow a branch on GitHub.' }
  }
  if ((await git(['status', '--porcelain', '--untracked-files=no'])) !== '') {
    return { outcome: 'blocked', message: 'You have uncommitted changes, so nothing was changed.' }
  }
  try {
    await git(['fetch', '--quiet'])
  } catch {
    return { outcome: 'offline', message: 'Couldn’t reach GitHub.' }
  }
  const [head, upstream] = [await git(['rev-parse', 'HEAD']), await git(['rev-parse', '@{upstream}'])]
  if (head === upstream) return { outcome: 'current' }
  try {
    await git(['merge-base', '--is-ancestor', head, upstream])
  } catch {
    // Either ahead of GitHub (nothing to get) or diverged (needs a human)
    try {
      await git(['merge-base', '--is-ancestor', upstream, head])
      return { outcome: 'current' }
    } catch {
      return { outcome: 'blocked', message: 'This branch has commits that aren’t on GitHub, so it can’t be fast-forwarded.' }
    }
  }
  const commits = Number(await git(['rev-list', '--count', `${head}..${upstream}`]))
  try {
    await git(['merge', '--ff-only', '--quiet', upstream])
  } catch {
    return { outcome: 'blocked', message: 'The update couldn’t be applied.' }
  }
  return { outcome: 'updated', version: versionOf(), commits }
}
