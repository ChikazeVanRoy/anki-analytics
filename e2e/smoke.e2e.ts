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

const useRealShapedData = (page: Page) =>
  page.route('**/api/stats', (route) => route.fulfill({ json: realShapedData() }))
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

test('keyboard users can reach the sideways-scrolling study calendar', async ({ page }) => {
  await useRealShapedData(page)
  await page.goto('#/activity')
  await expect(page.getByRole('region', { name: /Study calendar/ })).toHaveAttribute('tabindex', '0')
})
