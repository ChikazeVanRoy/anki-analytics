import { expect, test, type Page } from '@playwright/test'
import { messages } from '../src/i18n'
import { realShapedData } from '../src/test/fsrsFixture'

const ROUTES = ['#/', '#/activity', '#/planner', '#/advanced']

/** Fails on any browser error, apart from the failed requests a test sets up on purpose. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text())
  })
  return errors
}

async function useRealShapedData(page: Page) {
  await page.route('**/api/stats', (route) => route.fulfill({ json: realShapedData() }))
  // Answered here so it never reaches a real API running on this machine
  await page.route('**/api/status', (route) => route.fulfill({ json: { ankiRunning: true, updateAvailable: false, sourceModified: null } }))
}
const useNoApi = (page: Page) => page.route('**/api/**', (route) => route.abort())

const expectNoSidewaysScroll = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0)

for (const route of ROUTES) {
  test(`${route} renders real-shaped data without errors or sideways scroll`, async ({ page }) => {
    const errors = watchErrors(page)
    await useRealShapedData(page)
    await page.goto(route)
    await expect(page.locator('main h1, main h2').first()).toBeVisible()
    await expect(page.getByText(messages.data.sampleTitle)).toHaveCount(0)
    await expectNoSidewaysScroll(page)
    expect(errors).toEqual([])
  })
}

for (const route of ['#/', '#/activity', '#/advanced']) {
  test(`${route} keeps every tooltip inside the viewport`, async ({ page }) => {
    await useRealShapedData(page)
    await page.goto(route)
    await expect(page.locator('main h1').first()).toBeVisible()
    const buttons = page.locator('main button[aria-describedby]:visible')
    await expect(buttons.first()).toBeVisible()
    const width = page.viewportSize()!.width
    const height = page.viewportSize()!.height
    for (let i = 0; i < (await buttons.count()); i++) {
      const button = buttons.nth(i)
      await button.scrollIntoViewIfNeeded()
      await button.click()
      const id = await button.getAttribute('aria-describedby')
      const tip = page.locator(`[id="${id}"]`)
      await expect(tip).toBeVisible()
      const box = (await tip.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(height)
      await page.keyboard.press('Escape')
      await button.blur()
    }
  })
}

test('falls back to labelled sample data with no API, and never calls it measured', async ({ page }) => {
  await useNoApi(page)
  await page.goto('#/')
  await expect(page.getByText(messages.data.sampleTitle)).toBeVisible()
  for (const route of ['#/planner', '#/advanced']) {
    await page.goto(route)
    await expect(page.locator('main').getByText(messages.badges.sample, { exact: true })).toBeVisible()
    await expect(page.getByText(messages.badges.measured, { exact: true })).toHaveCount(0)
  }
})

test('a refused refresh explains itself and keeps the real data', async ({ page }) => {
  await useRealShapedData(page)
  await page.route('**/api/refresh', (route) =>
    route.fulfill({ status: 409, json: { error: 'Anki is running. Quit Anki completely, then try again.' } }),
  )
  await page.goto('#/')
  await page.getByRole('button', { name: messages.data.refresh }).click()
  await expect(page.getByRole('alert')).toContainText('Anki is running')
  await expect(page.getByText(messages.data.sampleTitle)).toHaveCount(0)
})

test('the study calendar fits the screen, and pages through older weeks when it can’t', async ({ page }, info) => {
  await useRealShapedData(page)
  await page.goto('#/activity')
  await expect(page.getByRole('heading', { name: 'When did I study?' })).toBeVisible()
  const earlier = page.getByRole('button', { name: messages.activity.earlier })
  const grid = page.getByRole('grid')
  const fits = () =>
    grid.evaluate((el) => {
      const box = el.closest('section')!.getBoundingClientRect()
      return el.getBoundingClientRect().right <= box.right
    })
  expect(await fits()).toBe(true)
  if (info.project.name === 'desktop') return expect(earlier).toHaveCount(0)
  const before = await grid.getAttribute('aria-label')
  await earlier.click()
  await expect(grid).not.toHaveAttribute('aria-label', before!)
  expect(await fits()).toBe(true)
  await expect(page.getByRole('button', { name: messages.activity.later })).toBeEnabled()
})

test('a keyboard user can read each day on the Home activity chart', async ({ page }) => {
  await useRealShapedData(page)
  await page.goto('#/')
  const chart = page.getByRole('list', { name: /of the last 14 days/ })
  const readout = page.getByTestId('day-readout')
  await chart.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(readout).toContainText('review')
  await page.keyboard.press('Escape')
  await expect(readout).toHaveText('')
})

test('picking the last day on the Home chart stays on screen', async ({ page }) => {
  await useRealShapedData(page)
  await page.goto('#/')
  const chart = page.getByRole('list', { name: /of the last 14 days/ })
  await chart.locator('li').last().click()
  const readout = page.getByTestId('day-readout')
  await expect(readout).toContainText('review')
  const box = (await readout.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expectNoSidewaysScroll(page)
})

test('a Planner pace sets the new-card limit, and the sliders are one tap away', async ({ page }) => {
  await useRealShapedData(page)
  await page.goto('#/planner')
  const push = page.getByRole('radio', { name: /Push/ })
  await expect(push).toContainText('new')
  await push.click()
  await expect(push).toHaveAttribute('aria-checked', 'true')
  await page.getByText('Fine-tune the simulation').click()
  await page.getByRole('slider', { name: 'New cards per day' }).fill('7')
  await expect(page.getByText(messages.planner.pace.custom(7))).toBeVisible()
  await expect(push).toHaveAttribute('aria-checked', 'false')
})

test('the Planner result stays in view while scrolling on small screens', async ({ page }, info) => {
  await useRealShapedData(page)
  await page.goto('#/planner')
  const summary = page.getByTestId('plan-summary')
  if (info.project.name === 'desktop') {
    await expect(page.getByRole('heading', { name: 'What to expect' })).toBeVisible()
    return expect(summary).toBeHidden()
  }
  await expect(summary).toContainText('reviews')
  await page.evaluate(() => window.scrollTo(0, 1500))
  await expect.poll(async () => (await summary.boundingBox())!.y).toBeLessThan(100)
  await expect(summary).toBeInViewport()
})

test('offers an update once Anki has closed with newer reviews', async ({ page }) => {
  await useRealShapedData(page)
  await page.route('**/api/status', (route) => route.fulfill({ json: { ankiRunning: false, updateAvailable: true, sourceModified: 1 } }))
  await page.route('**/api/refresh', (route) => route.fulfill({ json: realShapedData() }))
  await page.goto('#/')
  await expect(page.getByText(messages.data.update.reviews)).toBeVisible()
  await page.getByRole('button', { name: messages.data.updateNow }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
