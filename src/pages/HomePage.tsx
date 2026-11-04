import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ActivityIcon, ArrowRightIcon, BrainIcon, CheckIcon, Flame, LayersIcon, SparkleIcon, TrophyIcon } from '../components/icons'
import { AnswerBar } from '../components/AnswerBar'
import { Badges } from '../components/Badges'
import { JourneyMap } from '../components/JourneyMap'
import { GardenLegend, GardenPlot } from '../components/MemoryGarden'
import { Mascot } from '../components/Mascot'
import { Quests } from '../components/Quests'
import { StatCard } from '../components/StatCard'
import { CountUp, Disclosure, InfoTip, ProgressBar, SourceBadge } from '../components/ui'
import { useDeckColor } from '../data/deckColors'
import { useTodayPlan, type TodayPlan } from '../data/useTodayPlan'
import type { AnkiData } from '../data/types'
import { LOCALE, messages } from '../i18n'
import { earnedBadges } from '../lib/badges'
import { parseDateKey, toDateKey } from '../lib/dates'
import { deckFinish, type DeckFinish } from '../lib/deckPace'
import { changeDelta, formatCopiedAt, formatInt, formatMinutes, formatPct, formatRate, formatShortDate, SAME_RELATIVE } from '../lib/format'
import { shiftWithin } from '../lib/gradingShift'
import {
  copiedOnEarlierDay,
  dayStatus,
  greetingPart,
  homeInsight,
  longestWithRests,
  mascotMood,
  milestones,
  nextStep,
  recentDays,
  staleCopyKey,
  streakWithRests,
  todayWork,
  weekComparison,
  type MascotMood,
  type MilestoneTrack,
  type NextStep,
  type TodayWork,
} from '../lib/progress'
import { cardsNow } from '../lib/fsrsStats'
import { gardenBed, livingBed, plantUnit, type GardenBed } from '../lib/garden'
import { measuredDefaults } from '../lib/measured'
import { limitRange } from '../lib/plan'
import { dailyQuests } from '../lib/quests'
import { routeHref, type Route } from '../lib/route'
import { ankiToday, answerCounts, deckSummaries, lastNDays, retentionSplit, summarize, totalsByDate, type DeckSummary } from '../lib/stats'

const m = messages.home

