# Anki Analytics

A local-first dashboard for Anki learning progress, with FSRS memory analytics and a review-workload forecast.
React + TypeScript + Vite, Tailwind CSS, Recharts; a small Node API reads a **copy** of your Anki collection
with Node's built-in SQLite. The original collection is never modified.

Requires Node 26.1+ (the API's TypeScript runs directly, no build step, and card text needs its newest SQLite features) and macOS (it looks for Anki in
`~/Library/Application Support/Anki2`).

## Run

```sh
npm install
npm run copy-collection   # quit Anki first; copies collection.anki2 -> data/ (git-ignored)
npm run snapshot          # saves your stats to data/snapshot.json (git-ignored), shown if the API can't answer
npm run dev               # API on 127.0.0.1:5174 + app on http://localhost:5173
npm test                  # unit + integration tests (Vitest); npm run test:watch re-runs on save
npm run test:e2e          # browser smoke tests (Playwright, installed Chrome, synthetic data only)
npm run lint              # oxlint
npm run build             # type-check + production build
```

Or double-click **`Anki Analytics.command`** in Finder: it installs the dependencies and builds the app when
needed, starts it on http://localhost:5174, opens it in your browser and syncs with AnkiWeb. It runs for as long as the
Terminal window stays open: close the window to stop it. The first
double-click also gives the launcher its icon and hides its `.command` extension in Finder (Git can't store either,
so it sets them on itself, and again if a `git pull` replaces the file). Drag the launcher
to the right-hand side of the Dock for one-click launching. If macOS says it can't be opened (it does for files
downloaded as a ZIP), right-click it and choose **Open** once. Its log is `data/server.log`. Close it before
running `npm run dev`, which needs the same API port. If `npm run dev` is already running, the launcher opens that
server's API and leaves it alone.

While the dashboard is open it fetches fresh stats by itself once you quit Anki. You can also quit Anki and press
**Refresh** (or re-run `copy-collection`).
If the API isn't running, the dashboard shows clearly labelled sample data and the Planner and Advanced
sections explain why they need real FSRS data.

## Your decks

With no setup, each top-level Anki deck is its own deck in the dashboard (subdecks count towards their
parent). The three with the most studied cards are shown on their own, each with a colour, and the rest are
combined as "Other decks", so a large imported deck you haven't started doesn't take a place. A deck keeps
its colour between visits, even when other decks come and go (remembered in `data/deck-colors.json`).

To merge, rename, leave out or pin decks, copy `anki-analytics.config.example.json` to
`anki-analytics.config.json` (git-ignored, since it names your decks) and edit it:

```json
{
  "groups": [{ "name": "Language", "decks": ["Spanish*", "Language*"], "color": 1 }],
  "exclude": ["Old decks"],
  "maxDecks": 3
}
```

- `groups`: up to three dashboard decks, each made of the top-level Anki decks whose names match
  (case-insensitive; `*` matches anything). `color` (1-3) is optional.
- `exclude`: top-level decks left out of every statistic.
- `maxDecks`: how many decks to show on their own (0-3), including the configured groups, which always show.

Changes apply the next time the dashboard loads or refreshes. If the file can't be used (invalid JSON, an
unknown key such as `"colour"`, a value out of range), the dashboard shows sample data and says what to fix.
A group whose patterns match no deck is left out, and the API terminal warns about it.

## What it shows

Four sections (`#/`, `#/activity`, `#/planner`, `#/advanced`), simple first and technical on request, plus the
monthly `#/wrapped`:

| Section | What it answers | Source |
|---|---|---|
| **Home** | What should I do today? Next step, Sprig the mascot, streak with rest days, daily quests, living garden, journey map, milestones, badges, and the detailed numbers behind "Your numbers" | **Measured** from your review log and card counts; the suggested new-card limit, your current pace's cost and deck finish dates (from each deck's new cards a day, adjustable on the card) are labelled **projections** |
| **Activity** | When and how much did I study, am I forgetting less, and which cards keep tripping me up? Heatmap, knowledge curve, review charts, new cards vs reviews, deck comparison, trouble cards | **Measured** from your review log; the knowledge curve is **FSRS's estimate**, replayed from that log |
| **Planner** | How much work is coming, how many new cards can I sustain, and what would a goal take? | **Projection**: Monte Carlo simulation with FSRS-6 scheduling on your real cards, opening on your current pace |
| **Advanced** | How strong are my memories, and does FSRS predict me well? Stability, difficulty, recall, risk, calibration | **Measured** card states (as Anki stored them) + the FSRS-6 forgetting curve; past predictions replayed from the review log |

After you study, a session recap celebrates what changed since your last visit (it needs to see one visit first,
and the app can only react once Anki is closed). `#/wrapped` is a monthly review to swipe through. The recap's sound
is off until you turn it on. Quests, badges and recaps reward showing up and proven memory, never volume or a high
Remembered score, which would pay for grading a forgotten card as remembered. One missed day a week keeps a streak.

Measured, projected and sample data look different (solid badge, dashed badge and edges, amber banner).
Milestones only count what the data shows (lifetime reviews, days studied, cards proven at 21+ days) and nothing
rewards a single heavy day. "Known well" means a card passed a review at an interval of 21+ days; one whose
interval has reached that but which hasn't been tested yet is shown as "Not yet tested". Light and dark themes follow the system, with a toggle in the header.

