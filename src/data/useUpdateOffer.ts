import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 15_000

/** Why a refresh is worth offering: Anki has newer reviews, or the copy is from before today's rollover. */
export type UpdateReason = 'reviews' | 'day'

/**
 * Watches for Anki closing with reviews this copy doesn't have, so the app can offer a refresh instead of a
 * refresh failing because Anki is still open. Checks while the page is in view, and again whenever the copy
 * changes. Dismissing hides that one version of the collection; newer reviews offer again.
 * `newDay`: the copy is from an earlier Anki day, so a refresh is what brings today's due cards in.
 */
export function useUpdateOffer(copiedAt: string | undefined, newDay: boolean) {
  const [available, setAvailable] = useState<{ modified: number; reason: UpdateReason } | null>(null)
  const [dismissed, setDismissed] = useState<number | null>(null)

  useEffect(() => {
    let stopped = false
    const check = async () => {
      if (document.hidden) return
      try {
        const res = await fetch('/api/status')
        const body = res.ok ? ((await res.json()) as { ankiRunning: boolean; updateAvailable: boolean; sourceModified: number | null }) : null
        const reason = body?.updateAvailable ? 'reviews' : newDay && body && !body.ankiRunning ? 'day' : null
        if (!stopped) setAvailable(reason && body?.sourceModified != null ? { modified: body.sourceModified, reason } : null)
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
  }, [copiedAt, newDay])

  const dismiss = useCallback(() => setDismissed(available?.modified ?? null), [available])
  return { update: available && available.modified !== dismissed ? available.reason : null, dismissUpdate: dismiss }
}
