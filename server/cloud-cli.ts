// CLI: npm run cloud -- login <project-id> <web-api-key> <email>   Sets up the upload to your own Firebase project
//      npm run cloud -- deploy                                      Publishes the phone app and the security rules
//      npm run cloud -- upload | status | off

import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { CloudError, defaultNet, signIn } from '../src/lib/firebaseRest.ts'
import {
  firestoreRules,
  loadCloudSettings,
  macKeychain,
  parseCloudSettings,
  readCloudStatus,
  realCloudDeps,
  removeCloudFiles,
  RULES_FILE,
  saveCloudSettings,
  uploadSnapshot,
  writeCloudStatus,
} from './cloud.ts'

const FIREBASE_TOOLS_VERSION = '15.34.1'

const [command, ...args] = process.argv.slice(2)

const fail = (message: string): never => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

/** The first run: remembers the project and email, asks macOS to keep the password, checks it works, writes the rules. */
async function login() {
  const [projectId, apiKey, email] = args
  const settings = parseCloudSettings({ projectId, apiKey, email })
  if (!settings) {
    return fail('Usage: npm run cloud -- login <project-id> <web-api-key> <email>\n  Find the first two in Firebase console > Project settings > Your apps (the web app).')
  }
  saveCloudSettings(settings)
  console.log(`Password for ${settings.email} (kept in your macOS Keychain, never in a file):`)
  macKeychain.save(settings.email)
  const password = macKeychain.read(settings.email)
  if (!password) return fail('The password wasn’t saved.')
  try {
    const session = await signIn(settings, settings.email, password, defaultNet())
    writeFileSync(RULES_FILE, firestoreRules(session.uid), { mode: 0o600 })
    writeCloudStatus({})
    console.log(`✓ Signed in as ${settings.email}.`)
    console.log('\nNext, publish the phone app and the security rules. The first time, Firebase opens a browser to log you in:')
    console.log(`  npx firebase-tools@${FIREBASE_TOOLS_VERSION} login`)
    console.log('  npm run cloud -- deploy')
    console.log(`\nThen open https://${settings.projectId}.web.app on your iPhone, sign in, and add it to your Home Screen.`)
  } catch (err) {
    const why = err instanceof CloudError ? err.message : String(err)
    fail(`Couldn’t sign in (${why}). Check the email and password in Firebase console > Authentication, then run login again.`)
  }
}

function deploy() {
  const settings = loadCloudSettings()
  if (!settings) return fail('Run npm run cloud -- login first.')
  if (!existsSync(RULES_FILE)) return fail('The security rules are missing. Run npm run cloud -- login again.')
  const run = (command: string, ...commandArgs: string[]) => execFileSync(command, commandArgs, { stdio: 'inherit' })
  run('npm', 'run', 'build')
  // Fixed arguments and no shell. This publishes the app's code (no personal data in it) and the rules. The version is
  // pinned (a release a few weeks old), as this runs with your Firebase login.
  run('npx', `firebase-tools@${FIREBASE_TOOLS_VERSION}`, 'deploy', '--only', 'hosting,firestore:rules', '--project', settings.projectId)
}

async function upload() {
  const result = await uploadSnapshot(realCloudDeps(), { force: true })
  console.log(`${result.outcome === 'failed' ? '✗' : '✓'} ${result.message}`)
  if (result.outcome === 'failed') process.exitCode = 1
}

function status() {
  const settings = loadCloudSettings()
  if (!settings) return console.log('Cloud upload isn’t set up. Run: npm run cloud -- login <project-id> <web-api-key> <email>')
  const last = readCloudStatus()
  console.log(`Project: ${settings.projectId}   Account: ${settings.email}`)
  console.log(`Password in Keychain: ${macKeychain.read(settings.email) ? 'yes' : 'NO (run login)'}`)
  console.log(`Last upload: ${last.uploadedAt ?? 'never'}${last.generatedAt ? ` (stats from ${last.generatedAt})` : ''}`)
  if (last.problem) console.log(`Problem: ${last.problem.message} (${last.problem.at})`)
}

function off() {
  const settings = loadCloudSettings()
  if (settings) macKeychain.remove(settings.email)
  removeCloudFiles()
  console.log('✓ Uploading has stopped, and the saved password and settings are gone.')
  console.log('  The snapshot already in Firebase stays until you delete it: Firebase console > Firestore > snapshots > latest.')
}

switch (command) {
  case 'login':
    await login()
    break
  case 'deploy':
    deploy()
    break
  case 'upload':
    await upload()
    break
  case 'status':
    status()
    break
  case 'off':
    off()
    break
  default:
    fail('Usage: npm run cloud -- login | deploy | upload | status | off')
}