export function HomePage({ data, fromSnapshot = false }: { data: AnkiData; fromSnapshot?: boolean }) {
  const today = useMemo(() => ankiToday(data), [data])
  const byDate = useMemo(() => totalsByDate(data.daily), [data])
  // An old copy can't see the days since it was made, so every window ends on its day, not today
  const stale = data.source === 'anki' && copiedOnEarlierDay(data, today)
  const copyKey = staleCopyKey(data, today)
  const asOf = useMemo(() => (copyKey ? parseDateKey(copyKey) : today), [copyKey, today])
  const asOfKey = toDateKey(asOf)
  const living = useMemo(() => (data.fsrs ? cardsNow(data.fsrs, asOfKey) : null), [data, asOfKey])
  const week7 = useMemo(() => summarize(data, 7, asOf), [data, asOf])
  const month = useMemo(() => summarize(data, 30, asOf), [data, asOf])
  const week = useMemo(() => weekComparison(byDate, asOf), [byDate, asOf])
  const streak = useMemo(() => streakWithRests(byDate, asOf), [byDate, asOf])
  // The two walks can place rest days differently, and today's streak must never beat the record
  const best = useMemo(() => Math.max(longestWithRests(byDate), streak.days), [byDate, streak])
  const recent = useMemo(() => recentDays(byDate, asOf, 14), [byDate, asOf])
  const tracks = useMemo(() => milestones(data, byDate), [data, byDate])
  const insight = useMemo(() => homeInsight(data, byDate, asOf), [data, byDate, asOf])
  const decksWeek = useMemo(() => deckSummaries(data, 7, asOf), [data, asOf])
  const decksMonth = useMemo(() => deckSummaries(data, 30, asOf), [data, asOf])

  const plan = useTodayPlan(data, today)
  const measured = useMemo(() => measuredDefaults(data, today), [data, today])
  const due = useMemo(() => todayWork(data, today, measured.secondsPerReview), [data, today, measured])

  const [hour] = useState(() => new Date().getHours())
  const hasAny = data.daily.some((s) => s.reviews > 0)
  const status = dayStatus(hasAny, week7.reviewsToday, streak.days, stale)
  const copyLabel = copyKey ? parseDateKey(copyKey).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) : null
  const todayMinutes = (byDate.get(toDateKey(today))?.seconds ?? 0) / 60
  const { reviewCards } = month.retention
  const split = retentionSplit(month.retention)
  const firstOfMonth = lastNDays(30, 0, asOf)[0]
  const shift = shiftWithin(data, firstOfMonth)
  const fsrsOn = !!data.fsrs?.enabled
  const sample = data.source === 'mock'
  const shownDecks = data.decks.filter((d) => d.totalCards + d.suspendedCards > 0)
  const plantsPer = plantUnit(shownDecks, 60)
  const badges = useMemo(() => earnedBadges(data, byDate), [data, byDate])
  const paceNew = plan?.status === 'ready' ? (limitRange(plan.max, plan.altMax)?.[0] || plan.max?.value || null) : null
  const quests = useMemo(() => dailyQuests(data, living ?? [], due, paceNew), [data, living, due, paceNew])

  return (
    <div className="space-y-6">
      <Hero
        greeting={m.greeting[greetingPart(hour)]}
        status={
          status === 'done'
            ? due && !due.stale && due.cards + due.newCards > 0
              ? m.status.doneMoreDue(week7.reviewsToday)
              : m.status.done(week7.reviewsToday)
            : status === 'stale'
              ? m.status.stale(copyLabel)
              : status === 'keep'
                ? m.status.keep(streak.days)
                : status === 'start'
                  ? m.status.start
                  : m.status.empty
        }
        due={due}
        plan={plan}
        next={due ? nextStep(due, paceNew) : null}
        streak={streak.days}
        rests={streak.rests}
        mood={mascotMood(status, !!due && !due.stale && due.cards + due.newCards === 0)}
        best={best}
        streakAsOf={copyLabel}
        sample={sample}
        fromSnapshot={fromSnapshot}
        copied={sample ? null : messages.data.copiedAt(formatCopiedAt(data.generatedAt))}
      />

      <Quests quests={quests} />

      {shownDecks.length > 0 && (
        <section aria-labelledby="home-decks" className="animate-rise">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionHeading id="home-decks" title={m.decks.title} question={m.decks.question} />
            <SourceBadge kind={sample ? 'sample' : 'measured'} />
          </div>
          <GardenLegend unit={plantsPer} living={!!living} />
          <div className={`mt-3 grid gap-4 ${shownDecks.length >= 3 ? 'md:grid-cols-3' : shownDecks.length === 2 ? 'md:grid-cols-2' : ''}`}>
            {shownDecks.map((d) => (
              <DeckCard
                key={d.id}
                week={decksWeek.find((s) => s.deck.id === d.id)!}
                month={decksMonth.find((s) => s.deck.id === d.id)!}
                bed={living ? livingBed(d, living, plantsPer, asOfKey) : gardenBed(d, plantsPer)}
                finish={deckFinish(data, d.id, today)}
                proven={data.fsrs?.proven ? (data.fsrs.proven[d.id] ?? 0) : null}
                sinceChange={shiftWithin(data, firstOfMonth, d.id)?.rate ?? null}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{living ? m.garden.noteLiving : m.garden.note}</p>
        </section>
      )}

      {shownDecks.length > 0 && <JourneyMap decks={shownDecks} sample={sample} />}

      <section aria-labelledby="home-milestones" className="animate-rise rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <SectionHeading id="home-milestones" title={m.milestones.title} question={m.milestones.question} />
        <div className="grid gap-4 md:grid-cols-3">
          {tracks.map((t) => (
            <Milestone key={t.kind} track={t} proven={!!data.fsrs?.proven} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{m.milestones.note}</p>
      </section>

      <Badges earned={badges} sample={sample} />

      <a href={routeHref('wrapped')} className="btn-3d">
        {messages.wrapped.link} <ArrowRightIcon size={18} />
      </a>

      <Disclosure title={m.numbers.title} subtitle={m.numbers.subtitle}>
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label={m.kpi.today}
              icon={<CheckIcon size={18} className="text-good" />}
              tint="var(--color-good-soft)"
              value={stale ? '—' : <CountUp value={week7.reviewsToday} format={formatInt} />}
              hint={stale ? m.kpi.todayStale : m.kpi.todaySub(todayMinutes)}
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
                    {shift && <span className="mt-0.5 block font-semibold text-ink-2">{m.kpi.rememberedShift(formatRate(shift.rate), formatShortDate(shift.date))}</span>}
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
            <RecentActivity rows={recent} endsToday={!stale} sample={sample} className="lg:col-span-2" />
            <InsightCard text={insight?.text ?? m.status.empty} tone={insight?.tone ?? 'neutral'} link={insight?.link} sample={sample} />
          </div>
        </div>
      </Disclosure>
    </div>
  )
}

function Hero({
  greeting,
  status,
  due,
  plan,
  next,
  streak,
  rests,
  mood,
  best,
  streakAsOf,
  sample,
  fromSnapshot,
  copied,
}: {
  fromSnapshot: boolean
  greeting: string
  status: string
  due: TodayWork | null
  plan: TodayPlan | null
  next: NextStep | null
  streak: number
  rests: number
  mood: MascotMood
  best: number
  streakAsOf: string | null
  sample: boolean
  copied: string | null
}) {
  return (
    <section
      className="animate-rise relative overflow-hidden rounded-3xl px-5 py-4 shadow-pop sm:px-6 sm:py-5"
      style={{ backgroundImage: 'linear-gradient(120deg, var(--color-hero-from), var(--color-hero-to))' }}
    >
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex max-w-xl items-center gap-3">
          <Mascot mood={mood} size={64} />
          <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-[1.75rem]">{greeting}</h1>
            {sample && <SourceBadge kind="sample" />}
          </div>
          <p className="mt-1 text-sm font-semibold text-ink-2 sm:text-base">{status}</p>
          {copied && <p className="mt-2 text-xs text-ink-2">{copied}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start rounded-2xl bg-surface px-3.5 py-2.5 shadow-card sm:self-auto">
          <Flame lit={streak > 0} size={30} />
          <div>
            <p className="text-sm leading-tight text-ink">
              <span className="text-xl font-black tabular-nums">
                <CountUp value={streak} format={formatInt} />
              </span>{' '}
              <span className="font-bold text-sun-ink">{m.streak.label}</span>
              <InfoTip label={m.streak.restTipLabel}>{m.streak.restTip}</InfoTip>
            </p>
            {rests > 0 && <p className="text-xs text-muted">{m.streak.rests(rests)}</p>}
            {best > 0 && <p className="text-xs text-muted">{m.streak.best(best)}</p>}
            {streakAsOf && <p className="text-xs text-muted">{m.streak.asOf(streakAsOf)}</p>}
          </div>
        </div>
      </div>
      {next && <NextUp step={next} fromSnapshot={fromSnapshot} />}
      {due && <TodayPlanRow due={due} plan={plan} />}
    </section>
  )
}

/** The one thing to do now, bigger than everything around it. */
function NextUp({ step, fromSnapshot }: { step: NextStep; fromSnapshot: boolean }) {
  const n = m.next
  const title =
    step.kind === 'reviews' ? n.reviews(step.cards, step.minutes) : step.kind === 'new' ? n.fresh(step.cards, step.minutes) : step.kind === 'done' ? n.done : fromSnapshot ? n.snapshotRefresh : n.refresh
  const sub = step.kind === 'done' ? n.doneSub : fromSnapshot ? n.snapshotSub : step.kind === 'refresh' ? n.refreshSub : n.sub
  return (
    <div className="relative mt-4 rounded-2xl bg-surface p-4 shadow-card">
      <p className="text-xs font-extrabold tracking-wide text-brand-strong uppercase">{n.label}</p>
      <p className="mt-0.5 text-xl font-black tracking-tight text-ink sm:text-2xl">{title}</p>
      <p className="mt-0.5 text-sm text-ink-2">{sub}</p>
    </div>
  )
}

function TodayPlanRow({ due, plan }: { due: TodayWork; plan: TodayPlan | null }) {
  const t = m.today
  const left = !due.stale && due.cards + due.newCards > 0
  return (
    <section aria-labelledby="home-today" className="relative mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-today" className="text-sm font-extrabold text-ink">
          {t.title}
        </h2>
        <SourceBadge kind="mixed" />
      </div>
      {due.stale ? (
        <p className="mt-2 rounded-2xl bg-surface/70 p-3 text-sm font-semibold text-ink-2">{t.stale}</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TodayTile label={t.dueLabel} tipLabel={t.dueTipLabel} tip={t.dueTip} value={formatInt(due.cards)} sub={due.heldBack > 0 ? t.dueHeld(due.heldBack) : t.dueSub} />
          <TodayTile label={t.newLabel} tipLabel={t.newTipLabel} tip={t.newTip} value={formatInt(due.newCards)} sub={t.newSub} />
          <TodayTile
            label={t.timeLabel}
            tipLabel={t.timeTipLabel}
            tip={t.timeTip}
            value={left ? `≈ ${formatMinutes(Math.max(1, Math.round(due.minutes)))}` : formatMinutes(0)}
            sub={left ? t.timeSub : t.timeDone}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}
      {plan && <PlanSuggestion plan={plan} />}
      <a href={routeHref('planner')} className="btn-3d mt-3 mb-1 text-sm">
        {t.planLink} <ArrowRightIcon size={16} />
      </a>
    </section>
  )
}

function TodayTile({ label, tipLabel, tip, value, sub, className = '' }: { label: string; tipLabel: string; tip: string; value: string; sub: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface/70 p-3 ${className}`}>
      <p className="text-xs font-bold text-ink-2">
        {label}
        <InfoTip label={tipLabel}>{tip}</InfoTip>
      </p>
      <p className="mt-0.5 text-2xl font-black tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-ink-2">{sub}</p>
    </div>
  )
}

/** The long-term pace, kept apart from today's numbers: it's what fits, not what Anki will show today. */
function PlanSuggestion({ plan }: { plan: TodayPlan }) {
  const t = m.today
  if (plan.status === 'pending') {
    return (
      <p role="status" className="mt-2 text-xs text-ink-2">
        {t.suggestPending}
      </p>
    )
  }
  const { budget, max, altMax, current, finish } = plan
  const range = limitRange(max, altMax)
  const minutes = current ? [...new Set(current.minutes.map((v) => formatInt(v)))].join('–') : ''
  const finishMonth = finish ? parseDateKey(finish).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' }) : null
  // Only when your real pace is the bigger number: otherwise there's no gap to explain
  const ahead = current && max && current.newPerDay > max.value
  return (
    <p className="mt-2 text-xs text-ink-2">
      {!max
        ? t.suggestNone(budget)
        : max.value === 0
          ? t.suggestNoRoom(budget)
          : range
            ? range[0] === 0
              ? t.suggestUpTo(range[1], budget)
              : t.suggestRange(range[0], range[1], budget)
            : max.capped
              ? t.suggestCapped(max.value, budget)
              : t.suggest(max.value, budget)}
      {max && max.value > 0 && finishMonth && ` ${t.suggestFinish(max.value, finishMonth)}`}
      {ahead && ` ${current.pilesUp ? t.suggestCurrentPiles(current.newPerDay) : t.suggestCurrent(current.newPerDay, minutes)}`}
      <InfoTip label={t.suggestTipLabel}>{t.suggestTip(budget)}</InfoTip>
    </p>
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

function RecentActivity({
  rows,
  endsToday,
  sample,
  className = '',
}: {
  rows: { date: string; reviews: number }[]
  endsToday: boolean
  sample: boolean
  className?: string
}) {
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
        // Real pointers only: a tap stays put, and Home moving under it must not clear the day it picked
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPicked(null)}
      >
        {rows.map((r, i) => {
          const isToday = endsToday && i === rows.length - 1
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

function DeckCard({
  week,
  month,
  bed,
  finish,
  proven,
  sinceChange,
}: {
  week: DeckSummary
  month: DeckSummary
  bed: GardenBed
  finish: DeckFinish | null
  proven: number | null
  sinceChange: number | null
}) {
  const deckColor = useDeckColor()
  const { deck } = week
  const color = deckColor(deck.id)
  const started = deck.totalCards ? (deck.youngCards + deck.matureCards) / deck.totalCards : 0
  // Without FSRS data there's no review log to test a long interval against, so it stays one group
  const parts = [
    { label: m.decks.notStarted, value: deck.newCards, opacity: 0.25, tip: null },
    { label: m.decks.learning, value: deck.youngCards, opacity: 0.5, tip: null },
    ...(proven === null
      ? [{ label: m.decks.known, value: deck.matureCards, opacity: 1, tip: m.decks.knownTip }]
      : [
          { label: m.decks.untested, value: deck.matureCards - proven, opacity: 0.75, tip: m.decks.untestedTip },
          { label: m.decks.proven, value: proven, opacity: 1, tip: m.decks.provenTip },
        ]),
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
            {p.tip && <InfoTip label={p.label}>{p.tip}</InfoTip>}
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
          {sinceChange !== null && <dd className="text-xs font-semibold text-ink-2">{m.decks.rememberedShift(formatRate(sinceChange))}</dd>}
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

function Milestone({ track, proven }: { track: MilestoneTrack; proven: boolean }) {
  const s = MILESTONE_STYLE[track.kind]
  const title = track.kind === 'known' && proven ? m.milestones.knownProven : s.title
  const unit = track.kind === 'days' ? (n: number) => `${formatInt(n)} ${n === 1 ? 'day' : 'days'}` : formatInt
  return (
    <article>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-2xl" style={{ background: s.tint, color: s.color }}>
          {s.icon}
        </span>
        <h3 className="min-w-0 flex-1 text-sm font-bold text-muted">{title}</h3>
        <p className="text-xl font-black tracking-tight text-ink tabular-nums">
          <CountUp value={track.current} format={unit} />
        </p>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={track.progress} color={s.color} label={`${title}: progress to next milestone`} />
        <p className="mt-1.5 text-xs text-muted">
          {track.next === null ? m.milestones.maxed : m.milestones.next(unit(track.next - track.current), unit(track.next))}
        </p>
      </div>
    </article>
  )
}
