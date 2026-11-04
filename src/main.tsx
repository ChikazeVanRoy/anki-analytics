import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './app/registerServiceWorker'

// The weekly goal is gone; clear what it saved
try {
  localStorage.removeItem('anki-analytics.weekly-goal')
} catch {
  // Storage unavailable (private mode, blocked site data): nothing to clear
}

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
