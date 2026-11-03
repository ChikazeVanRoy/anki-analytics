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
If the API isn't running, the dashboard shows clearly labelled mock data and hides the FSRS sections.

## What it shows

| Section | Source |
|---|---|
| Stat cards, heatmap, review charts, deck comparison | **Measured** from your review log |
| FSRS memory: stability, difficulty, recall now, risk, retention vs target, calibration | **Measured** card states (as Anki stored them) + the FSRS-6 forgetting curve; past predictions replayed from the review log |
| Review workload forecast and insights | **Projection**: Monte Carlo simulation with FSRS-6 scheduling on your real cards |

The replay reproduces Anki's stored FSRS difficulty for every studied card and stability for ~99%
(the rest differ by an edge case in same-day Hard steps). Forecast assumptions and limits are listed in
the app under "How the forecast works".

## Structure

- `server/`: local API
  - `app.ts`: request handling (`GET /api/stats`, `POST /api/refresh`, Host-header check); `index.ts` starts it
  - `anki.ts`: daily totals and card counts; deck grouping and exclusions are configured at the top
  - `fsrsData.ts`: FSRS states, presets (decoded with `protobuf.ts`), review-log replay, measured behaviour
  - `collection.ts`: the safe copy (refuses while Anki is open); `copy-collection.ts` is its CLI
- `src/data/`: `types.ts` (data contract shared with the API), `useAnkiData.ts`, `useSimulation.ts`, `mockData.ts`
- `src/lib/`: pure, tested logic: `fsrs.ts` (FSRS-6, shared with the server), `simulator.ts` (+ Web Worker),
  `fsrsStats.ts`, `insights.ts`, `stats.ts`, `heatmap.ts`, `dates.ts`
- `src/components/`: one file per dashboard section
- `*.test.ts`: tests next to the code they cover; server tests use a tiny fake collection, never your data

## Privacy

Everything stays local; the API only answers requests addressed to this machine.
Personal Anki data (`/data/`, `*.anki2`, `*.colpkg`, …) is git-ignored and must never be committed.

## Development workflow

See [CLAUDE.md](CLAUDE.md): one branch per change, checks before every commit, review before merging.
