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

Or double-click **`Anki Analytics.command`** in Finder: it first fast-forwards to the latest code from GitHub (a
plain `git pull --ff-only`; skipped when offline, when you have uncommitted changes or unpushed commits), installs the dependencies and builds the app when
needed, starts it on http://localhost:5174, opens it in your browser. It runs for as long as the
Terminal window stays open: close the window to stop it. The first
double-click also gives the launcher its icon and hides its `.command` extension in Finder (Git can't store either,
so it sets them on itself, and again if a `git pull` replaces the file). Drag the launcher
to the right-hand side of the Dock for one-click launching. If macOS says it can't be opened (it does for files
downloaded as a ZIP), right-click it and choose **Open** once. Its log is `data/server.log`. Close it before
running `npm run dev`, which needs the same API port. If `npm run dev` is already running, the launcher opens that
server's API and leaves it alone.

### Without a Terminal window

If you'd rather not keep the launcher's window open, run `npm run service -- on` once (after closing the launcher or
`npm run dev`). It installs a macOS LaunchAgent that keeps the app running in the background from every login, at
http://localhost:5174, so open that address (Safari's **Add to Dock** makes it an app). It still only listens on this
Mac, and the phone then gets fresh stats whenever the Mac is awake. `npm run service -- off` removes it, `-- status`
checks it, and `-- restart` picks up new code after a `git pull` (the service doesn't pull or rebuild by itself: run
`npm run build` first). Its log is `data/server.log`.

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
  - `cloud.ts`: uploads the phone's snapshot to your Firebase project (`cloud-cli.ts` is `npm run cloud`)
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

The launcher doesn't open Anki. If you review on other devices, `npm run sync` opens Anki so it syncs with AnkiWeb,
asks it to quit, and saves a new snapshot. Nothing runs on a schedule. Anki shows for about 30 seconds and closes by itself, so start studying after that. It leaves Anki alone
if Anki is already open, and never forces it to close. The
result goes to `data/sync-status.json`, and a problem that needs you shows a notification. It needs a single Anki profile.
A Refresh, including the automatic one when you quit Anki, saves a new snapshot too.

## Installing it

The built app is a PWA: `manifest.webmanifest` lets it be added to a home screen, and a service worker (`src/sw.js`, built
to `dist/sw.js`) saves the app and the latest snapshot, so it opens with the server stopped. Live stats are never
saved by it, and it only runs in the built app, not under `npm run dev`.

## On your phone

The phone shows a snapshot of your stats: no live stats and no Refresh, and note text is removed, so trouble cards and
garden plants show no card text there. There are two ways to get it there. Either way it never opens Anki: for reviews
done on other devices, run `npm run sync` first.

### With Firebase (free, and works with the Mac asleep)

The Mac uploads each new snapshot to your own Firebase project, and the phone reads it after you sign in. Firebase's free
Spark plan covers this many times over: it asks for no card, and a project on it can't be billed. Check the current limits on
[Firebase's pricing page](https://firebase.google.com/pricing) (at the time of writing, about one write and a few reads a day
against allowances of tens of thousands), and never upgrade the project to the paid Blaze plan. Anyone can create an account
in the project using its public API key, though the security rules stop such an account reading or writing your snapshot;
if the console offers a setting to turn sign-up off, switch it on once you've made your own account.

1. In the [Firebase console](https://console.firebase.google.com), create a project (turn Google Analytics off). Add
   **Firestore Database** (production mode), **Authentication** (add yourself as a user with a password you don't use
   elsewhere; `deploy` below turns on Email/Password sign-in) and **Hosting**. In Project settings, add a web app and note its `apiKey`.
2. `npm run cloud -- login <project-id> <web-api-key> <email>`. It asks for the password and keeps it in your macOS
   Keychain, never in a file, then checks that it works and writes your security rules to `data/firestore.rules`.
3. `npx firebase-tools@15.34.1 login` (opens a browser once), then `npm run cloud -- deploy`. This publishes the app's code,
   which holds no personal data, and the rules, which let only your account read or write the snapshot.
4. Open `https://<project-id>.web.app` on the iPhone, sign in, then Share > Add to Home Screen.

The running server (the launcher's window, or `npm run service`) uploads a snapshot whenever a new one is saved, checking
every 5 minutes. With the Mac asleep, the phone shows the last upload and when it was made. After a failure only you can fix
(a changed password, rules not deployed) it stops retrying for an hour and the Mac's page says so. `npm run cloud -- status`
shows what's up there, `-- upload` sends one now, and `-- off` stops uploading and forgets the password (delete the
snapshot itself in the Firebase console under Firestore > snapshots). A new version of the app reaches the phone after you
run `npm run cloud -- deploy` again and reopen it.

### With Tailscale (live from your Mac, which has to be awake)

Tailscale connects your own devices privately, so nothing has to be exposed to the internet:

1. Install Tailscale on the Mac and iPhone, sign in on both, and turn on HTTPS certificates in its admin console.
2. `npm run phone-access -- <machine>.<tailnet>.ts.net`, using the Mac's name in Tailscale.
3. `tailscale serve --bg 5174`. Never use `tailscale funnel`, which is the public internet.
4. Open `https://<machine>.<tailnet>.ts.net` in Safari on the iPhone, then Share > Add to Home Screen.

The running server saves a new snapshot by itself (checked every 5 minutes, and at start) whenever Anki has
closed with newer data than the last copy, so it needs no browser tab open, only the launcher's window or the background
service, and the Mac awake. Otherwise the phone shows the last snapshot saved. `npm run phone-access -- off` stops it.

## Privacy

Everything stays on your own devices, with one optional exception: if you turn on the Firebase upload above, a copy of the
snapshot (without note text) is stored in your own Firebase project on Google's servers, where only your account can read
it, and the phone signs in to get it. Nothing else is sent anywhere, and there's no analytics or tracking. The API only
answers requests addressed to this machine, plus the Tailscale phone access you can turn on above. Trouble cards show the text of
a few of your notes, and the garden shows studied cards' text when you tap a plant. Both are read from the local
copy and shown only in your browser, which also remembers your last visit's totals for the session recap. The built
app's browser storage also keeps the latest snapshot, note text included, so deleting `data/snapshot.json` doesn't
remove that copy; clearing the site's data does.
Personal Anki data (`/data/`, `*.anki2`, `*.colpkg`, …) and your deck config (`anki-analytics.config.json`)
are git-ignored and must never be committed.

## Development workflow

See [CLAUDE.md](CLAUDE.md): one branch per change, checks before every commit, review before merging.
