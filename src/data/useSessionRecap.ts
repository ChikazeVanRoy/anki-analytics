import { useCallback, useEffect, useMemo, useState } from 'react'
import { ankiToday, totalsByDate } from '../lib/stats'
import { allDoneToday, recapSince, snapshotOf, type Snapshot } from '../lib/recap'
import type { AnkiData } from './types'

const KEY = 'anki-analytics:last-visit'

/** Storage is only a convenience: without it there's simply no recap. */
function load(): Snapshot | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Snapshot | null
    return saved && typeof saved.reviews === 'number' && typeof saved.day === 'string' && Array.isArray(saved.badges) ? saved : null
  } catch {
    return null
  }
}
function save(snapshot: Snapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    // storage unavailable: nothing to do
  }
}

/** The recap to show for real data, if any. The visit is only recorded once it's dismissed, so a reload keeps it. */
export function useSessionRecap(data: AnkiData | null) {
  const [, redraw] = useState(0)
  const byDate = useMemo(() => (data ? totalsByDate(data.daily) : null), [data])
  const now = useMemo(() => (data && byDate ? snapshotOf(data, byDate, ankiToday(data)) : null), [data, byDate])
  const allDone = useMemo(() => !!data && !!byDate && allDoneToday(data, byDate, ankiToday(data)), [data, byDate])
  const last = now ? load() : null // read each time, as dismissing changes it
  const recap = now && byDate ? recapSince(last, now, byDate, allDone) : null

  useEffect(() => {
    if (now && !recap) save(now)
  }, [now, recap])

  const dismiss = useCallback(() => {
    if (now) save(now)
    redraw((n) => n + 1)
  }, [now])
  return { recap, dismissRecap: dismiss }
}
