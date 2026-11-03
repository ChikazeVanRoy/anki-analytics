import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
const KEY = 'anki-analytics.theme'

/** Reads the saved choice. Storage can be unavailable (private mode, blocked site data). */
function load(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Light / dark / match-system. Applies `data-theme` on <html>; the CSS tokens use light-dark(),
 * so nothing else needs to know the theme. index.html applies the saved value before first paint.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(load)

  useEffect(() => {
    const root = document.documentElement
    if (choice === 'system') delete root.dataset.theme
    else root.dataset.theme = choice
    try {
      if (choice === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, choice)
    } catch {
      // Not saved; the choice still applies for this visit
    }
  }, [choice])

  const cycle = useCallback(
    () => setChoice((c) => (c === 'system' ? 'light' : c === 'light' ? 'dark' : 'system')),
    [],
  )
  return { choice, setChoice, cycle }
}
