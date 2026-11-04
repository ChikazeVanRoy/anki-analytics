import type { ReactNode } from 'react'
import type { FailureKind } from '../data/useAnkiData'
import type { UpdateReason } from '../data/useUpdateOffer'
import { ActivityIcon, AdvancedIcon, CloseIcon, HomeIcon, Logo, MoonIcon, PlannerIcon, RefreshIcon, SunIcon, SystemIcon, WarningIcon } from '../components/icons'
import type { AnkiData } from '../data/types'
import { messages as m } from '../i18n'
import { formatCopiedAt } from '../lib/format'
import { NAV_ROUTES, routeHref, type Route } from '../lib/route'
import type { ThemeChoice } from './useTheme'

const NAV_ICONS: Record<(typeof NAV_ROUTES)[number], (p: { size?: number }) => ReactNode> = {
  home: HomeIcon,
  activity: ActivityIcon,
  planner: PlannerIcon,
  advanced: AdvancedIcon,
}

interface ShellProps {
  route: Route
  data: AnkiData
  /** The stats come from a saved snapshot, because the live API couldn't answer. */
  fromSnapshot?: boolean
  fallbackReason?: string
  fallbackKind?: FailureKind
  onRefresh: () => void
  refreshing: boolean
  refreshError: string | null
  onDismissError: () => void
  /** Why a refresh is worth offering right now, if it is. */
  update: UpdateReason | null
  onDismissUpdate: () => void
  theme: ThemeChoice
  onCycleTheme: () => void
  children: ReactNode
}

