import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createApiServer } from '../server/app.ts'
import { serveFile } from '../server/staticFiles.ts'
import { writeSnapshot } from '../server/snapshot.ts'
import { messages } from '../src/i18n'
import { defaultNet, putSnapshot, signIn } from '../src/lib/firebaseRest'
import { SNAPSHOT_VERSION } from '../src/lib/snapshot'
import { fakeFirebase } from '../src/test/fakeFirebase'
import { standInForGoogle } from './standInForGoogle'
import { realShapedData } from '../src/test/fsrsFixture'

// The real server and service worker on a real build. Synthetic data only: the fake paths and copy keep it away from Anki.
const dir = mkdtempSync(join(tmpdir(), 'anki-analytics-pwa-'))
const distDir = 'node_modules/.tmp/pwa-dist'
let server: Server
let base: string

// They share one build and one server
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  execFileSync('npx', ['vite', 'build', '--outDir', distDir, '--emptyOutDir', '--logLevel', 'error'], { stdio: 'inherit' })
  const snapshotPath = join(dir, 'snapshot.json')
  writeSnapshot(realShapedData(), snapshotPath)
  server = createApiServer({
    collectionPath: join(dir, 'no-collection.anki2'),
    snapshotPath,
    distDir: `${distDir}/`,
    copy: () => {
      throw new Error('Not in tests')
    },
    status: () => ({ ankiRunning: false, updateAvailable: false, sourceModified: null, copyModified: null }),
    sync: () => null,
    log: () => {},
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
})

test.afterAll(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
})

test('can be installed: the manifest and its icons are served', async ({ request }) => {
  const manifest = await request.get(`${base}/manifest.webmanifest`)
  expect(manifest.headers()['content-type']).toBe('application/manifest+json')
  const { display, icons } = (await manifest.json()) as { display: string; icons: { src: string }[] }
  expect(display).toBe('standalone')
  for (const { src } of [...icons, { src: '/icons/apple-touch-icon.png' }]) {
    expect((await request.get(`${base}${src}`)).status()).toBe(200)
  }
})

test('opens every section with the server stopped, from what it saved', async ({ page }) => {
  await page.goto(`${base}/`)
  await expect(page.getByText(messages.data.snapshotTitle)).toBeVisible()
  await expect.poll(() => page.evaluate(async () => !!(await caches.match('/snapshot.json')))).toBe(true)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))

  await page.reload()
  await expect(page.getByText(messages.data.snapshotTitle)).toBeVisible()
  await expect(page.getByText(messages.data.sampleTitle)).toHaveCount(0)
  await expect(page.getByRole('button', { name: messages.data.refresh })).toHaveCount(0)
  for (const route of ['activity', 'planner', 'advanced', 'wrapped']) {
    await page.goto(`${base}/#/${route}`)
    await expect(page.locator('main h1, main h2').first()).toBeVisible()
  }
})

test('on Firebase Hosting: signs in, then opens with everything stopped from the snapshot it kept', async ({ page }) => {
  const google = fakeFirebase({ hosts: defaultNet().hosts })
  const data = realShapedData()
  const session = await signIn(google.config, google.email, google.password, google.net)
  await putSnapshot(google.config, session, JSON.stringify({ version: SNAPSHOT_VERSION, data }), data.generatedAt, google.net)
  await standInForGoogle(page, google)

  // What Firebase Hosting does: the app's files, its project settings at a fixed address, and 404 for everything else
  const hosting = createServer((req, res) => {
    if (req.url === '/__/firebase/init.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return void res.end(JSON.stringify(google.config))
    }
    if (req.method === 'GET' && serveFile(req.url ?? '/', distDir, res)) return
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{"error":"Not found"}')
  })
  await new Promise<void>((resolve) => hosting.listen(0, '127.0.0.1', resolve))
  const address = `http://localhost:${(hosting.address() as AddressInfo).port}/`

  await page.goto(address)
  await page.getByLabel(messages.cloud.email).fill(google.email)
  await page.getByLabel(messages.cloud.password).fill(google.password)
  await page.getByRole('button', { name: messages.cloud.signIn }).click()
  await expect(page.getByText(messages.data.snapshotTitle)).toBeVisible()
  // The real service worker has the app, and the snapshot the page kept for it
  await expect.poll(() => page.evaluate(async () => !!(await caches.match('/snapshot.json')))).toBe(true)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  hosting.closeAllConnections()
  await new Promise((resolve) => hosting.close(resolve))
  google.state.offline = true

  await page.reload()
  await expect(page.getByText(messages.data.snapshotTitle)).toBeVisible()
  await expect(page.getByLabel(messages.cloud.email)).toHaveCount(0)
  await expect(page.getByText(messages.data.sampleTitle)).toHaveCount(0)
  await page.goto(`${address}#/activity`)
  await expect(page.locator('main h1, main h2').first()).toBeVisible()
})

