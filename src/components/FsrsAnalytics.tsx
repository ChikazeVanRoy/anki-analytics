import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Deck, FsrsData } from '../data/types'
import { formatInt, formatPct } from '../lib/format'
import { difficultyPercent } from '../lib/fsrs'
import {
  calibrationCurve,
  cardsNow,
  DIFFICULTY_BINS,
  histogram,
  memorySummary,
  monthlyTrend,
  retentionComparison,
  RETRIEVABILITY_BINS,
  RISK_MARGIN,
  STABILITY_BINS,
  type MemorySummary,
} from '../lib/fsrsStats'
import { calibrationColors, chart, deckColor } from '../lib/theme'
import { ChartTooltip } from './ChartTooltip'
import { LegendItem, Panel } from './Panel'
import { Disclosure, InfoTip, Metric, Notice, SourceBadge } from './ui'

interface Props {
  fsrs: FsrsData
  decks: Deck[]
  todayKey: string
}

const days = (n: number) => (n < 1 ? `${n.toFixed(1)} d` : n < 60 ? `${Math.round(n)} d` : `${(n / 30.4).toFixed(1)} mo`)

function DistributionChart({
  title,
  technical,
  tip,
  rows,
  decks,
}: {
  title: string
  technical: string
  tip: string
  rows: Record<string, number | string>[]
  decks: Deck[]
}) {
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="text-xs font-bold tracking-wide text-muted uppercase">{technical}</p>
      <h3 className="font-extrabold text-ink">
        {title}
        <InfoTip label={`About ${title}`}>{tip}</InfoTip>
      </h3>
      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis
              dataKey="label"
              tick={{ fill: chart.muted, fontSize: 10 }}
              axisLine={{ stroke: chart.axis }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fill: chart.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: chart.cursor }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  title={String(label ?? '')}
                  rows={(payload ?? []).map((p) => ({
                    color: deckColor(String(p.dataKey)),
                    label: decks.find((d) => d.id === p.dataKey)?.name ?? String(p.dataKey),
                    value: `${formatInt(Number(p.value))} cards`,
                  }))}
                />
              )}
            />
            {decks.map((d) => (
              <Bar key={d.id} dataKey={d.id} fill={deckColor(d.id)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SummaryTable({ rows, decks }: { rows: MemorySummary[]; decks: Deck[] }) {
  const name = (id: string) => (id === 'all' ? 'All decks' : (decks.find((d) => d.id === id)?.name ?? id))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 pr-3 font-bold">Deck</th>
            <th className="py-2 pr-3 text-right font-medium">Cards</th>
            <th className="py-2 pr-3 text-right font-medium">
              Recall today
              <InfoTip>Average current retrievability: FSRS’s probability you would recall each card if asked today.</InfoTip>
            </th>
            <th className="py-2 pr-3 text-right font-medium">
              Median stability
              <InfoTip>Stability is how many days it takes for recall probability to fall to 90%. Higher is stronger memory.</InfoTip>
            </th>
            <th className="py-2 pr-3 text-right font-medium">
              Avg difficulty
              <InfoTip>FSRS difficulty, shown as Anki shows it (0% easiest, 100% hardest). Not the old ease factor.</InfoTip>
            </th>
            <th className="py-2 pr-3 text-right font-medium">Below target</th>
            <th className="py-2 pr-3 text-right font-medium">
              Elevated risk
              <InfoTip>
                Cards whose recall probability is more than {RISK_MARGIN * 100} points below the deck’s desired retention,
                for example under 85% at a 90% target.
              </InfoTip>
            </th>
            <th className="py-2 text-right font-medium">Overdue</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.deckId} className={`border-b border-line/60 ${r.deckId === 'all' ? 'font-semibold' : ''}`}>
              <td className="py-2 pr-3 text-ink">
                <span className="inline-flex items-center gap-2">
                  {r.deckId !== 'all' && <span className="size-2 rounded-full" style={{ background: deckColor(r.deckId) }} />}
                  {name(r.deckId)}
                </span>
              </td>
              <td className="py-2 pr-3 text-right text-ink-2">{formatInt(r.cards)}</td>
              <td className="py-2 pr-3 text-right text-ink">{formatPct(r.avgRetrievability)}</td>
              <td className="py-2 pr-3 text-right text-ink-2">{days(r.medianStability)}</td>
              <td className="py-2 pr-3 text-right text-ink-2">{formatPct(r.avgDifficulty, 0)}</td>
              <td className="py-2 pr-3 text-right text-ink-2">{formatInt(r.belowTarget)}</td>
              <td className="py-2 pr-3 text-right text-ink-2">{formatInt(r.atRisk)}</td>
              <td className="py-2 text-right text-ink-2">{formatInt(r.overdue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function FsrsAnalytics({ fsrs, decks: allDecks, todayKey }: Props) {
  const decks = allDecks.filter((d) => fsrs.presets.some((p) => p.deckId === d.id))
  const deckIds = decks.map((d) => d.id)
  const now = useMemo(() => cardsNow(fsrs, todayKey), [fsrs, todayKey])
  const summaries = [...deckIds.map((id) => memorySummary(now, id)), memorySummary(now, 'all')]
  const all = summaries[summaries.length - 1]
  const retention = retentionComparison(fsrs.calibration, 'all')
  const perDeckRetention = deckIds.map((id) => retentionComparison(fsrs.calibration, id))
  const trend = monthlyTrend(fsrs.calibration)
  const curve = calibrationCurve(fsrs.calibrationBins)
  const target = fsrs.presets[0]?.desiredRetention ?? 0.9
  const sameTarget = fsrs.presets.every((p) => Math.abs(p.desiredRetention - target) < 0.001)
  const defaultParams = fsrs.presets.every((p) => p.paramsSource === 'default')
  const firstMonth = trend[0]?.month
  const missing = Object.values(fsrs.missingState).reduce((a, n) => a + n, 0)
  const invalidDue = Object.values(fsrs.invalidDue).reduce((a, n) => a + n, 0)
  const unmatched = fsrs.validation.cards - fsrs.validation.stabilityMatched

  const stability = histogram(now, deckIds, STABILITY_BINS, (c) => c.stability)
  const difficulty = histogram(now, deckIds, DIFFICULTY_BINS, (c) => difficultyPercent(c.difficulty))
  const recall = histogram(now, deckIds, RETRIEVABILITY_BINS, (c) => c.r)

  const legend = (
    <div className="flex flex-wrap items-center gap-3">
      {decks.map((d) => (
        <LegendItem key={d.id} color={deckColor(d.id)} label={d.name} />
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      <Disclosure title="New to FSRS? What these words mean" subtitle="Stability, difficulty, recall probability and desired retention in one sentence each">
        <dl className="grid gap-3 pt-2 sm:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="rounded-2xl bg-surface p-4">
              <dt className="font-extrabold text-ink">
                {g.term} <span className="text-xs font-semibold text-muted">· {g.technical}</span>
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink-2">{g.plain}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>

      <Panel
        title="How well do I remember my cards right now?"
        eyebrow="Memory today"
        subtitle={`Current state of ${formatInt(all.cards)} studied cards · FSRS-6 with ${defaultParams ? 'default' : 'optimised'} parameters${fsrs.ankiVersion ? ` · Anki ${fsrs.ankiVersion}` : ''}`}
        actions={<SourceBadge kind="measured" />}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Chance you’d recall a card today"
            value={formatPct(all.avgRetrievability)}
            sub={`average recall probability across ${formatInt(all.cards)} cards`}
            tip="Mean current retrievability: the FSRS forgetting curve evaluated at today, using each card’s stability and days since its last review."
          />
          <Metric
            label="Actually remembered vs FSRS expected"
            value={`${formatPct(retention.actual)} vs ${formatPct(retention.predicted)}`}
            sub={`${formatInt(retention.reviews)} review-card reviews${firstMonth ? ` since ${firstMonth}` : ''} · target ${sameTarget ? formatPct(target, 0) : 'varies'}`}
            tip="Actual: share of reviews of graduated cards not answered Again. Predicted: FSRS’s recall probability just before each of those reviews, reconstructed by replaying your review log (the same way Anki computes memory states)."
          />
          <Metric
            label="Cards at risk of being forgotten"
            value={formatInt(all.atRisk)}
            tone={all.atRisk > 0 ? 'warning' : undefined}
            sub={`${formatInt(all.belowTarget)} below target · ${formatInt(all.overdue)} overdue`}
            tip={`Recall probability more than ${RISK_MARGIN * 100} points below the desired retention. Reviewing overdue cards soon lowers this.`}
          />
          <Metric
            label="Typical memory strength"
            value={days(all.medianStability)}
            sub={`median stability · avg difficulty ${formatPct(all.avgDifficulty, 0)}`}
            tip="Median stability: days for recall probability to drop to 90%. Half your cards are more stable than this."
          />
        </div>

        {(missing > 0 || invalidDue > 0) && (
          <div className="mt-4 space-y-2">
            {missing > 0 && (
              <Notice tone="warning">
                {formatInt(missing)} studied {missing === 1 ? 'card has' : 'cards have'} no FSRS memory state yet (for
                example, not reviewed since FSRS was turned on) and {missing === 1 ? 'is' : 'are'} left out of these numbers
                and the forecast.
              </Notice>
            )}
            {invalidDue > 0 && (
              <Notice tone="warning">
                {formatInt(invalidDue)} studied {invalidDue === 1 ? 'card has' : 'cards have'} a due date this page can’t read
                and {invalidDue === 1 ? 'is' : 'are'} left out of these numbers and the forecast.
              </Notice>
            )}
          </div>
        )}

        <Disclosure title="Break it down by deck" subtitle="Recall, stability, difficulty and risk for each deck" className="mt-5">
          <SummaryTable rows={summaries} decks={decks} />
        </Disclosure>
      </Panel>

      <Panel
        title="How are my memories spread out?"
        eyebrow="Distributions"
        subtitle="How many cards sit at each level of stability, difficulty and recall probability."
        actions={legend}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <DistributionChart
            title="Memory strength"
            technical="Stability"
            tip="Memory stability from Anki’s stored FSRS state: days until recall probability falls to 90%. More cards to the right means longer-lasting memories."
            rows={stability}
            decks={decks}
          />
          <DistributionChart
            title="How hard cards are"
            technical="Difficulty"
            tip="FSRS difficulty (shown 0–100% like Anki). It drives how quickly stability grows; it is not the SM-2 ease factor."
            rows={difficulty}
            decks={decks}
          />
          <DistributionChart
            title="Chance of recall today"
            technical="Retrievability"
            tip="Current retrievability per card. Cards are scheduled when it reaches your desired retention, so most sit just above it."
            rows={recall}
            decks={decks}
          />
        </div>
      </Panel>

      <Panel
        title="Is FSRS predicting my memory well?"
        eyebrow="Retention and calibration"
        subtitle="What you actually remembered, compared with what FSRS expected and your target."
        actions={<SourceBadge kind="measured" />}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-surface-2 p-4">
            <h3 className="font-extrabold text-ink">
              Remembered: actual vs predicted vs target
              <InfoTip label="About this table">
                Young = the card’s previous interval was under 21 days; mature (known well) = 21 days or more (Anki’s
                definition). Only reviews of graduated cards count, as in Anki’s True Retention table.
              </InfoTip>
            </h3>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full min-w-[420px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 font-bold">Deck · cards</th>
                    <th className="py-2 text-right font-bold">Reviews</th>
                    <th className="py-2 text-right font-bold">Actual</th>
                    <th className="py-2 text-right font-bold">Predicted</th>
                    <th className="py-2 text-right font-bold">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {perDeckRetention.flatMap((r) => {
                    const deck = decks.find((d) => d.id === r.deckId)
                    const preset = fsrs.presets.find((p) => p.deckId === r.deckId)
                    return (['young', 'mature'] as const).map((k) => (
                      <tr key={`${r.deckId}-${k}`} className="border-b border-line/60 last:border-0">
                        <td className="py-2 text-ink-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: deckColor(r.deckId) }} />
                            {deck?.name} · {k === 'young' ? 'young' : 'mature'}
                          </span>
                        </td>
                        <td className="py-2 text-right text-ink-2">{formatInt(r[k].reviews)}</td>
                        <td className="py-2 text-right font-bold text-ink">{r[k].reviews ? formatPct(r[k].actual) : '—'}</td>
                        <td className="py-2 text-right text-ink-2">{r[k].reviews ? formatPct(r[k].predicted) : '—'}</td>
                        <td className="py-2 text-right text-ink-2">{formatPct(preset?.desiredRetention ?? 0.9, 0)}</td>
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
            {trend.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                By month:{' '}
                {trend.map((t) => `${t.month} ${formatPct(t.actual)} actual vs ${formatPct(t.predicted)} predicted (${formatInt(t.reviews)})`).join(' · ')}
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-surface-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-extrabold text-ink">
                Calibration
                <InfoTip label="About calibration">
                  Reviews grouped by FSRS’s predicted recall probability. If FSRS were perfectly calibrated for you, the
                  actual line would sit on the predicted one. Dotted line: your target.
                </InfoTip>
              </h3>
              <div className="flex gap-3">
                <LegendItem color={calibrationColors.actual} label="Actually recalled" />
                <LegendItem color={calibrationColors.predicted} label="FSRS predicted" />
              </div>
            </div>
            <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid vertical={false} stroke={chart.grid} />
                  <XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 10 }} axisLine={{ stroke: chart.axis }} tickLine={false} />
                  <YAxis
                    domain={[0.6, 1]}
                    tickFormatter={(v: number) => formatPct(v, 0)}
                    tick={{ fill: chart.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine y={target} stroke={chart.muted} strokeDasharray="2 4" />
                  <Tooltip
                    cursor={{ stroke: chart.muted, strokeDasharray: '3 3' }}
                    content={({ active, payload, label }) => {
                      const row = curve.find((c) => c.label === label)
                      return (
                        <ChartTooltip
                          active={active}
                          title={`Predicted ${label}`}
                          rows={(payload ?? []).map((p) => ({
                            color: p.dataKey === 'actual' ? calibrationColors.actual : calibrationColors.predicted,
                            label: p.dataKey === 'actual' ? 'Actually recalled' : 'FSRS predicted',
                            value: formatPct(Number(p.value)),
                          }))}
                          footer={row ? { label: 'Reviews', value: formatInt(row.reviews) } : undefined}
                        />
                      )
                    }}
                  />
                  <Line dataKey="predicted" stroke={calibrationColors.predicted} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
                  <Line dataKey="actual" stroke={calibrationColors.actual} strokeWidth={2} dot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {retention.reviews > 0 && retention.actual - retention.predicted > 0.05 && (
          <div className="mt-4">
            <Notice>
              You recall far more often than FSRS expects ({formatPct(retention.actual)} vs {formatPct(retention.predicted)}).
              Either your reviews are easier than the default parameters assume, or you press Hard when you forget. FSRS
              treats Hard as a pass. Optimising the presets’ FSRS parameters in Anki (Deck options → FSRS → Optimise) would
              fit the model to your history.
            </Notice>
          </div>
        )}
      </Panel>

      <Disclosure title="How these numbers are calculated, and their limits" subtitle="Sources, the replay check and what’s excluded">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          <li>
            Current stability and difficulty come straight from Anki’s stored FSRS state for each card. Recall probability
            is the FSRS-6 forgetting curve at today, in whole Anki days (your day starts at the rollover hour).
          </li>
          <li>
            {defaultParams
              ? 'Your presets have no optimised FSRS parameters, so Anki (and this page) uses the FSRS-6 defaults. Anki schedules each review for when predicted recall reaches your desired retention, so the predicted figure sits near that target whatever your real memory is; a large gap to the actual figure means the defaults don’t fit you. Optimising the parameters in Anki (Deck options → FSRS → Optimize) personalises them.'
              : 'Each deck uses its preset’s optimised FSRS parameters.'}
          </li>
          <li>
            Past predictions are rebuilt by replaying your review log through FSRS-6, as Anki does. Check: the replay
            reproduces Anki’s stored difficulty for {fsrs.validation.difficultyMatched}/{fsrs.validation.cards} cards and
            stability (within 1%) for {fsrs.validation.stabilityMatched}/{fsrs.validation.cards}.
            {unmatched > 0 &&
              ` The other ${unmatched} differ slightly from what Anki stored. In this project’s validation against Anki’s own engine, Anki recomputes the replay’s values for such cards, so their stored state most likely came from an older Anki version or another device. Current-state metrics use Anki’s stored values.`}
          </li>
          <li>
            {firstMonth ? `Replayed history starts in ${firstMonth}.` : 'There is no replayed review history yet.'}
            {fsrs.resetCards > 0 &&
              ` ${formatInt(fsrs.resetCards)} ${fsrs.resetCards === 1 ? 'card was' : 'cards were'} reset with “Forget”; Anki ignores reviews before a reset, so earlier history isn’t used.`}{' '}
            Past memory states are never inferred from today’s state.
          </li>
          <li>Suspended cards ({Object.values(fsrs.suspended).reduce((a, n) => a + n, 0)}) and new cards are excluded.</li>
        </ul>
      </Disclosure>
    </div>
  )
}

const GLOSSARY = [
  {
    term: 'Memory strength',
    technical: 'stability',
    plain: 'How many days until your chance of recalling a card drops to 90%. Every successful review makes it grow.',
  },
  {
    term: 'How hard a card is',
    technical: 'difficulty',
    plain: 'From 0% (easy) to 100% (hard). Harder cards gain strength more slowly, so they come back more often.',
  },
  {
    term: 'Chance of recall today',
    technical: 'retrievability',
    plain: 'FSRS’s estimate of the probability you’d remember a card if it were shown right now. It fades between reviews.',
  },
  {
    term: 'Your target',
    technical: 'desired retention',
    plain: 'The recall chance at which Anki schedules a review. Higher targets mean more reviews but less forgetting.',
  },
]
