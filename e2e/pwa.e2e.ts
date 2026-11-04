import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createApiServer } from '../server/app.ts'
import { writeSnapshot } from '../server/snapshot.ts'
import { messages } from '../src/i18n'
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
