import { useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDeckColor } from '../data/deckColors'
import { messages } from '../i18n'
import type { Deck, FsrsData } from '../data/types'
import { SCENARIO_NEW_PER_DAY, useSimulation } from '../data/useSimulation'
import { dayNumber, keyFromDayNumber } from '../lib/dates'
import { formatInt, formatLongDate, formatPct, formatShortDate } from '../lib/format'
import { buildInsights } from '../lib/insights'
import type { MeasuredDefaults } from '../lib/measured'
import { lapseEvidence } from '../lib/fsrsStats'
import { gradingShift, lapseBasis } from '../lib/gradingShift'
import { deckLimits, defaultBudget, minutesAt, PLAN_PRESETS, planPresets, planSettings, standardSweep, type PlanPreset, type PlanPresetKey } from '../lib/plan'
import { buildSimDecks, HORIZONS, presetRetentionLabel, type SimDay, type SimSettings } from '../lib/simulator'
import { chart, forecast } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { GoalPlanner } from './GoalPlanner'
import { CheckIcon, RefreshIcon, SparkleIcon, WarningIcon } from './icons'
import { Panel } from './Panel'
import { Disclosure, HatchPattern, InfoTip, Metric, Segmented, Slider } from './ui'

interface Props {
  fsrs: FsrsData
  decks: Deck[]
  todayKey: string
  startWeekday: number
  measured: MeasuredDefaults
  /** The new cards you've actually been starting per study day, by deck. Null: not enough history to say. */
  currentByDeck?: Record<string, number> | null
}

type Pace = PlanPresetKey | 'current' | number

const SERIES = [
  { key: 'known', label: 'Already scheduled', color: forecast.known, estimated: false },
  { key: 'followUp', label: 'Follow-up reviews (estimated)', color: forecast.followUp, estimated: true },
  { key: 'fresh', label: 'New cards (estimated)', color: forecast.fresh, estimated: true },
] as const

/** Daily points up to 90 days; weekly averages beyond, so long horizons stay readable. */
function timeline(days: SimDay[], horizon: number, todayKey: string) {
  const start = dayNumber(todayKey)
  const slice = days.slice(0, horizon)
  const size = horizon > 90 ? 7 : 1
  const rows = []
  for (let i = 0; i < slice.length; i += size) {
    const chunk = slice.slice(i, i + size)
    const avg = (f: (d: SimDay) => number) => chunk.reduce((a, d) => a + f(d), 0) / chunk.length
    rows.push({
      date: keyFromDayNumber(start + i),
      known: avg((d) => d.known),
      followUp: avg((d) => d.followUp),
      fresh: avg((d) => d.fresh),
      total: avg((d) => d.total),
      band: [avg((d) => d.p10), avg((d) => d.p90)] as [number, number],
    })
  }
  return { rows, weekly: size > 1 }
}

