// Starts the local API. Listens on 127.0.0.1 only, so it is not reachable from other devices.
// Run with: npm run api   (Node runs this TypeScript file directly, no build step)

import { createApiServer } from './app.ts'

const HOST = '127.0.0.1'
const PORT = 5174

createApiServer().listen(PORT, HOST, () => {
  console.log(`Anki API on http://${HOST}:${PORT}  (GET /api/stats, POST /api/refresh)`)
})
