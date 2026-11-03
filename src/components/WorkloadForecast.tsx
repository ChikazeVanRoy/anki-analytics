import { useMemo, useState } from 'react'
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
import type { Deck, FsrsData } from '../data/types'
import { SCENARIO_NEW_PER_DAY, useSimulation } from '../data/useSimulation'
import { dayNumber, keyFromDayNumber } from '../lib/dates'
import { formatInt, formatLongDate, formatPct, formatShortDate } from '../lib/format'
import { buildInsights } from '../lib/insights'
import type { MeasuredDefaults } from '../lib/measured'
import { lapseEvidence } from '../lib/fsrsStats'
import { buildSimDecks, HORIZONS, presetRetentionLabel, type SimDay, type SimSettings } from '../lib/simulator'
import { chart, deckColor, forecast } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'
import { HatchPattern, InfoTip, Metric, Segmented, Slider, SourceBadge } from './ui'

interface Props {
  fsrs: FsrsData
  decks: Deck[]
  todayKey: string
  startWeekday: number
  measured: MeasuredDefaults
}

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

export function WorkloadForecast({ fsrs, decks: allDecks, todayKey, startWeekday, measured }: Props) {
  const decks = allDecks.filter((d) => fsrs.presets.some((p) => p.deckId === d.id))
  const deckNames = Object.fromEntries(decks.map((d) => [d.id, d.name]))
  const simDecks = useMemo(() => buildSimDecks(fsrs, todayKey), [fsrs, todayKey])

  const [deckSel, setDeckSel] = useState<string>('all')
  const [horizon, setHorizon] = useState<number>(90)
  const [newPerDay, setNewPerDay] = useState(30)
  // Desired retention: each deck's own preset value by default, or one custom value for all selected decks
  const [retentionMode, setRetentionMode] = useState<'preset' | 'custom'>('preset')
  const [retention, setRetention] = useState(Math.round((fsrs.presets[0]?.desiredRetention ?? 0.9) * 100) / 100)
  const [studyDays, setStudyDays] = useState(measured.studyDaysPerWeek)
  const [secs, setSecs] = useState(Math.round(measured.secondsPerReview))
  const [budget, setBudget] = useState(Math.max(10, Math.ceil(measured.minutesPerStudyDay / 5) * 5))
  const [recall, setRecall] = useState<SimSettings['recall']>('fsrs')

  const deckIds = deckSel === 'all' ? decks.map((d) => d.id) : [deckSel]
  const presetValues = [...new Set(fsrs.presets.filter((p) => deckIds.includes(p.deckId)).map((p) => Math.round(p.desiredRetention * 100)))]
  const presetLabel = presetRetentionLabel(presetValues.map((v) => v / 100))
  // The retention bar to highlight: the custom value, or the presets' value when they all agree
  const effectiveRetention = retentionMode === 'custom' ? retention : presetValues.length === 1 ? presetValues[0] / 100 : null
  const settings: SimSettings = {
    deckIds,
    newPerDay,
    desiredRetention: retentionMode === 'custom' ? retention : undefined,
    studyDaysPerWeek: studyDays,
    runs: 24,
    seed: 20261103,
    recall,
    startWeekday,
  }
  const { main, scenarios, running, error, unavailable } = useSimulation(simDecks, settings)
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
          deckNames,
        })
      : []
  const pool = settings.deckIds.reduce((n, id) => n + (fsrs.newCards[id] ?? 0), 0)
  // Lapse evidence for the selected decks only, matching the ratios listed for them
  const { reviews: calibrationReviews, lapses: observedLapses } = lapseEvidence(fsrs.calibration, deckIds)
  const selectedSimDecks = simDecks.filter((d) => deckIds.includes(d.deckId))

  return (
    <Panel
      title="Review workload forecast"
      subtitle={`FSRS-6 Monte Carlo simulation of your real cards · ${main ? `${main.runs} runs` : 'running…'}${running ? ' · updating…' : ''}`}
      actions={<SourceBadge kind="projection" />}
      className="border-dashed"
    >
      {/* Controls */}
      <div className="grid gap-x-6 gap-y-4 rounded-xl border border-line bg-surface-2/40 p-4 md:grid-cols-2 lg:grid-cols-4">
        <Segmented
          label="Decks"
          value={deckSel}
          options={[{ value: 'all', label: decks.length === 2 ? 'Both' : 'All' }, ...decks.map((d) => ({ value: d.id, label: d.name }))]}
          onChange={setDeckSel}
        />
        <Segmented
          label="Horizon"
          value={horizon}
          options={HORIZONS.map((h) => ({ value: h, label: h === 365 ? '1 yr' : `${h} d` }))}
          onChange={setHorizon}
        />
        <Segmented
          label="Recall model"
          value={recall}
          options={[
            { value: 'fsrs', label: 'FSRS prediction' },
            { value: 'calibrated', label: 'Your lapse rate' },
          ]}
          onChange={setRecall}
        />
        <p className="text-xs leading-relaxed text-muted lg:self-end">
          <span className="text-ink-2">FSRS prediction</span> draws lapses from FSRS’s recall probability.{' '}
          <span className="text-ink-2">Your lapse rate</span> scales them to how often you actually pressed Again.
        </p>
        <Slider
          label="New cards per day"
          value={newPerDay}
          min={0}
          max={100}
          onChange={setNewPerDay}
          hint={`Total across the selected decks, split evenly while each still has new cards (${formatInt(pool)} available).`}
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
          hint={`Measured: ${measured.secondsPerReview.toFixed(1)} s per answer over the last 4 weeks. Only affects minutes, not review counts.`}
        />
      </div>

      {unavailable ? (
        <p className="py-16 text-center text-sm text-muted">
          Nothing to simulate: the selected decks have no studied or new cards with FSRS data.
        </p>
      ) : error ? (
        <p role="alert" className="py-16 text-center text-sm text-ink-2">
          The simulation failed ({error}). Try different settings or reload the page.
        </p>
      ) : !main || !summary ? (
        <p className="py-16 text-center text-sm text-muted">Simulating your cards…</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Metric
              label="Total reviews"
              value={formatInt(summary.total.mean)}
              sub={`range ${formatInt(summary.total.p10)}–${formatInt(summary.total.p90)}`}
              tip="Mean over simulation runs; range is the 10th–90th percentile of runs."
            />
            <Metric
              label="Average per study day"
              value={formatInt(summary.avgPerStudyDay)}
              sub={`${formatInt(summary.avgPerDay)} per calendar day`}
            />
            <Metric
              label="Peak day"
              value={formatInt(summary.peak.mean)}
              sub={`90% of runs ≤ ${formatInt(summary.peak.p90)}`}
              tip="Busiest single day in each run, averaged over runs."
            />
            <Metric label="Minutes per study day" value={formatInt(toMin(summary.avgPerStudyDay))} sub={`at ${secs} s per review`} />
            <Metric
              label="Mature cards"
              value={formatInt(summary.matureEnd)}
              sub={`${formatInt(mature0(fsrs, settings.deckIds))} today → end of period`}
              tip="Cards with a scheduled interval of 21 days or more at the end of the period (Anki’s definition)."
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

          {/* Timeline */}
          <div className="mt-5 rounded-xl border border-dashed border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Projected {weekly ? 'reviews per day (weekly average)' : 'daily reviews'}
                  <InfoTip>
                    Already scheduled: the next review of each existing card, on the date Anki has set (moved only by rest
                    days or the review limit). Everything after that is estimated by the FSRS simulation. The grey band is
                    the 10th–90th percentile across runs.
                  </InfoTip>
                </h3>
                <p className="text-xs text-muted">
                  Starting {formatLongDate(todayKey)} · known schedule vs estimated reviews
                  {summary.backlogEnd > 1 && ` · ${formatInt(summary.backlogEnd)} cards held back by the daily review limit at the end`}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {SERIES.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                    <svg width="12" height="12" aria-hidden>
                      <defs>
                        <HatchPattern id={`lg-${s.key}`} color={s.color} />
                      </defs>
                      <rect width="12" height="12" rx="2" fill={s.estimated ? `url(#lg-${s.key})` : s.color} />
                    </svg>
                    {s.label}
                  </span>
                ))}
                <LegendItem color="rgb(195 194 183 / 0.35)" label="Range across runs" />
              </div>
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
                                  label: `Total (range ${formatInt(row.band[0])}–${formatInt(row.band[1])})`,
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
                        radius={i === SERIES.length - 1 ? [2, 2, 0, 0] : 0}
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
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {/* Scenarios */}
            <div className="rounded-xl border border-dashed border-line p-4">
              <h3 className="text-sm font-semibold text-ink">
                New cards per day
                <InfoTip>
                  Minutes per study day in the heaviest 30 days of the next {horizon} days, for each scenario. All scenarios
                  share the same random draws, so differences come from the setting. Dashed line: your time budget.
                </InfoTip>
              </h3>
              <p className="text-xs text-muted">Heaviest month, minutes per study day</p>
              <div className="mt-3 h-52">
                {scenarioRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scenarioRows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid vertical={false} stroke={chart.grid} />
                      <XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 12 }} axisLine={{ stroke: chart.axis }} tickLine={false} />
                      <YAxis tick={{ fill: chart.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatInt} />
                      <ReferenceLine y={budget} stroke={chart.ink} strokeDasharray="4 4" strokeOpacity={0.6} />
                      <Tooltip
                        cursor={{ fill: 'rgb(255 255 255 / 0.05)' }}
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
                      <Bar dataKey="minutes" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {scenarioRows.map((r) => (
                          <Cell key={r.value} fill={forecast.fresh} fillOpacity={r.value === newPerDay ? 1 : 0.45} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pt-16 text-center text-xs text-muted">Simulating scenarios…</p>
                )}
              </div>
              <div className="mt-3">
                <Slider
                  label="Daily time budget"
                  value={budget}
                  min={5}
                  max={180}
                  step={5}
                  format={(v) => `${v} min`}
                  onChange={setBudget}
                  hint={`Used by the insights below. Default: your measured ${Math.round(measured.minutesPerStudyDay)} min per study day over the last 4 weeks, rounded up.`}
                />
              </div>
            </div>

            {/* Retention */}
            <div className="rounded-xl border border-dashed border-line p-4">
              <h3 className="text-sm font-semibold text-ink">
                Desired retention
                <InfoTip>
                  Total reviews over the next {horizon} days at each desired retention, with your other settings. Higher
                  retention means shorter intervals and more reviews. Expected recall at review time is roughly the
                  target itself.
                </InfoTip>
              </h3>
              <p className="text-xs text-muted">Total reviews over {horizon} days</p>
              <div className="mt-3 h-52">
                {retentionRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={retentionRows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid vertical={false} stroke={chart.grid} />
                      <XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 12 }} axisLine={{ stroke: chart.axis }} tickLine={false} />
                      <YAxis tick={{ fill: chart.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatInt} />
                      <Tooltip
                        cursor={{ fill: 'rgb(255 255 255 / 0.05)' }}
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
                      <Bar dataKey="total" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {retentionRows.map((r) => (
                          <Cell
                            key={r.value}
                            fill={forecast.known}
                            fillOpacity={effectiveRetention !== null && Math.abs(r.value - effectiveRetention) < 0.001 ? 1 : 0.45}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pt-16 text-center text-xs text-muted">Simulating scenarios…</p>
                )}
              </div>
            </div>

            {/* Deck burden */}
            <div className="rounded-xl border border-dashed border-line p-4">
              <h3 className="text-sm font-semibold text-ink">
                Burden by deck
                <InfoTip>Projected reviews over the next {horizon} days: existing cards (solid) vs cards introduced during the period (hatched).</InfoTip>
              </h3>
              <p className="text-xs text-muted">Reviews over {horizon} days</p>
              <div className="mt-3 h-52">
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
                      cursor={{ fill: 'rgb(255 255 255 / 0.05)' }}
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
                    <Bar dataKey="fresh" stackId="d" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                      {deckRows.map((d) => (
                        <Cell key={d.deckId} fill={`url(#hatch-deck-${d.deckId})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Insights */}
          <div className="mt-5 rounded-xl border border-line bg-surface-2/40 p-4">
            <h3 className="text-sm font-semibold text-ink">Insights</h3>
            {insights.length ? (
              <dl className="mt-3 grid gap-4 md:grid-cols-2">
                {insights.map((i) => (
                  <div key={i.question} className="rounded-lg border border-line/70 p-3">
                    <dt className="flex items-start gap-2 text-sm font-medium text-ink">
                      <span
                        aria-hidden
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${i.tone === 'good' ? 'bg-good' : i.tone === 'warning' ? 'bg-warning' : 'bg-ink-2'}`}
                      />
                      {i.question}
                    </dt>
                    <dd className="mt-1.5 text-sm text-ink-2">{i.answer}</dd>
                    <dd className="mt-1 text-xs text-muted">Based on: {i.basis}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted">Simulating scenarios…</p>
            )}
          </div>

          <details className="mt-5 rounded-xl border border-line px-4 py-3 text-xs leading-relaxed text-ink-2">
            <summary className="cursor-pointer text-sm font-medium text-ink">How the forecast works, and its limits</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Starts from every studied card’s real FSRS state and due date. Each review draws recall from FSRS-6’s
                predicted probability (or your measured lapse rate), uses your measured Hard/Good/Easy mix, updates the
                memory state with the FSRS-6 formulas, and schedules the next interval at the desired retention with
                Anki’s interval fuzz and your presets’ maximum interval and daily review limit.
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
                Your measured lapse rate is about{' '}
                {selectedSimDecks.map((d) => `${Math.round(d.failRatio * 100)}% of FSRS’s expectation for ${deckNames[d.deckId]}`).join(' and ')}
                , from {formatInt(observedLapses)} {observedLapses === 1 ? 'lapse' : 'lapses'} in {formatInt(calibrationReviews)} review-card reviews.
                {observedLapses < 20 && ' With this few lapses, the “Your lapse rate” model rests on limited evidence.'}
              </li>
            </ul>
          </details>
        </>
      )}
    </Panel>
  )
}

/** Mature cards today in the selected decks (interval of 21+ days). */
function mature0(fsrs: FsrsData, deckIds: string[]) {
  return fsrs.cards.filter((c) => deckIds.includes(c.deckId) && c.interval >= 21).length
}