export function AppShell(props: ShellProps) {
  const { route, data, fromSnapshot, fallbackReason, fallbackKind, onRefresh, refreshing, refreshError, onDismissError, update, onDismissUpdate, theme, onCycleTheme, children } = props
  const sample = data.source === 'mock'
  const copied = formatCopiedAt(data.generatedAt)

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-brand px-4 py-2 font-bold text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <a href={routeHref('home')} className="flex shrink-0 items-center gap-2.5 rounded-xl">
            <Logo />
            <span className="text-lg font-black tracking-tight text-ink">{m.appName}</span>
          </a>

          <nav aria-label={m.nav.label} className="mx-auto hidden md:block">
            <ul className="flex gap-1 rounded-2xl bg-surface-2 p-1">
              {NAV_ROUTES.map((r) => {
                const Icon = NAV_ICONS[r]
                const active = r === route
                return (
                  <li key={r}>
                    <a
                      href={routeHref(r)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-all ${
                        active ? 'bg-surface text-brand-strong shadow-card' : 'text-muted hover:text-ink'
                      }`}
                    >
                      <Icon size={18} />
                      {m.nav[r]}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span
              title={sample ? fallbackReason : m.data.copiedAt(copied)}
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold lg:inline-flex ${
                sample ? 'bg-warning-soft text-warning' : fromSnapshot ? 'bg-surface-2 text-ink-2' : 'bg-good-soft text-good'
              }`}
            >
              {sample ? <WarningIcon size={14} /> : <span className={`size-2 rounded-full ${fromSnapshot ? 'bg-muted' : 'bg-good'}`} aria-hidden />}
              {sample ? m.data.sample : fromSnapshot ? m.data.snapshot : m.data.live}
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title={m.data.refreshHint}
              aria-label={refreshing ? m.data.refreshing : m.data.refresh}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-sm font-bold text-ink-2 shadow-card transition-all hover:text-ink active:scale-95 disabled:opacity-60"
            >
              <RefreshIcon size={18} spinning={refreshing} />
              <span className="hidden sm:inline">{refreshing ? m.data.refreshing : m.data.refresh}</span>
            </button>
            <button
              type="button"
              onClick={onCycleTheme}
              title={`${m.theme.label}: ${m.theme[theme]}`}
              aria-label={`${m.theme.label}: ${m.theme[theme]}`}
              className="grid size-10 place-items-center rounded-2xl border border-line bg-surface text-ink-2 shadow-card transition-all hover:text-ink active:scale-95"
            >
              {theme === 'light' ? <SunIcon size={18} /> : theme === 'dark' ? <MoonIcon size={18} /> : <SystemIcon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {sample && (
          <div role="status" className="animate-rise mt-5 flex gap-3 rounded-3xl border border-warning/30 bg-warning-soft px-5 py-4">
            <span className="mt-0.5 text-warning">
              <WarningIcon />
            </span>
            <div className="text-sm leading-relaxed">
              <p className="font-extrabold text-ink">{m.data.sampleTitle}</p>
              <p className="text-ink-2">{m.data.sampleBody}</p>
              <p className="font-bold text-ink-2">{m.data.sampleNext[fallbackKind ?? 'collection']}</p>
              {fallbackReason && <p className="mt-1 text-xs text-muted">{m.data.sampleReason(fallbackReason)}</p>}
            </div>
          </div>
        )}

        {fromSnapshot && (
          <div role="status" className="animate-rise mt-5 rounded-3xl border border-line bg-surface-2 px-5 py-3 text-sm text-ink-2">
            <p>
              <span className="font-bold text-ink">{m.data.snapshotTitle}</span> {m.data.lastUpdated(copied)}
            </p>
            {fallbackReason && <p className="mt-1 text-xs text-muted">{m.data.sampleReason(fallbackReason)}</p>}
          </div>
        )}

        {refreshError && (
          <div role="alert" className="animate-rise mt-5 flex items-center gap-3 rounded-3xl border border-critical/30 bg-critical-soft px-5 py-3 text-sm text-ink">
            <span className="text-critical">
              <WarningIcon />
            </span>
            <span className="flex-1">{m.data.refreshFailed(refreshError)}</span>
            <button
              type="button"
              onClick={onDismissError}
              aria-label={m.data.dismiss}
              className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        )}

        {update && !refreshing && (
          <div role="status" className="animate-rise mt-5 flex flex-wrap items-center gap-3 rounded-3xl border border-good/30 bg-good-soft px-5 py-3 text-sm text-ink">
            <span className="min-w-0 flex-1 font-semibold">{m.data.update[update]}</span>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-3 font-bold text-brand-ink transition-all active:scale-95"
            >
              <RefreshIcon size={16} /> {m.data.updateNow}
            </button>
            <button
              type="button"
              onClick={onDismissUpdate}
              aria-label={m.data.dismiss}
              className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        )}

        <main id="main" tabIndex={-1} className="py-6 focus:outline-none sm:py-8">
          {children}
        </main>

        <footer className="pt-4 pb-10 text-center text-xs text-muted">
          {sample ? m.data.footerSample : `${m.data.footerLive} ${m.data.copiedAt(copied)}.`}
        </footer>
      </div>

      {/* Mobile: thumb-friendly bottom tab bar */}
      <nav
        aria-label={m.nav.label}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV_ROUTES.map((r) => {
            const Icon = NAV_ICONS[r]
            const active = r === route
            return (
              <li key={r}>
                <a
                  href={routeHref(r)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${
                    active ? 'text-brand-strong' : 'text-muted'
                  }`}
                >
                  <span className={`grid h-8 w-14 place-items-center rounded-full transition-all ${active ? 'bg-brand-soft' : ''}`}>
                    <Icon size={20} />
                  </span>
                  {m.nav[r]}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

/** Placeholder while a section's code loads. */
export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-12 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  )
}

/** Shown while the first data request is in flight: the page's shape, shimmering. */
export function LoadingScreen() {
  return (
    <div className="min-h-screen" aria-busy="true">
      <div className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2.5 px-4 sm:px-6">
          <Logo />
          <span className="text-lg font-black tracking-tight text-ink">{m.appName}</span>
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <p role="status" className="text-sm font-semibold text-muted">
          {m.loading}
        </p>
        <div className="skeleton h-44" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32" />
          ))}
        </div>
        <div className="skeleton h-64" />
      </div>
    </div>
  )
}
