/** Lets the built app open with no connection (see src/sw.js). Failing only costs that, so errors are ignored. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.active?.postMessage('save-snapshot'))
      .catch(() => {})
  })
}
