import { useEffect, useState } from 'react'
import { ankiDayKey } from '../lib/dates'

/**
 * The current Anki day, checked every minute, so pages left open notice when it rolls over. It's the only thing here
 * that changes state, so an open page redraws once a day rather than every time the clock is checked.
 */
export function useAnkiDay(dayStartHour: number, intervalMs = 60_000) {
  const [day, setDay] = useState(() => ankiDayKey(Date.now(), dayStartHour))
  useEffect(() => {
    const check = () => setDay(ankiDayKey(Date.now(), dayStartHour))
    check()
    const timer = setInterval(check, intervalMs)
    return () => clearInterval(timer)
  }, [dayStartHour, intervalMs])
  return day
}
