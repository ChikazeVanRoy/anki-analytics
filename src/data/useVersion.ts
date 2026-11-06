import { useCallback, useEffect, useState } from 'react'

export interface AppVersion {
  commit: string
  date: string | null
  /** A newer version has been fetched since this server started; opening the launcher again runs it. */
  restartNeeded: boolean
}

export type UpdateOutcome = { kind: 'current' } | { kind: 'updated'; commits: number } | { kind: 'problem'; message: string }

async function fetchVersion(): Promise<AppVersion | null> {
  try {
    const res = await fetch('/api/version')
    const body = res.ok ? ((await res.json()) as Partial<AppVersion>) : null
    return body && typeof body.commit === 'string' ? { commit: body.commit, date: body.date ?? null, restartNeeded: !!body.restartNeeded } : null
  } catch {
    return null // No API: nothing to show
  }
}

/**
 * Which version of the app is running, and a way to get a newer one from GitHub. Nothing is shown when there's no API
 * to ask (your phone), or the app isn't a git checkout, so `version` stays null.
 */
export function useVersion() {
  const [version, setVersion] = useState<AppVersion | null>(null)
  const [checking, setChecking] = useState(false)
  const [outcome, setOutcome] = useState<UpdateOutcome | null>(null)

  useEffect(() => {
    let stopped = false
    void fetchVersion().then((v) => v && !stopped && setVersion(v))
    return () => {
      stopped = true
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    setChecking(true)
    setOutcome(null)
    try {
      const res = await fetch('/api/update', { method: 'POST', headers: { 'X-Requested-By': 'anki-analytics' } })
      const body = (await res.json()) as { outcome?: string; commits?: number; message?: string; error?: string }
      if (body.outcome === 'current') setOutcome({ kind: 'current' })
      else if (body.outcome === 'updated') {
        setOutcome({ kind: 'updated', commits: body.commits ?? 1 })
        setVersion((await fetchVersion()) ?? version)
      } else setOutcome({ kind: 'problem', message: body.message ?? body.error ?? 'The update failed.' })
    } catch {
      setOutcome({ kind: 'problem', message: 'The local API didn’t answer.' })
    } finally {
      setChecking(false)
    }
  }, [version])

  return { version, checking, outcome, checkForUpdate }
}
