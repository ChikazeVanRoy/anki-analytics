import { defineConfig } from '@playwright/test'

// Smoke tests of the built UI at phone and desktop widths. They use the installed Chrome (no browser download)
// and answer every /api call themselves with synthetic data, so they never touch a real collection.
const PORT = 5183

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', headless: true },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: { command: `npx vite --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: false },
})
