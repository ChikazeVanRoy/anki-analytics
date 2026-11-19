// CLI: npm run cloud -- login <project-id> <web-api-key> <email>   Sets up the upload to your own Firebase project
//      npm run cloud -- deploy                                      Publishes the phone app and the security rules
//      npm run cloud -- upload | status | off

import { execFileSync } from 'node:child_process'
import { CloudError, defaultNet, signIn } from '../src/lib/firebaseRest.ts'
import {
  loadCloudSettings,
  macKeychain,
  parseCloudSettings,
  readCloudStatus,
  realCloudDeps,
  removeCloudFiles,
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

/** The first run on a Mac: remembers the project and email, asks macOS to keep the password, and checks that it works. */
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
    writeCloudStatus({})
    console.log(`✓ Signed in as ${settings.email}.`)
    console.log(`\nThis account's id is ${session.uid}. The project's owner must allow it once: in the Firebase console, open Firestore`)
    console.log(`Database > Data, start a collection called allowed (if there isn't one), and add a document whose ID is that account id`)
    console.log('(with any one field, such as ok = true). Until then, uploads and the phone are refused.')
    console.log('\nIf you own this Firebase project and haven’t yet published the phone app and the security rules, do that once.')
    console.log('The first time, Firebase opens a browser to log you in:')
    console.log(`  npx firebase-tools@${FIREBASE_TOOLS_VERSION} login`)
    console.log('  npm run cloud -- deploy')
    console.log(`\nThen, on the iPhone, open https://${settings.projectId}.web.app, sign in, and add it to your Home Screen.`)
  } catch (err) {
    const why = err instanceof CloudError ? err.message : String(err)
    fail(`Couldn’t sign in (${why}). Check the email and password in Firebase console > Authentication, then run login again.`)
  }
}

function deploy() {
  const settings = loadCloudSettings()
  if (!settings) return fail('Run npm run cloud -- login first.')
  const run = (command: string, ...commandArgs: string[]) => execFileSync(command, commandArgs, { stdio: 'inherit' })
  run('npm', 'run', 'build')
  // Fixed arguments and no shell. This publishes the app's code (no personal data in it) and the rules, and turns on email sign-in. The version is
  // pinned (a release a few weeks old), as this runs with your Firebase login.
  run('npx', `firebase-tools@${FIREBASE_TOOLS_VERSION}`, 'deploy', '--only', 'hosting,firestore:rules,auth', '--project', settings.projectId)
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
