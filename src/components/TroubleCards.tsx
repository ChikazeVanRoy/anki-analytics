import { useState } from 'react'
import { useDeckColor } from '../data/deckColors'
import type { Deck, FsrsData } from '../data/types'
import { messages } from '../i18n'
import { ankiSearch } from '../lib/fsrsStats'
import { CheckIcon } from './icons'
import { Panel } from './Panel'
import { SourceBadge } from './ui'

const m = messages.activity

export function TroubleCards({ fsrs, decks }: { fsrs: FsrsData; decks: Deck[] }) {
  const deckColor = useDeckColor()
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')
  const cards = fsrs.troubleCards
  if (!cards) return null
  const days = fsrs.troubleWindowDays ?? 90
  const search = ankiSearch(cards.map((c) => c.cardId))
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(search)
      setCopy('done')
    } catch {
      setCopy('failed') // no clipboard access: show the search so it can be selected by hand
    }
  }
  return (
    <Panel title={m.troubleTitle} eyebrow={m.troubleEyebrow} subtitle={cards.length ? m.troubleSub(days) : m.troubleEmpty(days)} actions={<SourceBadge kind="measured" />}>
      {cards.length > 0 && (
        <>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {cards.map((c) => (
              <li key={c.cardId} className="flex items-baseline gap-2.5 py-2.5">
                <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: deckColor(c.deckId) }} aria-hidden />
                <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="truncate text-sm font-bold text-ink">{c.front || m.troubleNoText}</p>
                  <p className="shrink-0 text-xs text-muted tabular-nums">{m.troubleCounts(decks.find((d) => d.id === c.deckId)?.name ?? c.deckId, c.again, c.hard, c.reviews)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-bold text-brand-ink hover:brightness-110"
            >
              {copy === 'done' && <CheckIcon size={16} />}
              {copy === 'done' ? m.troubleCopied : m.troubleCopy}
            </button>
            <p className="min-w-0 flex-1 basis-56 text-xs text-muted">{m.troubleHow}</p>
          </div>
          {copy === 'failed' && (
            <p className="mt-3 text-xs break-all text-ink-2">
              {m.troubleCopyFailed} <code className="select-all">{search}</code>
            </p>
          )}
        </>
      )}
    </Panel>
  )
}
