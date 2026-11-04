import { useMemo } from 'react'
import { PlannerIcon } from '../components/icons'
import { SourceBadge } from '../components/ui'
import { WorkloadForecast } from '../components/WorkloadForecast'
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'
import { toDateKey } from '../lib/dates'
import { currentPace } from '../lib/deckPace'
import { measuredDefaults } from '../lib/measured'
import { FsrsMissing } from './FsrsGate'
import { PageHeader } from './PageHeader'

export function PlannerPage({ data, today }: { data: AnkiData; today: Date }) {
  const measured = useMemo(() => measuredDefaults(data, today), [data, today])
  const pace = useMemo(() => currentPace(data, today, measured.studyDaysPerWeek), [data, today, measured])
  return (
    <div className="space-y-6">
      <PageHeader
        title={messages.planner.title}
        subtitle={data.source === 'mock' ? messages.planner.subtitleSample : messages.planner.subtitle}
        badge={data.source === 'mock' ? <SourceBadge kind="sample" /> : data.fsrs?.enabled ? <SourceBadge kind="projection" /> : undefined}
      />
      {data.fsrs?.enabled ? (
        <WorkloadForecast
          fsrs={data.fsrs}
          decks={data.decks}
          todayKey={toDateKey(today)}
          startWeekday={(today.getDay() + 6) % 7}
          measured={measured}
          currentByDeck={pace?.byDeck ?? null}
        />
      ) : (
        <FsrsMissing data={data} icon={<PlannerIcon size={30} />} title={messages.fsrsMissing.planner} />
      )}
    </div>
  )
}