export function WorkloadForecast({ fsrs, decks: allDecks, todayKey, startWeekday, measured, currentByDeck = null }: Props) {
  const deckColor = useDeckColor()
  const decks = allDecks.filter((d) => fsrs.presets.some((p) => p.deckId === d.id))
  const deckNames = Object.fromEntries(decks.map((d) => [d.id, d.name]))
  const hasCurrent = !!currentByDeck && decks.some((d) => currentByDeck[d.id])
  const simDecks = useMemo(() => buildSimDecks(fsrs, todayKey), [fsrs, todayKey])

  const [deckSel, setDeckSel] = useState<string>('all')
  const [horizon, setHorizon] = useState<number>(90)
  // Opens on what you're actually doing. A pace follows the time budget; a number from the slider stays put.
  // 30 is only the first run's stand-in
  const [chosenPace, setPace] = useState<Pace>(hasCurrent ? 'current' : 'steady')
  const [presets, setPresets] = useState<PlanPreset[] | null>(null)
  // Desired retention: each deck's own preset value by default, or one custom value for all selected decks
  const [retentionMode, setRetentionMode] = useState<'preset' | 'custom'>('preset')
  const [retention, setRetention] = useState(Math.round((fsrs.presets[0]?.desiredRetention ?? 0.9) * 100) / 100)
  const [studyDays, setStudyDays] = useState(measured.studyDaysPerWeek)
  const [secs, setSecs] = useState(Math.round(measured.secondsPerReview))
  const [budget, setBudget] = useState(defaultBudget(measured))
  const [recall, setRecall] = useState<SimSettings['recall']>('fsrs')

  const deckIds = deckSel === 'all' ? decks.map((d) => d.id) : [deckSel]
  // Only the selected decks' pace counts; a deck without enough history has none, so it falls back to Steady
  const currentNewPerDay = Math.round(deckIds.reduce((n, id) => n + (currentByDeck?.[id] ?? 0), 0)) || null
  const pace = chosenPace === 'current' && currentNewPerDay === null ? 'steady' : chosenPace
  const newPerDay =
    typeof pace === 'number' ? pace : pace === 'current' ? currentNewPerDay! : (presets?.find((p) => p.key === pace)?.newPerDay ?? 30)
  const paceKnown = !!presets || typeof pace === 'number' || pace === 'current'
  const presetValues = [...new Set(fsrs.presets.filter((p) => deckIds.includes(p.deckId)).map((p) => Math.round(p.desiredRetention * 100)))]
  const presetLabel = presetRetentionLabel(presetValues.map((v) => v / 100))
  // The retention bar to highlight: the custom value, or the presets' value when they all agree
  const effectiveRetention = retentionMode === 'custom' ? retention : presetValues.length === 1 ? presetValues[0] / 100 : null
  const settings: SimSettings = {
    ...planSettings(deckIds, studyDays, startWeekday),
    // Until a pace is known this run only feeds the scenarios, and its own results are never shown
    ...(paceKnown ? {} : { runs: 8 }),
    newPerDay,
    desiredRetention: retentionMode === 'custom' ? retention : undefined,
    recall,
  }
  const { main, scenarios, running, settled, error, unavailable } = useSimulation(simDecks, settings)
  // Nothing is shown until the first plan is in, or the stand-in's numbers would appear under the pace's label
  const [planShown, setPlanShown] = useState(false)
  if (!planShown && settled && paceKnown) setPlanShown(true)
  const updating = running || !settled
  const fittedPresets = useMemo(
    () => (scenarios?.newPerDay ? planPresets(standardSweep(scenarios.newPerDay), budget, secs) : null),
    [scenarios, budget, secs],
  )
  // Kept in state because the next simulation's new-card limit comes from these, and that run needs them first
  if (fittedPresets && fittedPresets !== presets) setPresets(fittedPresets)
  const summary = main?.byHorizon[horizon]
  const year = main?.byHorizon[365]
  const toMin = (reviews: number) => (reviews * secs) / 60
  const { rows, weekly } = useMemo(() => (main ? timeline(main.days, horizon, todayKey) : { rows: [], weekly: false }), [main, horizon, todayKey])

  const sweep = scenarios?.newPerDay ?? []
  const scenarioRows = sweep
    .filter((s) => [...SCENARIO_NEW_PER_DAY.filter((v) => v !== 30 && v !== 50), newPerDay].includes(s.value))
    .map((s) => ({
      label: `${s.value}`,
      value: s.value,
      minutes: toMin(s.byHorizon[horizon].maxWindowPerStudyDay),
      reviews: s.byHorizon[horizon].maxWindowPerStudyDay,
      total: s.byHorizon[horizon].total.mean,
    }))
  // Every simulated value: the standard set plus the retention(s) actually in use (see retentionScenarioValues)
  const retentionRows = (scenarios?.retention ?? []).map((s) => ({
      label: formatPct(s.value, 0),
      value: s.value,
      total: s.byHorizon[horizon].total.mean,
      minutes: toMin(s.byHorizon[horizon].avgPerStudyDay),
    }))
  const deckRows = (summary?.perDeck ?? []).map((d) => ({ deckId: d.deckId, name: deckNames[d.deckId], existing: d.existing, fresh: d.fresh }))

  const insights =
    year && summary && scenarios
      ? buildInsights({
          newPerDay,
          secondsPerReview: secs,
          budgetMinutes: budget,
          recentMinutesPerStudyDay: measured.minutesPerStudyDay,
          year,
          horizon: summary,
          sweep: scenarios.newPerDay.map((s) => ({ value: s.value, year: s.byHorizon[365] })),
          capacitySweep: standardSweep(scenarios.newPerDay),
          deckNames,
          otherRecall: scenarios.otherRecall && {
            sweep: standardSweep(scenarios.otherRecall),
            used: messages.planner.recall[recall],
            other: messages.planner.recall[recall === 'fsrs' ? 'calibrated' : 'fsrs'],
          },
        })
      : []
  const pool = settings.deckIds.reduce((n, id) => n + (fsrs.newCards[id] ?? 0), 0)
  // Lapse evidence for the selected decks only, matching the ratios listed for them
  const shiftDate = useMemo(() => gradingShift(fsrs.calibrationDaily ?? [])?.date, [fsrs])
  const basis = useMemo(() => lapseBasis(fsrs), [fsrs])
  const { reviews: calibrationReviews, lapses: observedLapses } = lapseEvidence(basis, deckIds)
  const selectedSimDecks = simDecks.filter((d) => deckIds.includes(d.deckId))

  const minutesPerStudyDay = summary ? toMin(summary.avgPerStudyDay) : 0
  const heaviest = year ? toMin(year.maxWindowPerStudyDay) : 0
  // Same test as the sustainability insight: backlog first, then the heaviest month of a simulated year vs the budget
  const verdict = !year
    ? null
    : year.backlogEnd > 1
      ? ({ tone: 'warning', label: 'Reviews pile up' } as const)
      : heaviest <= budget
        ? ({ tone: 'good', label: 'Fits your time budget' } as const)
        : ({ tone: 'warning', label: 'Over your time budget' } as const)
  const horizonLabel = horizon === 365 ? 'year' : `${horizon} days`

  const controls = (
    <Panel
      title="Your plan"
      eyebrow="Settings"
      subtitle="Change these and the projection updates."
      variant="projection"
      className="lg:col-span-2"
    >
      <div className="space-y-5">
        <PacePicker
          presets={presets}
          pace={pace}
          newPerDay={newPerDay}
          onPick={setPace}
          current={
            currentNewPerDay === null
              ? null
              : {
                  newPerDay: currentNewPerDay,
                  minutes: scenarios?.newPerDay ? minutesAt(standardSweep(scenarios.newPerDay), currentNewPerDay, secs) : null,
                }
          }
        />
        {pace !== 'current' && newPerDay > 0 && (
          <p className="text-xs leading-relaxed font-semibold text-ink-2">
            {messages.planner.pace.limits(
              deckLimits(
                newPerDay,
                fsrs.presets
                  .filter((p) => deckIds.includes(p.deckId))
                  .map((p) => ({ deckId: p.deckId, pool: fsrs.newCards[p.deckId] ?? 0, current: p.newPerDay })),
              )
                .map((l) => messages.planner.pace.limit(deckNames[l.deckId] ?? l.deckId, l.newPerDay, l.current))
                .join(', '),
            )}
          </p>
        )}
        <Slider
          label="Daily time budget"
          size="lg"
          value={budget}
          min={5}
          max={180}
          step={5}
          format={(v) => `${v} min`}
          onChange={setBudget}
          hint={`How long you’d like to study on a study day. Used for the recommendations. Default: your measured ${Math.round(measured.minutesPerStudyDay)} min per study day over the last 4 weeks, rounded up.`}
        />
        <Segmented
          label="Look ahead"
          value={horizon}
          options={HORIZONS.map((h) => ({ value: h, label: h === 365 ? '1 yr' : h === 180 ? '6 mo' : `${h} d` }))}
          onChange={setHorizon}
        />
        <Segmented
          label="Decks"
          value={deckSel}
          options={[{ value: 'all', label: decks.length === 2 ? 'Both' : 'All' }, ...decks.map((d) => ({ value: d.id, label: d.name }))]}
          onChange={setDeckSel}
        />
        <Disclosure title="Fine-tune the simulation" subtitle="New cards, study days, answer speed, retention target and recall model">
          <div className="space-y-5 pt-2">
            <Slider
              label="New cards per day"
              value={newPerDay}
              min={0}
              max={100}
              onChange={setPace}
              hint={`Total across the selected decks, split evenly while each still has new cards (${formatInt(pool)} available).`}
            />
            <Slider
              label="Study days per week"
              value={studyDays}
              min={1}
              max={7}
              onChange={setStudyDays}
              hint={`Measured: about ${measured.studyDaysPerWeek} over the last 4 weeks. Rest days come first on Sunday, then Saturday, then mid-week; cards due on them wait for the next study day.`}
            />
            <Slider
              label="Seconds per review"
              value={secs}
              min={3}
              max={60}
              format={(v) => `${v} s`}
              onChange={setSecs}
              hint={`Measured: ${measured.secondsPerReview.toFixed(1)} s per answer over the last ${fsrs.windowDays} days (each answer capped at 60 s). Only affects minutes, not review counts.`}
            />
            <div className="space-y-3">
              <Segmented
                label="Desired retention"
                value={retentionMode}
                options={[
                  { value: 'preset', label: presetLabel ? `Presets (${presetLabel})` : 'Presets' },
                  { value: 'custom', label: 'Custom' },
                ]}
                onChange={setRetentionMode}
              />
              {retentionMode === 'custom' && (
                <Slider
                  label="Custom desired retention"
                  value={retention}
                  min={0.7}
                  max={0.97}
                  step={0.01}
                  format={(v) => formatPct(v, 0)}
                  onChange={setRetention}
                  hint={`Applies to every selected deck. Your presets: ${fsrs.presets.map((p) => `${deckNames[p.deckId] ?? p.deckId} ${formatPct(p.desiredRetention, 0)}`).join(', ')}. Existing cards keep their current due dates; the new target applies from their next review, as in Anki when you change it without rescheduling.`}
                />
              )}
            </div>
            <div>
              <Segmented
                label="Recall model"
                value={recall}
                options={[
                  { value: 'fsrs', label: 'FSRS prediction' },
                  { value: 'calibrated', label: 'Your lapse rate' },
                ]}
                onChange={setRecall}
              />
              <p className="mt-2 text-xs leading-relaxed text-muted">
                <span className="font-bold text-ink-2">FSRS prediction</span> draws lapses from FSRS’s recall probability.{' '}
                <span className="font-bold text-ink-2">Your lapse rate</span> scales them to how often you actually pressed
                Again, staying close to FSRS’s prediction until there are enough lapses to go on.
              </p>
            </div>
          </div>
        </Disclosure>
      </div>
    </Panel>
  )

  const status = unavailable ? (
    <PlannerState title="Nothing to simulate">The selected decks have no studied or new cards with FSRS data.</PlannerState>
  ) : error ? (
    <PlannerState title="The simulation didn’t finish" alert>
      Something went wrong ({error}). Try different settings or reload the page.
    </PlannerState>
  ) : !main || !summary || !planShown ? (
    <PlannerState title="Simulating your cards…" busy>
      Running {settings.runs} simulated futures of every card. This takes a moment.
    </PlannerState>
  ) : null

  return (
    <div className="space-y-6">
      {/* Phones and tablets: the controls and their results are a long way apart, so the result stays in view */}
      {!status && summary && (
        <div data-testid="plan-summary" className="sticky top-[4.5rem] z-30 lg:hidden">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur-lg">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-ink tabular-nums">{messages.planner.summary.load(minutesPerStudyDay, summary.avgPerStudyDay)}</p>
              <p className="text-xs text-muted">{messages.planner.summary.detail(newPerDay, verdict?.label ?? messages.planner.pace.label)}</p>
            </div>
            {updating ? (
              <RefreshIcon size={18} spinning />
            ) : (
              verdict && <span className={verdict.tone === 'good' ? 'text-good' : 'text-warning'}>{verdict.tone === 'good' ? <CheckIcon size={18} /> : <WarningIcon size={18} />}</span>
            )}
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        {controls}

        <Panel
          title="What to expect"
          eyebrow={`Next ${horizonLabel}`}
          subtitle={`FSRS-6 simulation of your real cards · ${main ? `${main.runs} runs` : 'running…'}`}
          variant="projection"
          className="lg:col-span-3"
          actions={
            updating && main && planShown ? (
              <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-strong">
                <RefreshIcon size={14} spinning /> Updating…
              </span>
            ) : undefined
          }
        >
          {status ??
            (summary && main && (
              <>
                <div className="rounded-3xl bg-brand-soft p-5">
                  <p className="text-sm font-bold text-brand-strong">On a typical study day</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-ink">
                    <span className="text-5xl font-black tracking-tight tabular-nums">≈ {formatInt(minutesPerStudyDay)} min</span>
                    <span className="text-lg font-bold text-ink-2">{formatInt(summary.avgPerStudyDay)} reviews</span>
                  </p>
                  <p className="mt-2 text-sm text-ink-2">
                    At {newPerDay} new {newPerDay === 1 ? 'card' : 'cards'} a day, {studyDays} {studyDays === 1 ? 'day' : 'days'} a week, over the
                    next {horizonLabel}. Busiest day: about {formatInt(summary.peak.mean)} reviews.
                  </p>
                  {verdict && (
                    <p
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold ${
                        verdict.tone === 'good' ? 'bg-good-soft text-good' : 'bg-warning-soft text-warning'
                      }`}
                    >
                      {verdict.tone === 'good' ? <CheckIcon size={16} /> : <WarningIcon size={16} />}
                      {verdict.label}
                      <InfoTip label="About this verdict">
                        Judged on the heaviest 30 days of a simulated year ({formatInt(heaviest)} min per study day) against
                        your {budget}-minute budget, and whether the daily review limit leaves cards waiting.
                      </InfoTip>
                    </p>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Metric
                    label="Total reviews"
                    value={formatInt(summary.total.mean)}
                    sub={`likely ${formatInt(summary.total.p10)}–${formatInt(summary.total.p90)}`}
                    tip="Mean over simulation runs; the range covers the middle 80% of runs (10th–90th percentile)."
                  />
                  <Metric
                    label="Per study day"
                    value={formatInt(summary.avgPerStudyDay)}
                    sub={`${formatInt(summary.avgPerDay)} per calendar day`}
                  />
                  <Metric
                    label="Busiest day"
                    value={formatInt(summary.peak.mean)}
                    sub={`90% of runs ≤ ${formatInt(summary.peak.p90)}`}
                    tip="Busiest single day in each run, averaged over runs."
                  />
                  <Metric label="Minutes per study day" value={formatInt(minutesPerStudyDay)} sub={`at ${secs} s per review`} />
                  <Metric
                    label="Cards at 21+ days"
                    value={formatInt(summary.matureEnd)}
                    sub={`${formatInt(mature0(fsrs, settings.deckIds))} today → end of period`}
                    tip="Cards with a scheduled interval of 21 days or more at the end of the period (Anki’s “mature”)."
                  />
                  <Metric
                    label="New cards introduced"
                    value={formatInt(summary.newIntroduced)}
                    sub={
                      summary.newIntroduced < newPerDay * main.days.slice(0, horizon).filter((d) => d.study).length - 0.5
                        ? 'limited by remaining new cards'
                        : `${formatInt(pool - summary.newIntroduced)} new cards left after`
                    }
                  />
                </div>
              </>
            ))}
        </Panel>
      </div>

      {!status && main && summary && (
        <>
          {/* Recommendations */}
          <Panel
            title="Recommendations"
            eyebrow="Answers from the simulation"
            subtitle="Plain answers to common planning questions, using your settings above."
            variant="projection"
          >
            {insights.length ? (
              <dl className="grid gap-4 md:grid-cols-2">
                {insights.map((i) => (
                  <div key={i.question} className="rounded-2xl bg-surface-2 p-4">
                    <dt className="flex items-start gap-2.5 font-extrabold text-ink">
                      <span
                        aria-hidden
                        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                          i.tone === 'good' ? 'bg-good-soft text-good' : i.tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-surface text-muted'
                        }`}
                      >
                        {i.tone === 'good' ? <CheckIcon size={14} /> : i.tone === 'warning' ? <WarningIcon size={14} /> : <SparkleIcon size={14} />}
                      </span>
                      {i.question}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed text-ink-2">{i.answer}</dd>
                    <dd className="mt-1.5 text-xs text-muted">Based on: {i.basis}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <PlannerState title="Comparing scenarios…" busy>
                Simulating other new-card limits to compare with yours.
              </PlannerState>
            )}
          </Panel>

          {/* Timeline */}
          <GoalPlanner
            started={decks.filter((d) => deckIds.includes(d.id)).reduce((n, d) => n + d.youngCards + d.matureCards, 0)}
            available={pool}
            todayKey={todayKey}
            studyDaysPerWeek={studyDays}
            sweep={scenarios?.newPerDay ? standardSweep(scenarios.newPerDay) : []}
            secondsPerReview={secs}
            budget={budget}
            onUse={setPace}
          />

          <Panel
            title="How will my reviews add up?"
            eyebrow={weekly ? 'Projected reviews per day (weekly average)' : 'Projected daily reviews'}
            subtitle={`Starting ${formatLongDate(todayKey)}${summary.backlogEnd > 1 ? ` · ${formatInt(summary.backlogEnd)} cards held back by the daily review limit at the end` : ''}`}
            variant="projection"
            actions={
              <InfoTip label="About this chart">
                Already scheduled: the next review of each existing card, on the date Anki has set (moved only by rest days or
                the review limit). Everything after that is estimated by the FSRS simulation. The shaded band covers the middle
                80% of runs.
              </InfoTip>
            }
          >
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SERIES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                  <svg width="12" height="12" aria-hidden>
                    <defs>
                      <HatchPattern id={`lg-${s.key}`} color={s.color} />
                    </defs>
                    <rect width="12" height="12" rx="3" fill={s.estimated ? `url(#lg-${s.key})` : s.color} />
                  </svg>
                  {s.label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                <span className="size-2.5 rounded-full opacity-35" style={{ background: forecast.band }} />
                Likely range
              </span>
            </div>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={horizon > 30 ? 1 : '15%'}>
                  <defs>
                    {SERIES.filter((s) => s.estimated).map((s) => (
                      <HatchPattern key={s.key} id={`hatch-${s.key}`} color={s.color} />
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} stroke={chart.grid} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatShortDate}
                    tick={{ fill: chart.muted, fontSize: 12 }}
                    axisLine={{ stroke: chart.axis }}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis tick={{ fill: chart.muted, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={formatInt} />
                  <Tooltip
                    cursor={{ stroke: chart.muted, strokeDasharray: '3 3' }}
                    content={({ active, payload, label }) => {
                      const row = rows.find((r) => r.date === label)
                      return (
                        <ChartTooltip
                          active={active}
                          title={typeof label === 'string' ? `${weekly ? 'Week of ' : ''}${formatLongDate(label)}` : ''}
                          rows={(payload ?? [])
                            .filter((p) => p.dataKey !== 'band')
                            .map((p) => {
                              const s = SERIES.find((x) => x.key === p.dataKey)!
                              return { color: s.color, label: s.label, value: formatInt(Number(p.value)) }
                            })}
                          footer={
                            row
                              ? {
                                  label: `Total (likely ${formatInt(row.band[0])}–${formatInt(row.band[1])})`,
                                  value: `${formatInt(row.total)} · ${formatInt(toMin(row.total))} min`,
                                }
                              : undefined
                          }
                        />
                      )
                    }}
                  />
                  <Area
                    dataKey="band"
                    type={weekly ? 'monotone' : 'step'}
                    stroke="none"
                    fill={forecast.band}
                    fillOpacity={0.18}
                    isAnimationActive={false}
                    activeDot={false}
                  />
                  {/* Daily horizons: one stacked bar per day (rest days show as gaps). Weekly averages: areas. */}
                  {SERIES.map((s, i) =>
                    weekly ? (
                      <Area
                        key={s.key}
                        dataKey={s.key}
                        stackId="w"
                        type="monotone"
                        stroke={s.color}
                        strokeWidth={1.5}
                        strokeDasharray={s.estimated ? '4 3' : undefined}
                        fill={s.estimated ? `url(#hatch-${s.key})` : s.color}
                        fillOpacity={s.estimated ? 1 : 0.6}
                        isAnimationActive={false}
                      />
                    ) : (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        stackId="w"
                        fill={s.estimated ? `url(#hatch-${s.key})` : s.color}
                        radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : 0}
                        isAnimationActive={false}
                      />
                    ),
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted">
              Over {horizon} days: {formatInt(summary.known)} already-scheduled reviews, {formatInt(summary.followUp)} estimated
              follow-ups of existing cards, {formatInt(summary.fresh)} from new cards.
            </p>
          </Panel>

          {/* Scenarios */}
          <Panel
            title="What if I change my settings?"
            eyebrow="Compare scenarios"
            subtitle="Each bar is a separate simulation with the same random draws, so differences come from the setting."
            variant="projection"
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <ScenarioCard
                title="New cards per day"
                question="How much time does each new-card limit cost?"
                tip={`Minutes per study day in the heaviest 30 days of the next ${horizon} days, for each scenario. Dashed line: your ${budget}-minute budget. Your current setting is the solid bar.`}
              >
                {scenarioRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scenarioRows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid vertical={false} stroke={chart.grid} />
                      <XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 12 }} axisLine={{ stroke: chart.axis }} tickLine={false} />
                      <YAxis tick={{ fill: chart.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatInt} />
                      <ReferenceLine y={budget} stroke={chart.ink} strokeDasharray="4 4" strokeOpacity={0.6} />
                      <Tooltip
                        cursor={{ fill: chart.cursor }}
                        content={({ active, payload }) => {
                          const r = payload?.[0]?.payload as (typeof scenarioRows)[number] | undefined
                          return r ? (
                            <ChartTooltip
                              active={active}
                              title={`${r.value} new cards per day`}
                              rows={[
                                { color: forecast.fresh, label: 'Heaviest month', value: `${formatInt(r.minutes)} min/day` },
                                { color: forecast.fresh, label: 'Reviews per study day', value: formatInt(r.reviews) },
                              ]}
                              footer={{ label: `Total over ${horizon} d`, value: formatInt(r.total) }}
                            />
                          ) : null
                        }}
                      />
                      <Bar dataKey="minutes" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {scenarioRows.map((r) => (
                          <Cell key={r.value} fill={forecast.fresh} fillOpacity={r.value === newPerDay ? 1 : 0.4} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartPending />
                )}
              </ScenarioCard>

              <ScenarioCard
                title="Desired retention"
                question="How many more reviews does a higher target mean?"
                tip={`Total reviews over the next ${horizon} days at each desired retention, with your other settings. Higher retention means shorter intervals and more reviews. Expected recall at review time is roughly the target itself.`}
              >
                {retentionRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={retentionRows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid vertical={false} stroke={chart.grid} />
                      <XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 12 }} axisLine={{ stroke: chart.axis }} tickLine={false} />
                      <YAxis tick={{ fill: chart.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatInt} />
                      <Tooltip
                        cursor={{ fill: chart.cursor }}
                        content={({ active, payload }) => {
                          const r = payload?.[0]?.payload as (typeof retentionRows)[number] | undefined
                          return r ? (
                            <ChartTooltip
                              active={active}
                              title={`Desired retention ${r.label}`}
                              rows={[
                                { color: forecast.known, label: 'Total reviews', value: formatInt(r.total) },
                                { color: forecast.known, label: 'Minutes per study day', value: formatInt(r.minutes) },
                              ]}
                            />
                          ) : null
                        }}
                      />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {retentionRows.map((r) => (
                          <Cell
                            key={r.value}
                            fill={forecast.known}
                            fillOpacity={effectiveRetention !== null && Math.abs(r.value - effectiveRetention) < 0.001 ? 1 : 0.4}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartPending />
                )}
              </ScenarioCard>

              <ScenarioCard
                title="Burden by deck"
                question="Which deck will keep me busiest?"
                tip={`Projected reviews over the next ${horizon} days: existing cards (solid) vs cards introduced during the period (hatched).`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deckRows} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 8 }} barSize={22}>
                    <defs>
                      {deckRows.map((d) => (
                        <HatchPattern key={d.deckId} id={`hatch-deck-${d.deckId}`} color={deckColor(d.deckId)} />
                      ))}
                    </defs>
                    <CartesianGrid horizontal={false} stroke={chart.grid} />
                    <XAxis type="number" tick={{ fill: chart.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatInt} />
                    <YAxis type="category" dataKey="name" tick={{ fill: chart.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip
                      cursor={{ fill: chart.cursor }}
                      content={({ active, payload }) => {
                        const r = payload?.[0]?.payload as (typeof deckRows)[number] | undefined
                        return r ? (
                          <ChartTooltip
                            active={active}
                            title={r.name}
                            rows={[
                              { color: deckColor(r.deckId), label: 'Existing cards', value: formatInt(r.existing) },
                              { color: deckColor(r.deckId), label: 'New cards (estimated)', value: formatInt(r.fresh) },
                            ]}
                            footer={{ label: 'Total', value: formatInt(r.existing + r.fresh) }}
                          />
                        ) : null
                      }}
                    />
                    <Bar dataKey="existing" stackId="d" isAnimationActive={false}>
                      {deckRows.map((d) => (
                        <Cell key={d.deckId} fill={deckColor(d.deckId)} />
                      ))}
                    </Bar>
                    <Bar dataKey="fresh" stackId="d" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {deckRows.map((d) => (
                        <Cell key={d.deckId} fill={`url(#hatch-deck-${d.deckId})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ScenarioCard>
            </div>
          </Panel>

          <Disclosure title="How the forecast works, and its limits" subtitle="Assumptions, what’s modelled and what isn’t">
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
              <li>
                Starts from every studied card’s real FSRS state and due date. Each review draws recall from FSRS-6’s
                predicted probability (or your measured lapse rate), uses your measured Hard/Good/Easy mix, updates the
                memory state with the FSRS-6 formulas, and schedules the next interval at the desired retention with
                Anki’s interval fuzz and your presets’ maximum interval and daily review limit. Cards in subdecks with
                their own preset keep that preset’s parameters, desired retention and maximum interval; daily limits,
                learning steps and new cards follow the preset most of a deck’s cards use.
              </li>
              <li>
                New cards use your measured first-answer mix (Again/Hard/Good/Easy) and your learning steps. Their first-day
                review count uses your measured average ({fsrs.behaviour.map((b) => `${deckNames[b.deckId]} ${b.learningReviewsPerNewCard.toFixed(1)}`).join(', ')} answers per new card).
              </li>
              <li>
                Not modelled: lapses during learning steps, Anki’s load balancing, sibling burying, easy days, changes to
                your FSRS parameters after re-optimising, and changes in how you study. Results are expectations, not a
                schedule.
              </li>
              <li>
                The “Your lapse rate” model uses about{' '}
                {selectedSimDecks.map((d) => `${Math.round(d.failRatio * 100)}% of FSRS’s expectation for ${deckNames[d.deckId]}`).join(' and ')}
                , based on {formatInt(observedLapses)} {observedLapses === 1 ? 'lapse' : 'lapses'} in {formatInt(calibrationReviews)} review-card reviews
                {shiftDate && messages.planner.sinceChange(formatShortDate(shiftDate))}. It stays near FSRS’s prediction until there are enough lapses to go on.
                {observedLapses < 20 && ' With this few lapses, the “Your lapse rate” model rests on limited evidence.'}
              </li>
            </ul>
          </Disclosure>
        </>
      )}
    </div>
  )
}

/** One tap sets a sensible new-card limit; the exact number lives under "Fine-tune". */
function PacePicker({
  presets,
  pace,
  newPerDay,
  onPick,
  current,
}: {
  presets: PlanPreset[] | null
  pace: Pace
  newPerDay: number
  onPick: (pace: PlanPresetKey | 'current') => void
  current: { newPerDay: number; minutes: number | null } | null
}) {
  const m = messages.planner.pace
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink-2">
        {m.label}
        <InfoTip label={`About ${m.label}`}>{m.tip}</InfoTip>
      </p>
      <div role="radiogroup" aria-label={m.label} className={`grid gap-2 ${current ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {current && (
          <button
            type="button"
            role="radio"
            aria-checked={pace === 'current'}
            onClick={() => onPick('current')}
            className={`rounded-2xl border-2 px-2 py-2.5 text-center transition-colors ${
              pace === 'current' ? 'border-brand bg-brand-soft' : 'border-transparent bg-surface-2 hover:border-line'
            }`}
          >
            <span className="block text-sm font-extrabold text-ink">{m.current}</span>
            <span className="mt-0.5 block text-sm font-bold text-ink tabular-nums">{m.newCards(current.newPerDay)}</span>
            {current.minutes !== null ? <span className="block text-xs text-muted">{m.heaviest(current.minutes)}</span> : <span className="skeleton mx-auto mt-1.5 block h-3 w-14" aria-hidden />}
          </button>
        )}
        {PLAN_PRESETS.map(({ key }) => {
          const preset = presets?.find((p) => p.key === key)
          const selected = pace === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(key)}
              className={`rounded-2xl border-2 px-2 py-2.5 text-center transition-colors ${
                selected ? 'border-brand bg-brand-soft' : 'border-transparent bg-surface-2 hover:border-line'
              }`}
            >
              <span className="block text-sm font-extrabold text-ink">{m[key]}</span>
              {preset ? (
                <>
                  <span className="mt-0.5 block text-sm font-bold text-ink tabular-nums">{m.newCards(preset.newPerDay)}</span>
                  <span className="block text-xs text-muted">{preset.fits ? m.fits(preset.minutes) : m.over(preset.minutes)}</span>
                </>
              ) : (
                <span className="skeleton mx-auto mt-1.5 block h-7 w-14" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
      {typeof pace === 'number' && <p className="mt-2 text-xs font-bold text-ink-2">{m.custom(newPerDay)}</p>}
    </div>
  )
}

/** Loading, empty and error states inside the Planner, friendly rather than blank. */
function PlannerState({ title, children, busy, alert }: { title: string; children: ReactNode; busy?: boolean; alert?: boolean }) {
  return (
    <div role={alert ? 'alert' : 'status'} className="flex flex-col items-center py-12 text-center">
      <span className={`grid size-14 place-items-center rounded-3xl ${alert ? 'bg-critical-soft text-critical' : 'bg-brand-soft text-brand'}`}>
        {alert ? <WarningIcon size={26} /> : <RefreshIcon size={26} spinning={busy} />}
      </span>
      <p className="mt-3 font-extrabold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>
    </div>
  )
}

function ChartPending() {
  return <div className="skeleton h-full" aria-label="Simulating scenarios" />
}

function ScenarioCard({ title, question, tip, children }: { title: string; question: string; tip: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-4">
      <h3 className="font-extrabold text-ink">
        {title}
        <InfoTip label={`About ${title}`}>{tip}</InfoTip>
      </h3>
      <p className="text-xs text-muted">{question}</p>
      <div className="mt-3 h-52">{children}</div>
    </div>
  )
}

/** Mature cards today in the selected decks (interval of 21+ days). */
function mature0(fsrs: FsrsData, deckIds: string[]) {
  return fsrs.cards.filter((c) => deckIds.includes(c.deckId) && c.interval >= 21).length
}
