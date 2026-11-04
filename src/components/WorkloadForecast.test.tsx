// @vitest-environment jsdom
// The Planner screen, with the simulator's answers scripted: heaviest-month load is 40 + 8 × new cards a day, so
// at 15 s per review a 30-minute budget (120 reviews) fits exactly 10 new cards.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockData } from '../data/mockData'
import { messages } from '../i18n'
import { HORIZONS, type HorizonSummary, type SimDay, type SimSettings } from '../lib/simulator'
import { fsrsFixture } from '../test/fsrsFixture'
import { WorkloadForecast } from './WorkloadForecast'

const m = messages.planner.pace
const measured = { secondsPerReview: 15, studyDaysPerWeek: 5, minutesPerStudyDay: 26 }

interface Request {
  id: number
  settings: SimSettings
  scenarioNewPerDay: number[]
}

class FakeWorker {
  static all: FakeWorker[] = []
  onerror: ((e: Partial<ErrorEvent>) => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  request: Request | null = null
  terminated = false
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(request: Request) {
    this.request = request
  }
  terminate() {
    this.terminated = true
  }
}

type Load = (newPerDay: number) => { heaviest: number; backlog?: number }
const defaultLoad: Load = (n) => ({ heaviest: 40 + 8 * n })

function summary(horizon: number, newPerDay: number, load: Load): HorizonSummary {
  const { heaviest, backlog = 0 } = load(newPerDay)
  return {
    horizon,
    total: { mean: heaviest * horizon, p10: 0, p90: 0 },
    avgPerDay: heaviest,
    avgPerStudyDay: heaviest,
    peak: { mean: heaviest, p90: heaviest },
    avgMinutesPerStudyDay: 0,
    matureEnd: 0,
    newIntroduced: newPerDay * horizon,
    backlogEnd: backlog,
    finalWindowPerStudyDay: heaviest,
    finalWindowMinutes: 0,
    maxWindowPerStudyDay: heaviest,
    known: 0,
    followUp: 0,
    fresh: 0,
    perDeck: [],
  }
}

const byHorizon = (newPerDay: number, load: Load) =>
  Object.fromEntries(HORIZONS.map((h) => [h, summary(h, newPerDay, load)])) as Record<number, HorizonSummary>

const running = () => FakeWorker.all.filter((w) => !w.terminated && w.request)

/** The run in progress, once the debounce has started it. */
async function currentRun() {
  await waitFor(() => expect(running().length).toBeGreaterThan(0), { timeout: 2000 })
  return running()[running().length - 1]
}

function answerMain(w: FakeWorker, load = defaultLoad) {
  const { id, settings } = w.request!
  const days = [] as SimDay[]
  act(() => w.onmessage!({ data: { id, kind: 'main', days, runs: settings.runs, byHorizon: byHorizon(settings.newPerDay, load) } }))
}

function answerScenarios(w: FakeWorker, load = defaultLoad) {
  const { id, scenarioNewPerDay } = w.request!
  const newPerDay = scenarioNewPerDay.map((value) => ({ value, byHorizon: byHorizon(value, load) }))
  act(() => w.onmessage!({ data: { id, kind: 'scenarios', newPerDay, retention: [] } }))
}

/** Answers runs until the plan on screen matches the settings, returning the settled request. */
async function settle(load = defaultLoad) {
  for (let i = 0; i < 4; i++) {
    const w = await currentRun()
    answerMain(w, load)
    answerScenarios(w, load)
    const before = FakeWorker.all.length
    await new Promise((r) => setTimeout(r, 300)) // the debounce, in case that answer started another run
    if (FakeWorker.all.length === before) return w.request!
  }
  throw new Error('The plan never settled')
}

const show = (fsrs = fsrsFixture()) =>
  render(<WorkloadForecast fsrs={fsrs} decks={mockData.decks} todayKey="2026-11-04" startWeekday={2} measured={measured} />)

const pace = (name: string) => screen.getByRole('radio', { name: new RegExp(name) })
const setSlider = (name: string, value: number) =>
  fireEvent.change(screen.getByRole('slider', { name, hidden: true }), { target: { value } })

beforeEach(() => {
  FakeWorker.all = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Planner paces', () => {
  it('shows nothing until the plan is known, so the stand-in’s numbers never appear', async () => {
    show()
    const first = await currentRun()
    expect(first.request!.settings).toMatchObject({ newPerDay: 30, runs: 8 })
    answerMain(first)
    expect(screen.getByText('Simulating your cards…')).toBeTruthy()
    expect(screen.queryByText(/On a typical study day/)).toBeNull()
  })

  it('opens on Steady, using the most new cards that fit the budget', async () => {
    show()
    const settled = await settle()
    expect(settled.settings).toMatchObject({ newPerDay: 10, runs: 24 })
    expect(pace('Steady').getAttribute('aria-checked')).toBe('true')
    expect(pace('Steady').textContent).toContain(m.fits(30))
    expect(pace('Relaxed').textContent).toContain(m.newCards(0))
    expect(pace('Push').textContent).toContain(m.newCards(15))
    expect(screen.getByText(/^At 10 new cards a day, 5 days a week/)).toBeTruthy()
  })

  it('sets the limit when a pace is picked', async () => {
    show()
    await settle()
    fireEvent.click(pace('Push'))
    const settled = await settle()
    expect(settled.settings.newPerDay).toBe(15)
    expect(pace('Push').getAttribute('aria-checked')).toBe('true')
    expect(pace('Steady').getAttribute('aria-checked')).toBe('false')
  })

  it('keeps a pace in step with the budget', async () => {
    show()
    await settle()
    setSlider('Daily time budget', 60)
    expect(pace('Steady').textContent).toContain(m.fits(60))
    const settled = await settle()
    expect(settled.settings.newPerDay).toBe(25) // 240 reviews fit 25 new cards
  })

  it('keeps a number chosen on the slider when the budget changes', async () => {
    show()
    await settle()
    setSlider('New cards per day', 7)
    expect(screen.getByText(m.custom(7))).toBeTruthy()
    expect(pace('Steady').getAttribute('aria-checked')).toBe('false')
    await settle()
    const runs = FakeWorker.all.length
    setSlider('Daily time budget', 60)
    await new Promise((r) => setTimeout(r, 300)) // the debounce: nothing the simulation uses has changed
    expect(FakeWorker.all.length).toBe(runs)
    expect(screen.getByText(m.custom(7))).toBeTruthy()
  })

  it('says so when existing reviews alone are over a pace’s time', async () => {
    show()
    await settle((n) => ({ heaviest: 100 + 8 * n }))
    expect(pace('Relaxed').textContent).toContain(m.over(18))
    expect(pace('Steady').textContent).toContain(m.fits(30))
  })
})

describe('Planner verdict', () => {
  it('passes a plan that fits the budget', async () => {
    show()
    await settle()
    expect(screen.getByText('Fits your time budget')).toBeTruthy()
  })

  it('flags a plan over the budget', async () => {
    show()
    await settle()
    fireEvent.click(pace('Push'))
    await settle()
    expect(screen.getByText('Over your time budget')).toBeTruthy()
  })

  it('flags a daily limit that leaves cards waiting, whatever the time', async () => {
    show()
    await settle((n) => ({ heaviest: 40 + 8 * n, backlog: 50 }))
    expect(screen.getByText('Reviews pile up')).toBeTruthy()
  })
})

describe('Planner summary bar', () => {
  it('shows the result and the pace behind it', async () => {
    show()
    await settle()
    const bar = screen.getByTestId('plan-summary')
    expect(bar.textContent).toContain(messages.planner.summary.load(30, 120))
    expect(bar.textContent).toContain(messages.planner.summary.detail(10, 'Fits your time budget'))
  })
})

describe('Planner settings', () => {
  it('simulates only the selected deck', async () => {
    show()
    await settle()
    fireEvent.click(screen.getByRole('radio', { name: 'Science' }))
    const settled = await settle()
    expect(settled.settings.deckIds).toEqual(['science'])
  })

  it('starts from the measured habit', async () => {
    show()
    const settled = await settle()
    expect(settled.settings).toMatchObject({ studyDaysPerWeek: 5, startWeekday: 2, recall: 'fsrs' })
  })
})

describe('Planner states', () => {
  it('explains a failed simulation', async () => {
    show()
    const w = await currentRun()
    act(() => w.onerror!({ message: 'Out of memory', preventDefault: () => {} }))
    expect(screen.getByRole('alert').textContent).toContain('Out of memory')
  })

  it('says when there is nothing to simulate', () => {
    render(
      <WorkloadForecast
        fsrs={{ ...fsrsFixture(), cards: [], newCards: {} }}
        decks={mockData.decks}
        todayKey="2026-11-04"
        startWeekday={2}
        measured={measured}
      />,
    )
    expect(screen.getByText('Nothing to simulate')).toBeTruthy()
  })
})
