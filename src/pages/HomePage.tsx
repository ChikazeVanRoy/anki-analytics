import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ActivityIcon, AdvancedIcon, ArrowRightIcon, BrainIcon, CheckIcon, Flame, LayersIcon, PlannerIcon, SparkleIcon, TrophyIcon } from '../components/icons'
import { MemoryGarden } from '../components/MemoryGarden'
import { StatCard } from '../components/StatCard'
import { CountUp, InfoTip, ProgressBar, SourceBadge } from '../components/ui'
import { useDeckColor } from '../data/deckColors'
import type { AnkiData } from '../data/types'
import { LOCALE, messages } from '../i18n'
import { parseDateKey, toDateKey } from '../lib/dates'
import { changeDelta, formatCopiedAt, formatInt, formatPct, formatRate, SAME_RELATIVE } from '../lib/format'
import {
  dayStatus,
  dueToday,
  greetingPart,
  homeInsight,
  longestStreak,
  milestones,
  recentDays,
  weekComparison,
  type MilestoneTrack,
} from '../lib/progress'
import { routeHref, type Route } from '../lib/route'
import { ankiToday, deckSummaries, retentionSplit, summarize, totalsByDate, type DeckSummary } from '../lib/stats'

const m = messages.home

export function HomePage({ data }: { data: AnkiData }) {
  const today = useMemo(() => ankiToday(data), [data])
  const byDate = useMemo(() => totalsByDate(data.daily), [data])
  const week7 = useMemo(() => summarize(data, 7), [data])
  const month = useMemo(() => summarize(data, 30), [data])
  const week = useMemo(() => weekComparison(byDate, today), [byDate, today])
  const best = useMemo(() => longestStreak(byDate), [byDate])
  const recent = useMemo(() => recentDays(byDate, today, 14), [byDate, today])
  const tracks = useMemo(() => milestones(data, byDate), [data, byDate])
  const insight = useMemo(() => homeInsight(data, byDate, today), [data, byDate, today])
  const decksWeek = useMemo(() => deckSummaries(data, 7), [data])
  const decksMonth = useMemo(() => deckSummaries(data, 30), [data])
  const due = useMemo(() => dueToday(data, today), [data, today])

  const [hour] = useState(() => new Date().getHours())
  const hasAny = data.daily.some((s) => s.reviews > 0)
  const status = dayStatus(hasAny, week7.reviewsToday, week7.streak)
  const todayMinutes = (byDate.get(toDateKey(today))?.seconds ?? 0) / 60
  const { reviewCards } = month.retention
  const split = retentionSplit(month.retention)
  const fsrsOn = !!data.fsrs?.enabled
  const sample = data.source === 'mock'
  const shownDecks = data.decks.filter((d) => d.totalCards + d.suspendedCards > 0)

  return (
    <div className="space-y-6">
      <Hero
        greeting={m.greeting[greetingPart(hour)]}
        status={
          status === 'done'
            ? due && !due.stale && due.cards > 0
              ? m.status.doneMoreDue(week7.reviewsToday)
              : m.status.done(week7.reviewsToday)
            : status === 'keep'
              ? m.status.keep(week7.streak)
              : status === 'start'
                ? m.status.start
                : m.status.empty
        }
        due={due && (due.stale ? m.due.stale : due.cards > 0 ? m.due.some(due.cards, due.minutes) : m.due.none)}
        streak={week7.streak}
        best={best}
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
          hint={
            reviewCards.reviews === 0 ? (
              m.kpi.rememberedNone
            ) : (
              <>
                {m.kpi.rememberedSub(reviewCards.reviews)}
                <span className="mt-0.5 block">{m.kpi.rememberedAnswers(reviewCards.reviews - reviewCards.passed, reviewCards.hard)}</span>
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

      {shownDecks.length > 0 && <MemoryGarden decks={shownDecks} sample={sample} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <RecentActivity rows={recent} sample={sample} className="lg:col-span-2" />
        <InsightCard text={insight?.text ?? m.status.empty} tone={insight?.tone ?? 'neutral'} sample={sample} />
      </div>

      {shownDecks.length > 0 && (
        <section aria-labelledby="home-decks" className="animate-rise">
          <SectionHeading id="home-decks" title={m.decks.title} question={m.decks.question} />
          <div className={`grid gap-4 ${shownDecks.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {shownDecks.map((d) => (
              <DeckCard
                key={d.id}
                week={decksWeek.find((s) => s.deck.id === d.id)!}
                month={decksMonth.find((s) => s.deck.id === d.id)!}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="home-milestones" className="animate-rise">
        <SectionHeading id="home-milestones" title={m.milestones.title} question={m.milestones.question} />
        <div className="grid gap-4 md:grid-cols-3">
          {tracks.map((t) => (
            <MilestoneCard key={t.kind} track={t} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{m.milestones.note}</p>
      </section>

      <section aria-label="Explore" className="grid gap-4 md:grid-cols-3">
        <ExploreCard route="activity" icon={<ActivityIcon />} title={m.explore.activity} sub={m.explore.activitySub} />
        <ExploreCard
          route="planner"
          icon={<PlannerIcon />}
          title={m.explore.planner}
          sub={fsrsOn ? m.explore.plannerSub : messages.fsrsMissing.planner}
        />
        <ExploreCard
          route="advanced"
          icon={<AdvancedIcon />}
          title={m.explore.advanced}
          sub={fsrsOn ? m.explore.advancedSub : messages.fsrsMissing.advanced}
        />
      </section>
    </div>
  )
}

function Hero({
  greeting,
  status,
  due,
  streak,
  best,
  sample,
  copied,
}: {
  greeting: string
  status: string
  due: string | null
  streak: number
  best: number
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
          {due && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-surface/70 px-2.5 py-1 text-sm font-bold text-ink">
              {due}
              <InfoTip label={m.due.tipLabel}>{m.due.tip}</InfoTip>
            </p>
          )}
          {copied && <p className="mt-2 text-xs text-ink-2">{copied}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start rounded-2xl bg-surface px-3.5 py-2.5 shadow-card sm:self-auto">
          <Flame lit={streak > 0} size={30} />
          <div>
            <p className="text-sm leading-tight text-ink">
              <span className="text-xl font-black tabular-nums">
                <CountUp value={streak} format={formatInt} />
              </span>{' '}
              <span className="font-bold text-sun-ink">{m.streak.label}</span>
            </p>
            {best > 0 && <p className="text-xs text-muted">{m.streak.best(best)}</p>}
          </div>
        </div>
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
        {messages.home.explore.activity} <ArrowRightIcon size={16} />
      </a>
    </section>
  )
}

function InsightCard({ text, tone, sample }: { text: string; tone: 'good' | 'neutral'; sample: boolean }) {
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
    </section>
  )
}

function DeckCard({ week, month }: { week: DeckSummary; month: DeckSummary }) {
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
    <article className="rounded-3xl border border-line bg-surface p-5 shadow-card transition-transform hover:-translate-y-0.5">
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

      <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
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

const MILESTONE_STYLE: Record<MilestoneTrack['kind'], { icon: ReactNode; color: string; tint: string; title: string }> = {
  reviews: { icon: <TrophyIcon size={20} />, color: 'var(--color-brand)', tint: 'var(--color-brand-soft)', title: m.milestones.reviews },
  streak: { icon: <Flame lit size={24} />, color: 'var(--color-sun-ink)', tint: 'var(--color-sun-soft)', title: m.milestones.streak },
  known: { icon: <BrainIcon size={20} />, color: 'var(--color-good)', tint: 'var(--color-good-soft)', title: m.milestones.known },
}

function MilestoneCard({ track }: { track: MilestoneTrack }) {
  const s = MILESTONE_STYLE[track.kind]
  const unit = track.kind === 'streak' ? (n: number) => `${formatInt(n)} ${n === 1 ? 'day' : 'days'}` : formatInt
  return (
    <article className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-2xl" style={{ background: s.tint, color: s.color }}>
          {/* The streak flame is decorative here; the title says what it is */}
          {track.kind === 'streak' ? <Flame lit={track.current > 0} size={24} /> : s.icon}
        </span>
        {track.reached !== null ? (
          <span className="animate-pop inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ background: s.tint, color: s.color }}>
            <CheckIcon size={14} /> {m.milestones.reached(unit(track.reached))}
          </span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">{m.milestones.none}</span>
        )}
      </div>
      <h3 className="mt-4 text-sm font-bold text-muted">{s.title}</h3>
      <p className="text-3xl font-black tracking-tight text-ink tabular-nums">
        <CountUp value={track.current} format={unit} />
      </p>
      <div className="mt-3">
        <ProgressBar value={track.progress} color={s.color} label={`${s.title}: progress to next milestone`} />
        <p className="mt-2 text-xs text-muted">
          {track.next === null ? m.milestones.maxed : m.milestones.next(unit(track.next - track.current), unit(track.next))}
        </p>
      </div>
    </article>
  )
}

function ExploreCard({ route, icon, title, sub }: { route: Route; icon: ReactNode; title: string; sub: string }) {
  return (
    <a
      href={routeHref(route)}
      className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-ink">{title}</span>
        <span className="block text-sm text-muted">{sub}</span>
      </span>
      <ArrowRightIcon size={18} className="shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-brand" />
    </a>
  )
}
