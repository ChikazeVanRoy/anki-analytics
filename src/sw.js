// The service worker, which lets the installed app open with no connection. Built into dist/sw.js by the plugin in
// vite.config.ts, which fills in the two placeholders below. Not used in dev. Nothing here contacts another site.
//   App files  -> saved at install, so every section works offline
//   The page   -> the newest version if the server answers in time, otherwise the saved one
//   Snapshot   -> likewise, and each one received is kept for next time
//   /api/*     -> never touched or saved: live stats must be live

const FILES = ['__PRECACHE_FILES__']
const APP_CACHE = '__APP_CACHE__'
const SNAPSHOT_CACHE = 'anki-analytics-snapshot'
const SNAPSHOT_URL = '/snapshot.json'
// Less than the page's own wait for a snapshot, so a sleeping server still leaves time to answer from the cache
const NETWORK_TIMEOUT_MS = 3_000

async function fetchInTime(request) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)
  try {
    const response = await fetch(request, { signal: controller.signal })
    // Read it here, so the timeout also covers a body that stalls halfway
    return new Response(await response.blob(), response)
  } finally {
    clearTimeout(timer)
  }
}

async function newestSnapshot() {
  const cache = await caches.open(SNAPSHOT_CACHE)
  try {
    const response = await fetchInTime(SNAPSHOT_URL)
    if (response.ok) {
      await cache.put(SNAPSHOT_URL, response.clone())
      return response
    }
    return (await cache.match(SNAPSHOT_URL)) ?? response
  } catch (err) {
    const saved = await cache.match(SNAPSHOT_URL)
    if (saved) return saved
    throw err
  }
}

async function newestPage(request) {
  try {
    const response = await fetchInTime(request)
    if (response.ok) return response
  } catch {
    // No answer in time: the saved page below
  }
  return (await caches.match('/')) ?? Response.error()
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(FILES)))
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  const keep = [APP_CACHE, SNAPSHOT_CACHE]
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !keep.includes(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

// The page asks for this when it opens, so a snapshot is saved even while live stats mean it's never requested
self.addEventListener('message', (event) => {
  if (event.data === 'save-snapshot') event.waitUntil(newestSnapshot().catch(() => {}))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (url.pathname === SNAPSHOT_URL) event.respondWith(newestSnapshot())
  else if (request.mode === 'navigate') event.respondWith(newestPage(request))
  else event.respondWith(caches.match(request).then((saved) => saved ?? fetch(request)))
})
