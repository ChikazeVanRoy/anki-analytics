import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Planner tests wait through several debounced simulation runs in real time, which a busy machine can stretch
  test: { testTimeout: 20_000 },
  server: {
    // Forward these to the local Node API, so the browser sees one origin (no CORS setup needed)
    proxy: { '/api': 'http://127.0.0.1:5174', '/snapshot.json': 'http://127.0.0.1:5174' },
  },
})
