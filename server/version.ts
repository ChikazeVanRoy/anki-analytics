// Which version of the code this is, and updating it from GitHub: `git fetch` then a fast-forward, nothing else.
// Never merges, discards or overwrites anything: a checkout with local changes or commits of its own is left alone.
// Git history is the only version number (package.json's is a placeholder).

import { execFile, execFileSync } from 'node:child_process'
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
