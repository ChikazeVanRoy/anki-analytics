// CLI: npm run service -- on        Keep the app running in the background from login (no Terminal window needed)
//      npm run service -- off       Stop it and remove it
//      npm run service -- restart   Restart it, e.g. after pulling new code
//      npm run service -- status

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPlist, plistPath, SERVICE_LABEL } from './backgroundService.ts'

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)))
const port = Number(process.env.ANKI_ANALYTICS_PORT) || 5174
const domain = `gui/${process.getuid?.() ?? 501}`
const target = `${domain}/${SERVICE_LABEL}`
const url = `http://localhost:${port}`

function launchctl(...args: string[]): string {
  return execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

const isLoaded = () => {
  try {
    launchctl('print', target)
    return true
  } catch {
    return false
  }
}

const isAnswering = () =>
  fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false)

function unload() {
  if (isLoaded()) launchctl('bootout', target)
}

async function on() {
  if (!isLoaded() && (await isAnswering())) {
    console.error(`Something is already serving ${url} (the launcher window or npm run dev). Close it first, then run this again.`)
    process.exit(1)
  }
  if (!existsSync('dist/index.html')) {
    console.log('Building the app...')
    execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: repoDir, stdio: 'inherit' })
  }
  mkdirSync(`${repoDir}/data`, { recursive: true })
  mkdirSync(dirname(plistPath()), { recursive: true })
  writeFileSync(plistPath(), buildPlist({ nodePath: process.execPath, repoDir, port }))
  unload()
  launchctl('bootstrap', domain, plistPath())
  console.log(`✓ Running in the background and at every login: ${url}`)
  console.log('  Log: data/server.log. After pulling new code run: npm run service -- restart')
}

function off() {
  unload()
  rmSync(plistPath(), { force: true })
  console.log('✓ Stopped, and it will no longer start at login.')
}

function restart() {
  if (!isLoaded()) {
    console.error('Not set up. Run: npm run service -- on')
    process.exit(1)
  }
  launchctl('kickstart', '-k', target)
  console.log('✓ Restarted.')
}

async function status() {
  const loaded = isLoaded()
  const answering = await isAnswering()
  console.log(`Background service: ${loaded ? 'on' : 'off'}. ${url} ${answering ? 'is answering' : 'is not answering'}.`)
}

if (process.platform !== 'darwin') {
  console.error('The background service uses launchd, so it only works on macOS.')
  process.exit(1)
}

const command = process.argv[2]
if (command === 'on') await on()
else if (command === 'off') off()
else if (command === 'restart') restart()
else if (command === 'status') await status()
else {
  console.error('Usage: npm run service -- on | off | restart | status')
  process.exit(1)
}
