import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, LoadingScreen, PageSkeleton } from './app/AppShell'
import { ErrorBoundary } from './app/ErrorBoundary'
import { useRoute } from './app/useRoute'
import { useAnkiDay } from './app/useAnkiDay'
import { useTheme } from './app/useTheme'
import { SessionRecap } from './components/SessionRecap'
import { DeckColors } from './data/deckColors'
import type { AnkiData } from './data/types'
import { copiedOnEarlierDay } from './lib/progress'
import { useAnkiData } from './data/useAnkiData'
import { useSessionRecap } from './data/useSessionRecap'
import { useUpdateOffer } from './data/useUpdateOffer'
import { messages } from './i18n'
import { ankiToday, type RangeKey } from './lib/stats'
import { deckColorMap } from './lib/theme'
import { HomePage } from './pages/HomePage'

// Chart-heavy sections load on demand, so Home appears without downloading the charting library
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const PlannerPage = lazy(() => import('./pages/PlannerPage').then((m) => ({ default: m.PlannerPage })))
const WrappedPage = lazy(() => import('./pages/WrappedPage').then((m) => ({ default: m.WrappedPage })))
const AdvancedPage = lazy(() => import('./pages/AdvancedPage').then((m) => ({ default: m.AdvancedPage })))

export default function App() {
  const { state, refresh, reread, refreshing, refreshError, clearRefreshError } = useAnkiData()
  const theme = useTheme()
  const route = useRoute()
  // Lifted so the Activity range survives switching sections
  const [range, setRange] = useState<RangeKey>('30d')
  const ankiDay = useAnkiDay(state.status === 'ready' ? state.data.dayStartHour : 0)
  const real = state.status === 'ready' && state.data.source === 'anki' ? state.data : null
  const newDay = !!real && copiedOnEarlierDay(real, ankiToday(real))
  const { update, version, dismissUpdate, syncProblem, dismissSync } = useUpdateOffer(state.status === 'ready' ? state.data.generatedAt : undefined, newDay)
  // Anki closed with something new, so fetch it without being asked. Each reason for each version is tried once, and the offer
  // only appears if that fails, so a refresh that can't work isn't retried every few seconds
  const attempt = update && version !== null ? `${update}:${version}` : null
  const fetchUpdate = update === 'copied' ? reread : refresh
  const autoTried = useRef<string | null>(null)
  useEffect(() => {
    if (attempt === null || attempt === autoTried.current) return
    autoTried.current = attempt
    // A refresh already running will bring this in, or report why it can't
    if (!refreshing) void fetchUpdate()
  }, [attempt, refreshing, fetchUpdate])
  // Not from a snapshot: it can be older than the last visit, which would count those reviews a second time
  const { recap, dismissRecap } = useSessionRecap(state.status === 'ready' && state.fromSnapshot ? null : real)
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
      fromSnapshot={state.fromSnapshot}
      fallbackReason={state.fallbackReason}
      fallbackKind={state.fallbackKind}
      onRefresh={refresh}
      refreshing={refreshing}
      refreshError={refreshError}
      update={attempt !== null && refreshError ? update : null}
      onUpdate={fetchUpdate}
      onDismissUpdate={dismissUpdate}
      syncProblem={syncProblem}
      onDismissSync={dismissSync}
      onDismissError={clearRefreshError}
      theme={theme.choice}
      onCycleTheme={theme.cycle}
    >
      {recap && <SessionRecap recap={recap} onClose={dismissRecap} />}
      <DeckColors.Provider value={deckColors}>
        <ErrorBoundary key={route}>
          <Suspense fallback={<PageSkeleton />}>
            {/* Keyed by the Anki day, so a page left open past the rollover hour recomputes "today" */}
            <Page
              key={ankiDay}
              route={route}
              data={state.data}
              fromSnapshot={state.fromSnapshot}
              range={range}
              onRangeChange={setRange}
            />
          </Suspense>
        </ErrorBoundary>
      </DeckColors.Provider>
    </AppShell>
  )
}

function Page({ route, data, fromSnapshot, range, onRangeChange }: { route: string; data: AnkiData; fromSnapshot?: boolean; range: RangeKey; onRangeChange: (r: RangeKey) => void }) {
  const today = useMemo(() => ankiToday(data), [data])
  switch (route) {
    case 'activity':
      return <ActivityPage data={data} range={range} onRangeChange={onRangeChange} />
    case 'planner':
      return <PlannerPage data={data} today={today} />
    case 'wrapped':
      return <WrappedPage data={data} />
    case 'advanced':
      return <AdvancedPage data={data} today={today} />
    default:
      return <HomePage data={data} fromSnapshot={fromSnapshot} />
  }
}
