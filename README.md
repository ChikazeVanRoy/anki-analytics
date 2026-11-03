# Anki Analytics

A local-first dashboard for Anki learning progress. React + TypeScript + Vite, Tailwind CSS, Recharts.

Reads a **copy** of your Anki collection with Node's built-in SQLite. The original is never modified. If the API isn't running, the UI falls back to clearly labelled mock data.

Requires Node 22.18+ (runs the TypeScript API directly, no build step).

## Run

```sh
npm install
npm run copy-collection   # quit Anki first; copies collection.anki2 -> data/ (git-ignored)
npm run dev               # API on 127.0.0.1:5174 + app on http://localhost:5173
npm test                  # unit tests (Vitest); npm run test:watch re-runs on save
npm run build             # type-check + production build
```

For fresh stats, quit Anki and press **Refresh** in the dashboard (or re-run `copy-collection`).
Deck grouping (Mandarin / Portuguese / Other) is configured in `server/anki.ts`.

## Structure

- `server/` — local API: `anki.ts` reads SQLite, `collection.ts` makes the safe copy, `index.ts` serves `GET /api/stats` and `POST /api/refresh`
- `src/data/types.ts` — data contract shared by the API and mock data
- `src/lib/` — pure, tested functions (`stats.ts`, `heatmap.ts`) deriving dashboard stats
- `*.test.ts` — tests next to the code they cover; the server tests use a tiny fake collection
- `src/components/` — dashboard sections

## Privacy

Everything stays local. Personal Anki data (`data/`, `*.anki2`, …) is git-ignored and must never be committed.