The replay reproduces every memory state that Anki 26.9.3's own engine computes (checked review by review on a real
collection), and nearly all of Anki's stored states (the exceptions were most likely written by an older Anki
version or another device). The gap between predicted and actual recall comes from
FSRS's default parameters, not from the calculations; see [docs/fsrs-validation.md](docs/fsrs-validation.md).
Forecast assumptions and limits are listed in the app under "How the forecast works".

If your lapse rate changes sharply compared with what FSRS expected (for example, you start pressing Again where
you used to press Hard), the app dates the change and doesn't pool the two habits: Advanced's verdict and the
Planner's lapse rate use reviews since then, and the optimise advice waits for 400 of them. The Planner's lapse
rate also stays near FSRS's prediction until there are enough lapses to go on.

## Structure

- `server/`: local API
  - `app.ts`: request handling (`GET /api/stats`, `GET /api/status`, `POST /api/refresh`, `GET /snapshot.json`, the built app via `staticFiles.ts`, Host-header check); `index.ts` starts it
  - `anki.ts`: daily totals and card counts
  - `deckGroups.ts`: which dashboard deck each Anki deck belongs to, and the optional config file
  - `fsrsData.ts`: FSRS states, presets (decoded with `protobuf.ts`), review-log replay, measured behaviour
  - `collection.ts`: the safe copy (refuses while Anki is open); `copy-collection.ts` is its CLI
  - `snapshot.ts`: saves the stats to one file; `make-snapshot.ts` is its CLI
- `src/data/`: `types.ts` (data contract shared with the API), `useAnkiData.ts`, `useSimulation.ts`, `mockData.ts`
- `src/lib/`: pure, tested logic: `fsrs.ts` (FSRS-6, shared with the server), `simulator.ts` (+ Web Worker),
  `fsrsStats.ts`, `gradingShift.ts`, `plan.ts`, `deckPace.ts`, `insights.ts`, `stats.ts`, `heatmap.ts`, `dates.ts`
- `src/app/`: shell (header, navigation, banners), theme and route hooks, error boundary
- `src/pages/`: one file per section (Home, Activity, Planner, Advanced, Wrapped)
- `src/components/`: charts and shared UI (`ui.tsx`, `Panel.tsx`, `icons.tsx`)
- `src/i18n/`: interface text (`en.ts`) and locale; add a language by writing another `Messages` object
- `src/index.css`: design tokens (colours as `light-dark()` pairs, type, motion)
- `*.test.ts`: tests next to the code they cover; server tests use a tiny fake collection, never your data

## Background sync

Each time the launcher starts, it opens Anki so it syncs with AnkiWeb, asks it to quit, and saves a new snapshot, so
reviews from other devices reach it. `npm run sync` does the same by hand. Nothing runs on a schedule: it only happens when
you launch the app. Anki shows for about 30 seconds and closes by itself, so start studying after that. It leaves Anki alone
if Anki is already open, and never forces it to close. The
result goes to `data/sync-status.json`, and a problem that needs you shows a notification. It needs a single Anki profile.
A Refresh, including the automatic one when you quit Anki, saves a new snapshot too.

## Installing it

The built app is a PWA: `manifest.webmanifest` lets it be added to a home screen, and a service worker (`src/sw.js`, built
to `dist/sw.js`) saves the app and the latest snapshot, so it opens with the server stopped. Live stats are never
saved by it, and it only runs in the built app, not under `npm run dev`.

## On your phone

Tailscale connects your own devices privately, so nothing has to be exposed to the internet:

1. Install Tailscale on the Mac and iPhone, sign in on both, and turn on HTTPS certificates in its admin console.
2. `npm run phone-access -- <machine>.<tailnet>.ts.net`, using the Mac's name in Tailscale.
3. `tailscale serve --bg 5174`. Never use `tailscale funnel`, which is the public internet.
4. Open `https://<machine>.<tailnet>.ts.net` in Safari on the iPhone, then Share > Add to Home Screen.

The phone reads the latest snapshot and nothing else: no live stats and no refresh, and note text is removed, so trouble
cards and garden plants show no card text there. It gets new stats only while the launcher's window is open and the Mac
is awake, and otherwise shows the last snapshot it saved. `npm run phone-access -- off` stops it.

## Privacy

Everything stays on your own devices; the API only answers requests addressed to this machine, plus the phone access
you can turn on above. Trouble cards show the text of
a few of your notes, and the garden shows studied cards' text when you tap a plant. Both are read from the local
copy and shown only in your browser, which also remembers your last visit's totals for the session recap. The built
app's browser storage also keeps the latest snapshot, note text included, so deleting `data/snapshot.json` doesn't
remove that copy; clearing the site's data does.
Personal Anki data (`/data/`, `*.anki2`, `*.colpkg`, …) and your deck config (`anki-analytics.config.json`)
are git-ignored and must never be committed.

## Development workflow

See [CLAUDE.md](CLAUDE.md): one branch per change, checks before every commit, review before merging.
