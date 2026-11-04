#!/bin/zsh
# Double-click in Finder to start the dashboard and open it in the browser.
# It keeps running in the background, so this window can be closed. To stop it, double-click
# "Stop Anki Analytics.command".

cd "${0:A:h}" || exit 1
PORT=${PORT:-5174}
URL=http://localhost:$PORT
STAMP=data/.server-started

fail() {
  echo "\n$1"
  read -s -k '?Press any key to close.'
  exit 1
}

running() { curl -sf -o /dev/null $URL/api/status }

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
if running && [[ ! -f $STAMP || -n $(find server src/lib src/data -newer $STAMP -print -quit) ]]; then
  echo "Restarting with the latest code..."
  lsof -ti tcp:$PORT -sTCP:LISTEN | xargs kill
  for _ in {1..40}; do running || break; sleep 0.25; done
fi

if ! running; then
  mkdir -p data
  touch $STAMP
  # nohup and disown: the app outlives this window
  PORT=$PORT nohup node server/index.ts >> data/server.log 2>&1 &
  disown
  for _ in {1..120}; do running && break; sleep 0.25; done
  running || fail "The app didn't start. See data/server.log."
fi

open $URL
echo "Anki Analytics is running at $URL. You can close this window."
