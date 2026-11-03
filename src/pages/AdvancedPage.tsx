import { AdvancedIcon } from '../components/icons'
import { FsrsAnalytics } from '../components/FsrsAnalytics'
import { SourceBadge } from '../components/ui'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { toDateKey } from '../lib/dates'
import { FsrsMissing } from './FsrsGate'
import { PageHeader } from './PageHeader'

export function AdvancedPage({ data, today }: { data: AnkiData; today: Date }) {
  return (
    <div className="space-y-6">
      <PageHeader title={messages.advanced.title} subtitle={messages.advanced.subtitle} badge={data.source === 'mock' ? <SourceBadge kind="sample" /> : undefined} />
      {data.fsrs?.enabled ? (
        <FsrsAnalytics fsrs={data.fsrs} decks={data.decks} todayKey={toDateKey(today)} />
      ) : (
        <FsrsMissing data={data} icon={<AdvancedIcon size={30} />} title={messages.fsrsMissing.advanced} />
      )}
    </div>
  )
}
