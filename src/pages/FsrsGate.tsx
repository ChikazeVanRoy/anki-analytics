import type { ReactNode } from 'react'
import { ArrowRightIcon } from '../components/icons'
import { EmptyState } from '../components/ui'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { fsrsUnavailableReason } from '../lib/fsrsStatus'
import { routeHref } from '../lib/route'

/** Friendly empty state for sections that need real FSRS data (never shown with sample data). */
export function FsrsMissing({ data, icon, title }: { data: AnkiData; icon: ReactNode; title: string }) {
  const reason = fsrsUnavailableReason(data)
  return (
    <EmptyState
      icon={icon}
      title={title}
      action={
        <a
          href={routeHref('home')}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-2.5 text-sm font-extrabold text-brand-ink shadow-card transition-transform active:scale-95"
        >
          {messages.fsrsMissing.back} <ArrowRightIcon size={16} />
        </a>
      }
    >
      <p className="font-bold text-ink-2">{reason.title}</p>
      <p className="mt-1">{reason.detail}</p>
    </EmptyState>
  )
}
