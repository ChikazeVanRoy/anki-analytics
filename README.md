# Anki Analytics

A local-first dashboard for Anki learning progress. React + TypeScript + Vite, Tailwind CSS, Recharts.

Reads a **copy** of your Anki collection with Node's built-in SQLite. The original is never modified. If the API isn't running, the UI falls back to clearly labelled mock data.

Requires Node 22.18+ (runs the TypeScript API directly, no build step).

## Run

```sh
npm install
npm run copy-collection   # quit Anki first; copies collection.anki2 -> data/ (git-ignored)
npm run dev               # API on 127.0.0.1:5174 + app on http://localhost:5173
npm run build             # type-check + production build
```

Re-run `copy-collection` (with Anki closed) whenever you want fresh stats.
Deck grouping (Mandarin / Portuguese / Other) is configured in `server/anki.ts`.

## Structure

- `server/` — local API (`anki.ts` reads SQLite, `index.ts` serves `/api/stats`, `copy-collection.ts`)
- `src/data/types.ts` — data contract shared by the API and mock data
- `src/lib/stats.ts` — pure functions deriving dashboard stats
- `src/components/` — dashboard sections

## Privacy

Everything stays local. Personal Anki data (`data/`, `*.anki2`, …) is git-ignored and must never be committed.
