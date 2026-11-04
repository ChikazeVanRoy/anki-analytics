import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AppShell, LoadingScreen, PageSkeleton } from './app/AppShell'
import { ErrorBoundary } from './app/ErrorBoundary'
import { useRoute } from './app/useRoute'
import { useNow } from './app/useNow'
import { useTheme } from './app/useTheme'
import { DeckColors } from './data/deckColors'
import type { AnkiData } from './data/types'
import { useAnkiData } from './data/useAnkiData'
import { useUpdateOffer } from './data/useUpdateOffer'
import { messages } from './i18n'
import { ankiDayKey } from './lib/dates'
import { ankiToday, type RangeKey } from './lib/stats'
import { deckColorMap } from './lib/theme'
import { HomePage } from './pages/HomePage'

// Chart-heavy sections load on demand, so Home appears without downloading the charting library
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const PlannerPage = lazy(() => import('./pages/PlannerPage').then((m) => ({ default: m.PlannerPage })))
const AdvancedPage = lazy(() => import('./pages/AdvancedPage').then((m) => ({ default: m.AdvancedPage })))

export default function App() {
  const { state, refresh, refreshing, refreshError, clearRefreshError } = useAnkiData()
  const { updateReady, dismissUpdate } = useUpdateOffer(state.status === 'ready' ? state.data.generatedAt : undefined)
  const theme = useTheme()
  const route = useRoute()
  // Lifted so the Activity range survives switching sections
  const [range, setRange] = useState<RangeKey>('30d')
  const now = useNow()
  const decks = state.status === 'ready' ? state.data.decks : undefined
  const deckColors = useMemo(() => deckColorMap(decks ?? []), [decks])

  useEffect(() => {
    document.title = route === 'home' ? messages.appName : `${messages.nav[route]} · ${messages.appName}`
  }, [route])

  if (state.status === 'loading') return <LoadingScreen />

  return (
    <AppShell
      route={route}
      data={state.data}
      fallbackReason={state.fallbackReason}
      fallbackKind={state.fallbackKind}
      onRefresh={refresh}
      refreshing={refreshing}
      refreshError={refreshError}
      updateReady={updateReady}
      onDismissUpdate={dismissUpdate}
      onDismissError={clearRefreshError}
      theme={theme.choice}
      onCycleTheme={theme.cycle}
    >
      <DeckColors.Provider value={deckColors}>
        <ErrorBoundary key={route}>
          <Suspense fallback={<PageSkeleton />}>
            {/* Keyed by the Anki day, so a page left open past the rollover hour recomputes "today" */}
            <Page
              key={ankiDayKey(now, state.data.dayStartHour)}
              route={route}
              data={state.data}
              range={range}
              onRangeChange={setRange}
            />
          </Suspense>
        </ErrorBoundary>
      </DeckColors.Provider>
    </AppShell>
  )
}

function Page({ route, data, range, onRangeChange }: { route: string; data: AnkiData; range: RangeKey; onRangeChange: (r: RangeKey) => void }) {
  const today = useMemo(() => ankiToday(data), [data])
  switch (route) {
    case 'activity':
      return <ActivityPage data={data} range={range} onRangeChange={onRangeChange} />
    case 'planner':
      return <PlannerPage data={data} today={today} />
    case 'advanced':
      return <AdvancedPage data={data} today={today} />
    default:
      return <HomePage data={data} />
  }
}
