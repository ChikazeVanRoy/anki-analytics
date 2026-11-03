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

For fresh stats, quit Anki and press **Refresh** in the dashboard (or re-run `copy-collection`).
If the API isn't running, the dashboard shows clearly labelled sample data and the Planner and Advanced
sections explain why they need real FSRS data.

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
  - `anki.ts`: daily totals and card counts; deck grouping and exclusions are configured at the top
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
Personal Anki data (`/data/`, `*.anki2`, `*.colpkg`, …) is git-ignored and must never be committed.

## Development workflow

See [CLAUDE.md](CLAUDE.md): one branch per change, checks before every commit, review before merging.
