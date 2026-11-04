import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Files in public/ that the installed app needs; Vite doesn't list those in the bundle
const PUBLIC_FILES = ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']

/**
 * Builds dist/sw.js from src/sw.js, listing this build's files. Built file names contain a hash of their content, so any
 * change alters sw.js, which is how a browser learns that there's a new version to save.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post', // after the page itself has joined the bundle
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((file) => file !== 'index.html').map((file) => `/${file}`)
      const files = ['/', ...built, ...PUBLIC_FILES].sort()
      const version = createHash('sha256').update(files.join()).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('src/sw.js', import.meta.url), 'utf8')
        .replace("['__PRECACHE_FILES__']", JSON.stringify(files))
        .replace('__APP_CACHE__', `anki-analytics-app-${version}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  // Planner tests wait through several debounced simulation runs in real time, which a busy machine can stretch
  test: { testTimeout: 20_000 },
  server: {
    // Forward these to the local Node API, so the browser sees one origin (no CORS setup needed)
    proxy: { '/api': 'http://127.0.0.1:5174', '/snapshot.json': 'http://127.0.0.1:5174' },
  },
})
