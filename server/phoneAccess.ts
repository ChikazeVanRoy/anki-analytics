// Lets one named device network reach the app, for the installed phone app. Tailscale forwards requests from your own
// devices to this server, which still only listens on 127.0.0.1. What it may read is deliberately tiny: the app's files and
// a snapshot with the note text removed. Everything else stays answerable only from this Mac.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AnkiData } from '../src/data/types.ts'

export const PHONE_HOST_FILE = fileURLToPath(new URL('../data/phone-host.txt', import.meta.url))

/** Only a Tailscale machine name will do: it can't be pointed at this server by a website, as any other domain could. */
export const isTailscaleName = (name: string) => /^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(name)

export function savePhoneHost(name: string, path = PHONE_HOST_FILE) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${name}\n`, { mode: 0o600 })
}

export const removePhoneHost = (path = PHONE_HOST_FILE) => rmSync(path, { force: true })

/** The allowed machine name, or null. Read each time, so turning it off applies at once. */
export function loadPhoneHost(path = PHONE_HOST_FILE): string | null {
  if (!existsSync(path)) return null
  const name = readFileSync(path, 'utf8').trim().toLowerCase()
  return isTailscaleName(name) ? name : null
}

/**
 * Whether a request came in through that machine name from a device of yours. Tailscale Funnel would put it on the public
 * internet, and marks what it forwards, so those are refused even if Funnel gets turned on by mistake.
 */
export function isPhoneRequest(headers: Record<string, string | string[] | undefined>, phoneHost: string | null) {
  const { host } = headers
  if (!phoneHost || !host || typeof host !== 'string' || headers['tailscale-funnel-request'] !== undefined) return false
  try {
    return new URL(`http://${host}`).hostname === phoneHost
  } catch {
    return false
  }
}

/**
 * Whether something forwarded this request, as Tailscale does. A forwarded request is never this Mac, whatever its Host
 * says, so a change in how Tailscale forwards can only lock the phone out, never give it this Mac's access.
 */
export const isForwarded = (headers: Record<string, string | string[] | undefined>) =>
  ['x-forwarded-for', 'x-forwarded-host', 'tailscale-user-login', 'tailscale-funnel-request'].some((name) => headers[name] !== undefined)

/** The stats with every piece of note text removed. The app already copes with cards that have none. */
export function withoutNoteText(data: AnkiData): AnkiData {
  if (!data.fsrs) return data
  const { fsrs } = data
  return {
    ...data,
    fsrs: {
      ...fsrs,
      cards: fsrs.cards.map(({ front: _front, ...card }) => card),
      troubleCards: fsrs.troubleCards?.map((card) => ({ ...card, front: '' })),
    },
  }
}

/** The saved snapshot file's text, made safe to send to the phone. */
export function phoneSnapshot(saved: string): string {
  const snapshot = JSON.parse(saved) as { data: AnkiData }
  return JSON.stringify({ ...snapshot, data: withoutNoteText(snapshot.data) })
}
