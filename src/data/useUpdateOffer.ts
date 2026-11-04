import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 15_000

/** Why a refresh is worth offering: Anki has newer reviews, or the copy is from before today's rollover. */
export type UpdateReason = 'reviews' | 'day'

/**
 * Watches for Anki closing with reviews this copy doesn't have, so the app can refresh by itself instead of a
 * refresh failing because Anki is still open. Checks while the page is in view, and again whenever the copy
 * changes. `version` tells one update from the next. Dismissing hides that one version of the collection; newer
 * reviews offer again.
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
        const body = res.ok ? ((await res.json()) as { ankiRunning: boolean; updateAvailable: boolean; sourceModified: number | null; copyModified?: number | null }) : null
        // The launcher's sync replaced the copy since this page read it
        const copied = !!body?.copyModified && !body.ankiRunning && !!copiedAt && Math.floor(body.copyModified) > Date.parse(copiedAt)
        const reason = body?.updateAvailable || copied ? 'reviews' : newDay && body && !body.ankiRunning ? 'day' : null
        const modified = copied ? body?.copyModified : body?.sourceModified
        if (!stopped) setAvailable(reason && modified != null ? { modified, reason } : null)
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
  const shown = available && available.modified !== dismissed ? available : null
  return { update: shown?.reason ?? null, version: shown?.modified ?? null, dismissUpdate: dismiss }
}
