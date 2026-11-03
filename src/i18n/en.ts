// English interface text. Another language is added by writing an object of type `Messages`
// (the compiler then lists every missing string) and selecting it in ./index.ts.
// Technical copy deep inside the Planner and Advanced sections is still inline; move it here when
// a second language is added.

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const int = (n: number) => Math.round(n).toLocaleString('en-GB') // this file's locale

export const en = {
  appName: 'Anki Analytics',
  nav: {
    label: 'Sections',
    home: 'Home',
    activity: 'Activity',
    planner: 'Planner',
    advanced: 'Advanced',
  },
  theme: {
    label: 'Colour theme',
    system: 'Match system',
    light: 'Light',
    dark: 'Dark',
  },
  data: {
    live: 'Your Anki data',
    sample: 'Sample data',
    copiedAt: (when: string) => `Copied from Anki ${when}`,
    sampleTitle: 'You’re looking at sample data',
    sampleBody:
      'These numbers are generated so you can explore the app. They are not your statistics. To see your own, quit Anki, run npm run dev and press Refresh.',
    sampleReason: (reason: string) => `Why: ${reason}`,
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    refreshHint: 'Copy the latest collection from Anki (Anki must be closed)',
    refreshFailed: (msg: string) => `Couldn’t refresh: ${msg}`,
    dismiss: 'Dismiss',
    footerLive: 'Read locally from a copy of your Anki collection. Nothing leaves this computer.',
    footerSample: 'Showing generated sample data. Real statistics are read locally from a copy of your collection.',
  },
  loading: 'Gathering your Anki stats…',
  badges: {
    measured: 'Measured',
    measuredTip: 'Counted directly from your review history.',
    projection: 'Projection',
    projectionTip: 'Simulated from your cards. An estimate, not a promise.',
    sample: 'Sample',
  },
  home: {
    greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
    status: {
      done: (n: number) => `You’ve reviewed ${int(n)} ${plural(n, 'card', 'cards')} today. Nice work!`,
      keep: (streak: number) => `Your ${streak}-day streak is waiting. A short session today keeps it going.`,
      start: 'Ready when you are. A short session today starts a new streak.',
      empty: 'Your progress will appear here after your first review in Anki.',
    },
    streak: { label: 'day streak', best: (n: number) => `Best: ${n} ${plural(n, 'day', 'days')}` },
    kpi: {
      today: 'Reviewed today',
      todaySub: (minutes: number) => (minutes > 0 ? `about ${int(minutes)} min` : 'nothing yet today'),
      week: 'This week',
      weekSub: 'reviews in the last 7 days',
      weekVs: (pct: string, up: boolean) => `${up ? '▲' : '▼'} ${pct} vs the week before`,
      weekNoPrev: 'no reviews the week before',
      remembered: 'Remembered',
      rememberedSub: (n: number) => `of ${int(n)} reviews of learned cards, last 30 days`,
      rememberedNone: 'no reviews of learned cards in the last 30 days',
      rememberedTip:
        'Share of reviews of graduated cards that you didn’t answer “Again”. Anki calls this true retention.',
      active: 'Active days',
      activeSub: 'in the last 30 days',
    },
    recent: {
      title: 'Last two weeks',
      question: 'Have I been studying regularly?',
      summary: (total: number, active: number) =>
        `${int(total)} reviews on ${active} of the last 14 days`,
      today: 'Today',
      bar: (date: string, n: number) => `${date}: ${int(n)} ${plural(n, 'review', 'reviews')}`,
    },
    decks: {
      title: 'Your decks',
      question: 'How far along is each deck?',
      cards: (n: number) => `${int(n)} cards`,
      started: (pct: string) => `${pct} started`,
      week: 'Reviews, 7 days',
      remembered: 'Remembered, 30 days',
      notStarted: 'Not started',
      learning: 'Learning',
      known: 'Known well',
      knownTip: 'Cards with an interval of 21 days or more (Anki calls these “mature”).',
    },
    insight: { title: 'Insight', basis: 'Based on your review history', basisSample: 'Based on the generated sample data' },
    milestones: {
      title: 'Milestones',
      question: 'What have I achieved so far?',
      reviews: 'Reviews completed',
      streak: 'Longest streak',
      known: 'Cards known well',
      reached: (label: string) => `Reached ${label}`,
      none: 'First milestone ahead',
      next: (remaining: string, target: string) => `${remaining} to go until ${target}`,
      maxed: 'Every milestone reached. Impressive.',
      note: 'Milestones reward steady progress. There’s no badge for cramming: rest days are part of learning.',
    },
    explore: {
      planner: 'How much work is coming?',
      plannerSub: 'Try different new-card limits and see your future review load.',
      advanced: 'How strong are my memories?',
      advancedSub: 'Memory strength, difficulty and how well FSRS predicts you.',
      activity: 'See your full history',
      activitySub: 'Heatmap, trends and deck comparisons.',
    },
  },
  activity: {
    title: 'Activity',
    subtitle: 'What you’ve reviewed, and how it’s going.',
  },
  planner: {
    title: 'Planner',
    subtitle: 'Simulations of your real cards, so you can plan a workload you’ll enjoy keeping.',
  },
  advanced: {
    title: 'Advanced',
    subtitle: 'The FSRS memory model behind your schedule, for when you want the details.',
  },
  fsrsMissing: {
    planner: 'The Planner needs your real FSRS data',
    advanced: 'Memory details need your real FSRS data',
    back: 'Back to Home',
  },
  error: {
    title: 'Something went wrong',
    body: 'This section couldn’t be shown. The rest of the app still works.',
    retry: 'Try again',
  },
}

export type Messages = typeof en
