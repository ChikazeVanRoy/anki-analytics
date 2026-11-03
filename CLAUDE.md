# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## Project

Local-first Anki analytics: a React + TypeScript + Vite dashboard and a small Node API that reads a
**copy** of the user's Anki collection (`data/collection.anki2`) with `node:sqlite`. See README.md for
structure and what each section measures or projects.

## Hard rules

- **Never write to Anki's own files** (`~/Library/Application Support/Anki2`). Only read them, and only via
  `server/collection.ts`, which refuses while Anki is running. Open SQLite only with `{ readOnly: true }`.
- **Never commit personal data**: `/data/`, `*.anki2`, `*.colpkg`, `*.apkg`, databases, `.env*`,
  `anki-analytics.config.json` (it names the user's decks). Check
  `git diff --cached --name-only` before every commit. Tests use synthetic fixtures only.
- **Never fabricate statistics.** Mock data must stay labelled as mock; FSRS sections are hidden without
  real data. Label projections as projections and state assumptions in the UI.
- Keep everything local: no cloud services, telemetry or external APIs.
- Don't infer historical FSRS states from current states; reconstruct them by replaying the review log.

## Commands

Node comes from nvm (`~/.nvm`). If `node` isn't on PATH in a fresh shell, prefix commands with
`export PATH="$HOME/.nvm/versions/node/v26.13.0/bin:$PATH" &&`.

```sh
npm run dev       # API (127.0.0.1:5174, auto-restarts) + Vite (localhost:5173)
npm test          # Vitest, all tests
npm run test:e2e  # Playwright smoke tests (installed Chrome, synthetic data, phone + desktop)
npx tsc -b        # type-check (app + server configs)
npm run lint      # oxlint
npm run build     # production build
```

## Conventions

- Calculations live in pure functions in `src/lib/` (no React) with tests next to them (`*.test.ts`).
- `src/lib/dates.ts` and `src/lib/fsrs.ts` have no imports so the Node server can import them directly
  (server imports use explicit `.ts` extensions; browser code doesn't).
- Anki days start at the collection's rollover hour: use `ankiDayKey` / `ankiToday`, never raw UTC dates.
- The data contract is `src/data/types.ts`; the API and mock data must both satisfy it.
- Decks are generic: never hard-code deck names. Grouping lives in `server/deckGroups.ts` (plus the user's
  optional config file); the server gives each deck a colour slot (`Deck.color`).
- Charts: deck colours are fixed per deck (`src/lib/theme.ts`); new palettes must pass the colour
  validator in both themes; estimated series are hatched and dashed, measured series solid.
- Colours are tokens in `src/index.css` (one `light-dark()` pair each). Use the Tailwind utilities or write
  `var(--color-…)` names in full; Tailwind drops variables whose names are built with template strings.
  Small text keeps 4.5:1 contrast in both themes.
- Interface text lives in `src/i18n/en.ts`; number and date formatting use `LOCALE` from `src/i18n`.
- Each section is a page in `src/pages/`; label sources with `SourceBadge` (measured, projection, sample).

## Workflow for changes

1. **Branch** from `main`: `git switch -c feature/<short-name>` (or `fix/…`).
2. **Plan** briefly; for anything touching Anki data or FSRS maths, say how it will be verified.
3. **Implement** in small steps, adding or updating tests with the code.
4. **Check** before every commit: `npm test`, `npx tsc -b`, `npm run lint`, `npm run build`. For UI
   changes, also run `npm run test:e2e`, run the app and look at it (desktop and ~390 px wide). Report failures; don't hide them.
5. **Review** with `/code-review` on the branch, then the owner reviews the diff
   (`git diff main...HEAD`).
6. **Commit** in logical commits; **merge** into `main` only after the owner approves. Push only when asked.

## Git habits

- **Never commit directly to `main`.** Every change, however small, goes on a branch.
- **Commit small, working steps as you go** (each one passing the checks), rather than one large commit at the
  end. Uncommitted work is one mistake away from being lost.
- **Stage files by name** (`git add path/to/file`) rather than `git add -A`, and read `git status --short`
  before committing.
- **Experiment without overwriting files**: to compare with old code, use `git stash` or a temporary worktree
  (`git worktree add ../tmp-check <commit>`), not `git show … > file`.
- **Back up a branch by pushing it** (never `main` without approval) and review it as a pull request.
- **Tidy before merging**: fold "fix review findings" commits into the commits they fix, while the branch is
  still unshared. Never rewrite history that others may have pulled; if unavoidable, use
  `--force-with-lease` and get explicit approval first.
