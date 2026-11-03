import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AppShell, LoadingScreen, PageSkeleton } from './app/AppShell'
import { ErrorBoundary } from './app/ErrorBoundary'
import { useRoute } from './app/useRoute'
import { useTheme } from './app/useTheme'
import type { AnkiData } from './data/types'
import { useAnkiData } from './data/useAnkiData'
import { messages } from './i18n'
import { ankiToday, type RangeKey } from './lib/stats'
import { HomePage } from './pages/HomePage'

// Chart-heavy sections load on demand, so Home appears without downloading the charting library
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const PlannerPage = lazy(() => import('./pages/PlannerPage').then((m) => ({ default: m.PlannerPage })))
const AdvancedPage = lazy(() => import('./pages/AdvancedPage').then((m) => ({ default: m.AdvancedPage })))

export default function App() {
  const { state, refresh, refreshing, refreshError, clearRefreshError } = useAnkiData()
  const theme = useTheme()
  const route = useRoute()
  // Lifted so the Activity range survives switching sections
  const [range, setRange] = useState<RangeKey>('30d')

  useEffect(() => {
    document.title = route === 'home' ? messages.appName : `${messages.nav[route]} · ${messages.appName}`
  }, [route])

  if (state.status === 'loading') return <LoadingScreen />

  return (
    <AppShell
      route={route}
      data={state.data}
      fallbackReason={state.fallbackReason}
      onRefresh={refresh}
      refreshing={refreshing}
      refreshError={refreshError}
      onDismissError={clearRefreshError}
      theme={theme.choice}
      onCycleTheme={theme.cycle}
    >
      <ErrorBoundary key={route}>
        <Suspense fallback={<PageSkeleton />}>
          <Page route={route} data={state.data} range={range} onRangeChange={setRange} />
        </Suspense>
      </ErrorBoundary>
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
