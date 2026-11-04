import { Component, type ReactNode } from 'react'
import { WarningIcon } from '../components/icons'
import { EmptyState } from '../components/ui'
import { messages as m } from '../i18n'

/**
 * Catches a rendering error in one section so the rest of the app keeps working. Give it a `key` per section so
 * navigating elsewhere starts fresh. Retry reloads the page: a section whose code failed to load, as after an app
 * update, keeps that failure until then.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <EmptyState
        icon={<WarningIcon size={28} />}
        title={m.error.title}
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-extrabold text-brand-ink shadow-card active:scale-95"
          >
            {m.error.retry}
          </button>
        }
      >
        <p>{m.error.body}</p>
        <p className="mt-2 font-mono text-xs">{this.state.error.message}</p>
      </EmptyState>
    )
  }
}
