// Draws the app's icons (favicon, installed-app icons, the launcher's Finder icon) from one drawing, so they always match.
// Run: node scripts/make-icons.ts   (uses the installed Chrome through Playwright to turn the drawing into PNGs)

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const at = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

// Two flashcards, the front one showing rising bars: your reviews, and how they add up.
const cards = `
  <rect x="150" y="96" width="240" height="292" rx="40" fill="#ffb46b" transform="rotate(12 270 242)"/>
  <rect x="132" y="120" width="240" height="292" rx="40" fill="#ffffff"/>
  <rect x="172" y="330" width="40" height="42" rx="11" fill="#a99bf7"/>
  <rect x="232" y="280" width="40" height="92" rx="11" fill="#7f66ec"/>
  <rect x="292" y="212" width="40" height="160" rx="11" fill="#5539c9"/>`

const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7f66ec"/><stop offset="1" stop-color="#4a31b8"/></linearGradient></defs>`

/** A rounded square, the shape of an icon on macOS and in a browser tab. */
const rounded = (inset: number, scale: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect x="${inset}" y="${inset}" width="${512 - 2 * inset}" height="${512 - 2 * inset}" rx="${(512 - 2 * inset) * 0.225}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${cards}</g></svg>`

/** A full square: iOS and Android round it themselves. */
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(256 256) scale(0.9) translate(-256 -256)">${cards}</g></svg>`

writeFileSync(at('public/favicon.svg'), rounded(0, 1))

const browser = await chromium.launch({ channel: 'chrome' })
async function png(svg: string, size: number, path: string, transparent = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
  writeFileSync(at(path), await page.screenshot({ omitBackground: transparent }))
  await page.close()
}
await png(full, 512, 'public/icons/icon-512.png')
await png(full, 192, 'public/icons/icon-192.png')
await png(full, 180, 'public/icons/apple-touch-icon.png')
await png(rounded(32, 0.8), 512, 'scripts/launcher-icon.png', true) // Finder shows the picture as is, so it has the margin and corners itself
await browser.close()
console.log('✓ Icons written')
