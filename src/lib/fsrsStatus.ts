// Why the FSRS sections are hidden. They never show without real, FSRS-enabled data (pure, tested).
import type { AnkiData } from '../data/types'
import { messages } from '../i18n'

const m = messages.fsrsMissing

export function fsrsUnavailableReason(data: AnkiData): { title: string; detail: string } {
  if (data.source === 'mock') return m.sample
  if (data.fsrsError) return { title: m.unavailable, detail: m.unaffected(data.fsrsError) }
  if (!data.fsrs) return { title: m.unavailable, detail: m.notSent }
  return m.off
}
