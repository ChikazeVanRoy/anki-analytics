import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every minute, so pages left open notice when Anki's day rolls over
 * (derive the Anki day from it with ankiDayKey).
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
