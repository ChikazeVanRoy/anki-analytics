#!/bin/zsh
# Double-click in Finder to start the dashboard and open it in the browser.
# It keeps running in the background, so this window can be closed. To stop it, double-click
# "Stop Anki Analytics.command".

cd "${0:A:h}" || exit 1
export ANKI_ANALYTICS_PORT=${ANKI_ANALYTICS_PORT:-5174}
URL=http://localhost:$ANKI_ANALYTICS_PORT
PIDFILE=data/.server.pid # says which server is the launcher's; its date says when that server started

fail() {
  echo "\n$1"
  read -s -k '?Press any key to close.'
  exit 1
}

running() { curl -sf -o /dev/null $URL/api/status }
# Only the launcher's own server: a dev API on this port (npm run dev) isn't ours to stop
listener() { lsof -ti tcp:$ANKI_ANALYTICS_PORT -sTCP:LISTEN }
ours() { [[ -f $PIDFILE && $(listener) == $(<$PIDFILE) ]] }

# Node installed with nvm isn't on PATH in a window opened from Finder
[[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
command -v node >/dev/null || fail "Node isn't installed. Get it from https://nodejs.org (version 22.18 or newer)."
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' ||
  fail "Node $(node --version) is too old. Install version 22.18 or newer from https://nodejs.org."

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
  mkdir -p data
  # nohup and disown: the app outlives this window
  nohup node server/index.ts >> data/server.log 2>&1 &
  echo $! > $PIDFILE
  disown
  for _ in {1..120}; do running && break; sleep 0.25; done
  running || fail "The app didn't start. See data/server.log."
fi

open $URL
echo "Anki Analytics is running at $URL. You can close this window."
