import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 15_000

/**
 * Watches for Anki closing with reviews this copy doesn't have, so the app can offer a refresh instead of a
 * refresh failing because Anki is still open. Checks while the page is in view, and again whenever the copy
 * changes. Dismissing hides that one version of the collection; newer reviews offer again.
 */
export function useUpdateOffer(copiedAt: string | undefined) {
  const [available, setAvailable] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState<number | null>(null)

  useEffect(() => {
    let stopped = false
    const check = async () => {
      if (document.hidden) return
      try {
        const res = await fetch('/api/status')
        const body = res.ok ? ((await res.json()) as { updateAvailable: boolean; sourceModified: number | null }) : null
        if (!stopped) setAvailable(body?.updateAvailable ? body.sourceModified : null)
      } catch {
        if (!stopped) setAvailable(null) // API not running: there's nothing to offer
      }
    }
    void check()
    const timer = setInterval(check, POLL_MS)
    window.addEventListener('focus', check)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [copiedAt])

  const dismiss = useCallback(() => setDismissed(available), [available])
  return { updateReady: available !== null && available !== dismissed, dismissUpdate: dismiss }
}
