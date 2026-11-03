# Anki Analytics

A local-first dashboard for Anki learning progress, with FSRS memory analytics and a review-workload forecast.
React + TypeScript + Vite, Tailwind CSS, Recharts; a small Node API reads a **copy** of your Anki collection
with Node's built-in SQLite. The original collection is never modified.

Requires Node 22.18+ (the API's TypeScript runs directly, no build step) and macOS (it looks for Anki in
`~/Library/Application Support/Anki2`).

## Run

```sh
npm install
npm run copy-collection   # quit Anki first; copies collection.anki2 -> data/ (git-ignored)
npm run dev               # API on 127.0.0.1:5174 + app on http://localhost:5173
npm test                  # unit + integration tests (Vitest); npm run test:watch re-runs on save
npm run lint              # oxlint
npm run build             # type-check + production build
```

Or double-click **`Anki Analytics.command`** in Finder: it installs the dependencies on the first run, starts
the app and opens it in your browser. Keep its Terminal window open while you use the dashboard; close it to
stop. Drag the file to the right-hand side of the Dock for one-click launching. If macOS says it can't be
opened (it does for files downloaded as a ZIP), right-click it and choose **Open** once.

For fresh stats, quit Anki and press **Refresh** in the dashboard (or re-run `copy-collection`).
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
  "groups": [{ "name": "Mandarin", "decks": ["Chinese*", "Mandarin*"], "color": 1 }],
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

Four sections (`#/`, `#/activity`, `#/planner`, `#/advanced`), simple first and technical on request:

| Section | What it answers | Source |
|---|---|---|
| **Home** | How am I doing today? Streak, key numbers, last two weeks, one insight, deck progress, milestones | **Measured** from your review log and card counts |
| **Activity** | When and how much did I study, and am I forgetting less? Heatmap, review charts, deck comparison | **Measured** from your review log |
| **Planner** | How much work is coming, and how many new cards can I sustain? | **Projection**: Monte Carlo simulation with FSRS-6 scheduling on your real cards |
| **Advanced** | How strong are my memories, and does FSRS predict me well? Stability, difficulty, recall, risk, calibration | **Measured** card states (as Anki stored them) + the FSRS-6 forgetting curve; past predictions replayed from the review log |

Measured, projected and sample data look different (solid badge, dashed badge and edges, amber banner).
Milestones only count what the data shows (lifetime reviews, longest streak, cards known well) and nothing
rewards a single heavy day. Light and dark themes follow the system, with a toggle in the header.

The replay reproduces every memory state that Anki 26.9.3's own engine computes for this collection (all
2,221 reviews checked), and Anki's stored state for 728 of 740 cards (the other 12 were most likely written
by an older Anki version or another device). The gap between predicted and actual recall comes from
FSRS's default parameters, not from the calculations; see [docs/fsrs-validation.md](docs/fsrs-validation.md).
Forecast assumptions and limits are listed in the app under "How the forecast works".

## Structure

- `server/`: local API
  - `app.ts`: request handling (`GET /api/stats`, `POST /api/refresh`, Host-header check); `index.ts` starts it
  - `anki.ts`: daily totals and card counts
  - `deckGroups.ts`: which dashboard deck each Anki deck belongs to, and the optional config file
  - `fsrsData.ts`: FSRS states, presets (decoded with `protobuf.ts`), review-log replay, measured behaviour
  - `collection.ts`: the safe copy (refuses while Anki is open); `copy-collection.ts` is its CLI
- `src/data/`: `types.ts` (data contract shared with the API), `useAnkiData.ts`, `useSimulation.ts`, `mockData.ts`
- `src/lib/`: pure, tested logic: `fsrs.ts` (FSRS-6, shared with the server), `simulator.ts` (+ Web Worker),
  `fsrsStats.ts`, `insights.ts`, `stats.ts`, `heatmap.ts`, `dates.ts`
- `src/app/`: shell (header, navigation, banners), theme and route hooks, error boundary
- `src/pages/`: one file per section (Home, Activity, Planner, Advanced)
- `src/components/`: charts and shared UI (`ui.tsx`, `Panel.tsx`, `icons.tsx`)
- `src/i18n/`: interface text (`en.ts`) and locale; add a language by writing another `Messages` object
- `src/index.css`: design tokens (colours as `light-dark()` pairs, type, motion)
- `*.test.ts`: tests next to the code they cover; server tests use a tiny fake collection, never your data

## Privacy

Everything stays local; the API only answers requests addressed to this machine.
Personal Anki data (`/data/`, `*.anki2`, `*.colpkg`, …) and your deck config (`anki-analytics.config.json`)
are git-ignored and must never be committed.

## Development workflow

See [CLAUDE.md](CLAUDE.md): one branch per change, checks before every commit, review before merging.
