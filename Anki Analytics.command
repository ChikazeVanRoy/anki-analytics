#!/bin/zsh
# Double-click in Finder to start the dashboard, open it in the browser and sync with AnkiWeb.
# It runs for as long as this window stays open, so nothing keeps running once you're done.

cd "${0:A:h}" || exit 1
export ANKI_ANALYTICS_PORT=${ANKI_ANALYTICS_PORT:-5174}
URL=http://localhost:$ANKI_ANALYTICS_PORT
PIDFILE=data/.server.pid # says which server is the launcher's; its date says when that server started

fail() {
  echo "\n$1"
  read -s -k '?Press any key to close.'
  exit 1
}

# Its icon and hidden extension aren't kept by Git, so it sets them on itself: after a fresh clone, or a pull that
# replaced this file. Only for looks, so a failure here never stops the app starting.
if ! xattr "${0:A}" 2>/dev/null | grep -q com.apple.ResourceFork; then
  osascript -l JavaScript scripts/finder-look.js "${0:A}" "$PWD/scripts/launcher-icon.png" >/dev/null 2>&1
fi

running() { curl -sf -o /dev/null $URL/api/status }
# Only the launcher's own server: a dev API on this port (npm run dev) isn't ours to stop
listener() { lsof -ti tcp:$ANKI_ANALYTICS_PORT -sTCP:LISTEN }
ours() { [[ -f $PIDFILE && $(listener) == $(<$PIDFILE) ]] }

mkdir -p data

# Node installed with nvm isn't on PATH in a window opened from Finder
[[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
command -v node >/dev/null || fail "Node isn't installed. Get it from https://nodejs.org (version 26.1 or newer)."
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 26 || (a === 26 && b >= 1) ? 0 : 1)' ||
  fail "Node $(node --version) is too old. Install version 26.1 or newer from https://nodejs.org."

# First run, or the dependencies changed since the last install (e.g. after a git pull)
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  echo "Installing dependencies (first run only)..."
  npm install || fail "Installing dependencies failed (see above)."
fi

# The app needs building the first time, and again whenever its code changes
if [[ ! -f dist/index.html || -n $(find src public index.html package-lock.json vite.config.ts -newer dist/index.html -print -quit) ]]; then
  echo "Building the app..."
  npx vite build --logLevel warn || fail "Building the app failed (see above)."
fi

# Already running on older server code (e.g. after a git pull): restart it
if ours && [[ -n $(find server src/lib src/data -newer $PIDFILE -print -quit) ]]; then
  echo "Restarting with the latest code..."
  kill $(<$PIDFILE)
  for _ in {1..40}; do running || break; sleep 0.25; done
fi

if ! running; then
  node server/index.ts >> data/server.log 2>&1 &
  SERVER=$!
  echo $SERVER > $PIDFILE
  # Closing the window ends this script, and the server with it
  # Only its own PID file: a later launch may have restarted the server and written a new one
  trap 'kill $SERVER 2>/dev/null; [[ -f $PIDFILE && $(<$PIDFILE) == $SERVER ]] && rm -f $PIDFILE' EXIT
  trap 'exit 0' HUP INT TERM
  for _ in {1..120}; do running && break; sleep 0.25; done
  running || fail "The app didn't start. See data/server.log."
fi

open $URL
echo "Syncing with AnkiWeb: Anki will open and close by itself, so leave it for a moment..."
# Not tied to this window: closing it mid-sync must still let Anki close and the snapshot save
nohup node server/sync-anki.ts >> data/server.log 2>&1 &
wait $!
node -p 'require("./data/sync-status.json").message' 2>/dev/null

if [[ -n $SERVER ]]; then
  echo "Anki Analytics is running at $URL. Close this window to stop it."
  wait $SERVER
else
  echo "Anki Analytics was already running at $URL. You can close this window."
fi
