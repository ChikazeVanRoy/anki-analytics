import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ActivityIcon, ArrowRightIcon, BrainIcon, CheckIcon, LayersIcon, SparkleIcon, TrophyIcon } from '../components/icons'
import { AnswerBar } from '../components/AnswerBar'
import { GardenLegend, GardenPlot } from '../components/MemoryGarden'
import { StatCard } from '../components/StatCard'
import { CountUp, InfoTip, ProgressBar, SourceBadge } from '../components/ui'
import { useWeeklyGoal } from '../app/useWeeklyGoal'
import { useDeckColor } from '../data/deckColors'
import { useTodayPlan, type TodayPlan } from '../data/useTodayPlan'
import type { AnkiData } from '../data/types'
import { LOCALE, messages } from '../i18n'
import { parseDateKey, toDateKey } from '../lib/dates'
import { deckFinish, type DeckFinish } from '../lib/deckPace'
import { changeDelta, formatCopiedAt, formatInt, formatPct, formatRate, SAME_RELATIVE } from '../lib/format'
import {
  dayStatus,
  dueToday,
  greetingPart,
  homeInsight,
  milestones,
  recentDays,
  weekComparison,
  weekGoal,
  type DueToday,
  type MilestoneTrack,
  type WeekGoal,
} from '../lib/progress'
import { gardenBed, plantUnit, type GardenBed } from '../lib/garden'
import { measuredDefaults } from '../lib/measured'
import { routeHref, type Route } from '../lib/route'
import { ankiToday, answerCounts, deckSummaries, retentionSplit, summarize, totalsByDate, type DeckSummary } from '../lib/stats'

const m = messages.home

