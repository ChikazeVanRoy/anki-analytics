import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { DeckConfigError } from './deckGroups.ts'
import { readStatsInWorker } from './readStats.ts'

const dir = mkdtempSync(join(tmpdir(), 'anki-analytics-worker-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A stand-in for statsWorker.ts that answers as told. */
function worker(name: string, body: string) {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, `import { parentPort, workerData } from 'node:worker_threads'\n${body}\n`)
  return pathToFileURL(file)
}

describe('readStatsInWorker', () => {
  it('hands the path to the worker and returns its stats', async () => {
    const echo = worker('ok', 'parentPort.postMessage({ ok: true, data: { source: "anki", path: workerData } })')
    expect(await readStatsInWorker('/copy.anki2', echo)).toEqual({ source: 'anki', path: '/copy.anki2' })
  })

  it('keeps a deck config problem recognisable, so its message can be shown', async () => {
    const bad = worker('config', 'parentPort.postMessage({ ok: false, message: "bad config", config: true })')
    await expect(readStatsInWorker('x', bad)).rejects.toBeInstanceOf(DeckConfigError)
    const other = worker('other', 'parentPort.postMessage({ ok: false, message: "disk", config: false })')
    const err = await readStatsInWorker('x', other).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(DeckConfigError)
    expect((err as Error).message).toBe('disk')
  })

  it('fails, rather than waiting for ever, when the worker stops without answering', async () => {
    await expect(readStatsInWorker('x', worker('silent', 'process.exit(3)'))).rejects.toThrow(/exit code 3/)
    await expect(readStatsInWorker('x', worker('throws', 'throw new Error("boom")'))).rejects.toThrow('boom')
  })
})