export function HomePage({ data }: { data: AnkiData }) {
  const today = useMemo(() => ankiToday(data), [data])
  const byDate = useMemo(() => totalsByDate(data.daily), [data])
  const week7 = useMemo(() => summarize(data, 7), [data])
  const month = useMemo(() => summarize(data, 30), [data])
  const week = useMemo(() => weekComparison(byDate, today), [byDate, today])
  const recent = useMemo(() => recentDays(byDate, today, 14), [byDate, today])
  const tracks = useMemo(() => milestones(data, byDate), [data, byDate])
  const insight = useMemo(() => homeInsight(data, byDate, today), [data, byDate, today])
  const decksWeek = useMemo(() => deckSummaries(data, 7), [data])
  const decksMonth = useMemo(() => deckSummaries(data, 30), [data])
  const due = useMemo(() => dueToday(data, today), [data, today])

  const plan = useTodayPlan(data, today)
  const measured = useMemo(() => measuredDefaults(data, today), [data, today])
  const { goal, change: changeGoal } = useWeeklyGoal(measured.studyDaysPerWeek)
  const thisWeek = useMemo(() => weekGoal(byDate, today, goal), [byDate, today, goal])

  const [hour] = useState(() => new Date().getHours())
  const hasAny = data.daily.some((s) => s.reviews > 0)
  const status = dayStatus(hasAny, week7.reviewsToday, thisWeek.met)
  const todayMinutes = (byDate.get(toDateKey(today))?.seconds ?? 0) / 60
  const { reviewCards } = month.retention
  const split = retentionSplit(month.retention)
  const fsrsOn = !!data.fsrs?.enabled
  const sample = data.source === 'mock'
  const shownDecks = data.decks.filter((d) => d.totalCards + d.suspendedCards > 0)
  const plantsPer = plantUnit(shownDecks, 60)

  return (
    <div className="space-y-6">
      <Hero
        greeting={m.greeting[greetingPart(hour)]}
        status={
          status === 'done'
            ? due && !due.stale && due.cards > 0
              ? m.status.doneMoreDue(week7.reviewsToday)
              : m.status.done(week7.reviewsToday)
            : status === 'met'
              ? m.status.met
              : status === 'keep'
                ? m.status.keep(thisWeek.done, thisWeek.goal)
                : m.status.empty
        }
        due={due}
        plan={plan}
        week={thisWeek}
        onChangeGoal={changeGoal}
        sample={sample}
        copied={sample ? null : messages.data.copiedAt(formatCopiedAt(data.generatedAt))}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={m.kpi.today}
          icon={<CheckIcon size={18} className="text-good" />}
          tint="var(--color-good-soft)"
          value={<CountUp value={week7.reviewsToday} format={formatInt} />}
          hint={m.kpi.todaySub(todayMinutes)}
        />
        <StatCard
          label={m.kpi.week}
          icon={<ActivityIcon size={18} className="text-brand" />}
          tint="var(--color-brand-soft)"
          value={<CountUp value={week.thisWeek} format={formatInt} />}
          delta={
            week.change !== null
              ? changeDelta(week.change, {
                  tolerance: SAME_RELATIVE,
                  same: m.kpi.weekSame,
                  text: (size, up) => m.kpi.weekVs(formatPct(size, 0), up),
                })
              : undefined
          }
          hint={week.change === null ? m.kpi.weekNoPrev : undefined}
          style={{ animationDelay: '60ms' }}
        />
        <StatCard
          label={m.kpi.remembered}
          tip={fsrsOn ? `${m.kpi.rememberedTip} ${m.kpi.rememberedTipAdvanced}` : m.kpi.rememberedTip}
          icon={<BrainIcon size={18} className="text-sun-ink" />}
          tint="var(--color-sun-soft)"
          value={reviewCards.reviews > 0 ? <CountUp value={reviewCards.rate} format={formatRate} /> : '—'}
          visual={reviewCards.reviews > 0 && <AnswerBar {...answerCounts(reviewCards)} />}
          hint={
            reviewCards.reviews === 0 ? (
              m.kpi.rememberedNone
            ) : (
              <>
                {m.kpi.rememberedSub(reviewCards.reviews)}
                <span className="mt-0.5 block">
                  {split.matureThin
                    ? m.kpi.rememberedYoungNote(split.mature.reviews)
                    : m.kpi.rememberedSplit(split.young.reviews > 0 ? formatRate(split.young.rate) : '—', formatRate(split.mature.rate))}
                </span>
              </>
            )
          }
          style={{ animationDelay: '120ms' }}
        />
        <StatCard
          label={m.kpi.active}
          icon={<LayersIcon size={18} className="text-ink-2" />}
          value={
            <>
              <CountUp value={month.activeDays} format={formatInt} />
              <span className="text-lg font-bold text-muted"> / 30</span>
            </>
          }
          hint={m.kpi.activeSub}
          style={{ animationDelay: '180ms' }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <RecentActivity rows={recent} sample={sample} className="lg:col-span-2" />
        <InsightCard text={insight?.text ?? m.status.empty} tone={insight?.tone ?? 'neutral'} link={insight?.link} sample={sample} />
      </div>

      {shownDecks.length > 0 && (
        <section aria-labelledby="home-decks" className="animate-rise">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionHeading id="home-decks" title={m.decks.title} question={m.decks.question} />
            <SourceBadge kind={sample ? 'sample' : 'measured'} />
          </div>
          <GardenLegend unit={plantsPer} />
          <div className={`mt-3 grid gap-4 ${shownDecks.length >= 3 ? 'md:grid-cols-3' : shownDecks.length === 2 ? 'md:grid-cols-2' : ''}`}>
            {shownDecks.map((d) => (
              <DeckCard
                key={d.id}
                week={decksWeek.find((s) => s.deck.id === d.id)!}
                month={decksMonth.find((s) => s.deck.id === d.id)!}
                bed={gardenBed(d, plantsPer)}
                finish={deckFinish(data, d.id, today)}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{m.garden.note}</p>
        </section>
      )}

      <section aria-labelledby="home-milestones" className="animate-rise rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <SectionHeading id="home-milestones" title={m.milestones.title} question={m.milestones.question} />
        <div className="grid gap-4 md:grid-cols-3">
          {tracks.map((t) => (
            <Milestone key={t.kind} track={t} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{m.milestones.note}</p>
      </section>
    </div>
  )
}

function Hero({
  greeting,
  status,
  due,
  plan,
  week,
  onChangeGoal,
  sample,
  copied,
}: {
  greeting: string
  status: string
  due: DueToday | null
  plan: TodayPlan | null
  week: WeekGoal
  onChangeGoal: (by: number) => void
  sample: boolean
  copied: string | null
}) {
  return (
    <section
      className="animate-rise relative overflow-hidden rounded-3xl bg-brand-soft px-5 py-4 sm:px-6 sm:py-5"
      style={{
        backgroundImage:
          'radial-gradient(circle at 92% 10%, var(--color-sun-soft), transparent 42%), radial-gradient(circle at 0% 100%, color-mix(in oklab, var(--color-brand) 14%, transparent), transparent 45%)',
      }}
    >
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-[1.75rem]">{greeting}</h1>
            {sample && <SourceBadge kind="sample" />}
          </div>
          <p className="mt-1 text-sm font-semibold text-ink-2 sm:text-base">{status}</p>
          {copied && <p className="mt-2 text-xs text-ink-2">{copied}</p>}
        </div>
        <WeekGoalCard week={week} onChange={onChangeGoal} />
      </div>
      {due && <TodayPlanRow due={due} plan={plan} />}
    </section>
  )
}

function TodayPlanRow({ due, plan }: { due: DueToday; plan: TodayPlan | null }) {
  const t = m.today
  const ready = plan?.status === 'ready' ? plan : null
  return (
    <section aria-labelledby="home-today" className="relative mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-today" className="text-sm font-extrabold text-ink">
          {t.title}
        </h2>
        <SourceBadge kind="mixed" />
      </div>
      <div className={`mt-2 grid gap-3 ${plan ? 'grid-cols-2' : ''}`}>
        <div className="rounded-2xl bg-surface/70 p-3">
          <p className="text-xs font-bold text-ink-2">
            {t.dueLabel}
            <InfoTip label={t.dueTipLabel}>{t.dueTip}</InfoTip>
          </p>
          <p className="mt-0.5 text-2xl font-black tracking-tight text-ink tabular-nums">{due.stale ? '—' : formatInt(due.cards)}</p>
          <p className="mt-0.5 text-xs text-ink-2">{due.stale ? t.dueStale : due.cards > 0 ? t.dueSome(due.minutes) : t.dueNone}</p>
        </div>
        {plan && (
          <div className="rounded-2xl bg-surface/70 p-3">
            <p className="text-xs font-bold text-ink-2">
              {t.newLabel}
              {ready && <InfoTip label={t.newTipLabel}>{t.newTip(ready.budget)}</InfoTip>}
            </p>
            {ready ? (
              <>
                <p className="mt-0.5 text-2xl font-black tracking-tight text-ink tabular-nums">
                  {!ready.max ? '0' : ready.max.capped ? t.newCapped(ready.max.value) : `≈ ${ready.max.value}`}
                </p>
                <p className="mt-0.5 text-xs text-ink-2">{ready.max ? t.newFits(ready.budget) : t.newNone(ready.budget)}</p>
              </>
            ) : (
              <>
                <div className="skeleton mt-1.5 h-6 w-14" aria-hidden />
                <p role="status" className="mt-1 text-xs text-ink-2">
                  {t.newPending}
                </p>
              </>
            )}
          </div>
        )}
      </div>
      <a href={routeHref('planner')} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-brand-strong hover:underline">
        {t.planLink} <ArrowRightIcon size={16} />
      </a>
    </section>
  )
}

function WeekGoalCard({ week, onChange }: { week: WeekGoal; onChange: (by: number) => void }) {
  const g = m.goal
  const hint = week.met ? g.met : week.reachable ? g.left(week.goal - week.done) : g.nextWeek
  const stepClass = 'grid size-8 place-items-center rounded-xl bg-surface-2 text-base leading-none font-black text-ink-2 hover:text-ink disabled:opacity-40'
  return (
    <section aria-label={g.label} className="shrink-0 rounded-2xl bg-surface px-3.5 py-3 shadow-card">
      <p className="text-sm text-ink">
        <span className="text-xl font-black tabular-nums">{g.progress(week.done, week.goal)}</span> <span className="font-bold text-ink-2">{g.unit}</span>
        <InfoTip label={`About ${g.label}`}>{g.tip}</InfoTip>
      </p>
      <ol className="mt-2 flex justify-between gap-1.5">
        {week.days.map((d) => {
          const date = parseDateKey(d.date)
          return (
            <li
              key={d.date}
              className={`grid size-7 place-items-center rounded-full text-[11px] font-bold ${
                d.studied ? 'bg-brand text-brand-ink' : d.future ? 'border border-dashed border-line text-muted' : 'bg-surface-2 text-muted'
              } ${d.isToday ? 'ring-2 ring-sun ring-offset-2 ring-offset-surface' : ''}`}
            >
              <span className="sr-only">{g.day(date.toLocaleDateString(LOCALE, { weekday: 'long' }), d.studied)}</span>
              <span aria-hidden>{d.studied ? <CheckIcon size={14} /> : date.toLocaleDateString(LOCALE, { weekday: 'narrow' })}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-xs text-muted">
        {hint}
        {week.weeksInRow > 1 && ` · ${g.inARow(week.weeksInRow)}`}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-ink-2">
        <span className="mr-auto">{g.change(week.goal)}</span>
        <button type="button" aria-label={g.fewer} disabled={week.goal <= 1} onClick={() => onChange(-1)} className={stepClass}>
          −
        </button>
        <button type="button" aria-label={g.more} disabled={week.goal >= 7} onClick={() => onChange(1)} className={stepClass}>
          +
        </button>
      </div>
    </section>
  )
}

function SectionHeading({ id, title, question }: { id: string; title: string; question: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
      <h2 id={id} className="text-xl font-black tracking-tight text-ink">
        {title}
      </h2>
      <p className="text-sm text-muted">{question}</p>
    </div>
  )
}

function RecentActivity({ rows, sample, className = '' }: { rows: { date: string; reviews: number }[]; sample: boolean; className?: string }) {
  // One tab stop for the whole chart: hover, a tap or the arrow keys pick the day shown in the line above the
  // bars. A single fixed line can't run off the side of a phone, and only ever shows one day.
  const [picked, setPicked] = useState<number | null>(null)
  const onBarKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return setPicked(null)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    setPicked((p) => Math.max(0, Math.min(rows.length - 1, (p ?? rows.length) + step)))
  }
  const max = Math.max(1, ...rows.map((r) => r.reviews))
  const total = rows.reduce((n, r) => n + r.reviews, 0)
  const active = rows.filter((r) => r.reviews > 0).length
  const fmtDay = (key: string) => parseDateKey(key).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <section aria-labelledby="home-recent" className={`animate-rise rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted uppercase">{m.recent.title}</p>
          <h2 id="home-recent" className="text-lg font-extrabold tracking-tight text-ink">
            {m.recent.question}
          </h2>
        </div>
        <SourceBadge kind={sample ? 'sample' : 'measured'} />
      </div>
      <p className="mt-1 text-sm text-muted">{m.recent.summary(total, active)}</p>
      <p data-testid="day-readout" aria-hidden className="mt-2 h-5 text-sm font-bold text-ink">
        {picked !== null && m.recent.bar(fmtDay(rows[picked].date), rows[picked].reviews)}
      </p>
      <ol
        className="mt-2 flex h-36 items-end gap-1 sm:gap-2"
        aria-label={`${m.recent.summary(total, active)}. ${m.recent.barsHint}`}
        tabIndex={0}
        onKeyDown={onBarKey}
        onFocus={() => setPicked((p) => p ?? rows.length - 1)}
        onBlur={() => setPicked(null)}
        onMouseLeave={() => setPicked(null)}
      >
        {rows.map((r, i) => {
          const isToday = i === rows.length - 1
          const label = m.recent.bar(fmtDay(r.date), r.reviews)
          return (
            <li
              key={r.date}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setPicked(i)}
              onClick={() => setPicked(i)}
            >
              <span className="sr-only">{label}</span>
              <div
                className={`w-full max-w-9 origin-bottom rounded-t-lg rounded-b-sm transition-all group-hover:brightness-110 ${
                  r.reviews > 0 ? '' : 'bg-surface-3'
                } ${isToday ? 'ring-2 ring-sun ring-offset-2 ring-offset-surface' : ''} ${picked === i && !isToday ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : ''}`}
                style={{
                  height: r.reviews > 0 ? `${Math.max(8, (r.reviews / max) * 100)}%` : 6,
                  background: r.reviews > 0 ? 'var(--color-brand)' : undefined,
                  animation: `var(--animate-rise)`,
                  animationDelay: `${i * 25}ms`,
                }}
              />
              <span className={`mt-2 text-[11px] font-bold ${isToday ? 'text-sun-ink' : 'text-muted'}`} aria-hidden>
                {isToday ? m.recent.today : parseDateKey(r.date).toLocaleDateString(LOCALE, { weekday: 'narrow' })}
              </span>
            </li>
          )
        })}
      </ol>
      <a href={routeHref('activity')} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-strong hover:underline">
        {m.recent.more} <ArrowRightIcon size={16} />
      </a>
    </section>
  )
}

function InsightCard({ text, tone, link, sample }: { text: string; tone: 'good' | 'neutral'; link?: Route; sample: boolean }) {
  return (
    <section
      aria-labelledby="home-insight"
      className="animate-rise relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6"
      style={{ animationDelay: '80ms' }}
    >
      <div className={`grid size-11 place-items-center rounded-2xl ${tone === 'good' ? 'bg-good-soft text-good' : 'bg-sun-soft text-sun-ink'}`}>
        <SparkleIcon size={22} />
      </div>
      <h2 id="home-insight" className="mt-4 text-xs font-bold tracking-wide text-muted uppercase">
        {m.insight.title}
      </h2>
      <p className="mt-1 text-lg leading-snug font-extrabold text-ink">{text}</p>
      <p className="mt-3 text-xs text-muted">{sample ? m.insight.basisSample : m.insight.basis}</p>
      {link && (
        // The ::after covers the whole card, so a tap anywhere on it follows the link
        <a
          href={routeHref(link)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand-strong after:absolute after:inset-0 after:content-[''] hover:underline"
        >
          {m.insight.more} <ArrowRightIcon size={16} />
        </a>
      )}
    </section>
  )
}

function DeckCard({ week, month, bed, finish }: { week: DeckSummary; month: DeckSummary; bed: GardenBed; finish: DeckFinish | null }) {
  const deckColor = useDeckColor()
  const { deck } = week
  const color = deckColor(deck.id)
  const started = deck.totalCards ? (deck.youngCards + deck.matureCards) / deck.totalCards : 0
  const parts = [
    { label: m.decks.notStarted, value: deck.newCards, opacity: 0.25 },
    { label: m.decks.learning, value: deck.youngCards, opacity: 0.6 },
    { label: m.decks.known, value: deck.matureCards, opacity: 1 },
  ]
  const rc = month.retention.reviewCards
  const rcThin = retentionSplit(month.retention).matureThin
  return (
    <article className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl text-base font-black text-white" style={{ background: color }} aria-hidden>
          {deck.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-extrabold text-ink">{deck.name}</h3>
          <p className="text-xs text-muted">
            {m.decks.cards(deck.totalCards)}
            {deck.suspendedCards > 0 && ` · ${m.decks.suspended(deck.suspendedCards)}`} · {m.decks.started(formatPct(started, started < 0.1 ? 1 : 0))}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <GardenPlot deck={deck} bed={bed} color={color} />
      </div>

      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {parts.map((p) => (
          <div key={p.label} className="animate-grow origin-left" style={{ flexGrow: p.value, background: color, opacity: p.opacity }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: color, opacity: p.opacity }} aria-hidden />
            {p.label} <span className="font-bold text-ink tabular-nums">{formatInt(p.value)}</span>
            {p.label === m.decks.known && <InfoTip label={m.decks.known}>{m.decks.knownTip}</InfoTip>}
          </li>
        ))}
      </ul>

      {finish && <FinishLine finish={finish} />}

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
          <dt className="text-xs font-bold text-muted">{m.decks.week}</dt>
          <dd className="text-xl font-extrabold text-ink tabular-nums">{formatInt(week.reviews)}</dd>
        </div>
        <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
          <dt className="text-xs font-bold text-muted">{m.decks.remembered}</dt>
          <dd className="text-xl font-extrabold text-ink tabular-nums">{rc.reviews > 0 ? formatRate(rc.rate) : '—'}</dd>
          {rcThin && <dd className="text-xs text-muted">{m.decks.rememberedYoung}</dd>}
        </div>
      </dl>
    </article>
  )
}

function FinishLine({ finish }: { finish: DeckFinish }) {
  if (finish.kind !== 'date') {
    return <p className="mt-3 text-sm text-ink-2">{finish.kind === 'done' ? m.decks.finishDone : m.decks.finishThin}</p>
  }
  const month = parseDateKey(finish.date).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' })
  const pace = finish.perDay < 10 ? finish.perDay.toFixed(1) : formatInt(finish.perDay)
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-line p-3">
      <SourceBadge kind="projection" />
      <p className="mt-1.5 text-sm font-semibold text-ink-2">
        {m.decks.finish(pace, month)}
        <InfoTip label={m.decks.finishTipLabel}>{m.decks.finishTip(finish.introduced, finish.days, finish.remaining)}</InfoTip>
      </p>
    </div>
  )
}

const MILESTONE_STYLE: Record<MilestoneTrack['kind'], { icon: ReactNode; color: string; tint: string; title: string }> = {
  reviews: { icon: <TrophyIcon size={20} />, color: 'var(--color-brand)', tint: 'var(--color-brand-soft)', title: m.milestones.reviews },
  days: { icon: <ActivityIcon size={20} />, color: 'var(--color-sun-ink)', tint: 'var(--color-sun-soft)', title: m.milestones.days },
  known: { icon: <BrainIcon size={20} />, color: 'var(--color-good)', tint: 'var(--color-good-soft)', title: m.milestones.known },
}

function Milestone({ track }: { track: MilestoneTrack }) {
  const s = MILESTONE_STYLE[track.kind]
  const unit = track.kind === 'days' ? (n: number) => `${formatInt(n)} ${n === 1 ? 'day' : 'days'}` : formatInt
  return (
    <article>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-2xl" style={{ background: s.tint, color: s.color }}>
          {s.icon}
        </span>
        <h3 className="min-w-0 flex-1 text-sm font-bold text-muted">{s.title}</h3>
        <p className="text-xl font-black tracking-tight text-ink tabular-nums">
          <CountUp value={track.current} format={unit} />
        </p>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={track.progress} color={s.color} label={`${s.title}: progress to next milestone`} />
        <p className="mt-1.5 text-xs text-muted">
          {track.next === null ? m.milestones.maxed : m.milestones.next(unit(track.next - track.current), unit(track.next))}
        </p>
      </div>
    </article>
  )
}
