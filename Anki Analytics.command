#!/bin/zsh
# Double-click in Finder to start the dashboard and open it in the browser.
# Keep this window open while you use it; close it (or press Ctrl+C) to stop.

cd "${0:A:h}" || exit 1
URL=http://localhost:5173

fail() {
  echo "\n$1"
  read -s -k '?Press any key to close.'
  exit 1
}

# Already running (e.g. double-clicked twice): just show it
if curl -sf -o /dev/null $URL; then
  open $URL
  exit 0
fi

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

# Stop the API and the app together when this window closes
trap 'trap - EXIT INT TERM HUP; kill 0' EXIT INT TERM HUP

# Open the browser once the app answers
( for _ in {1..120}; do curl -sf -o /dev/null $URL && { open $URL; exit }; sleep 0.5; done ) &

echo "Starting Anki Analytics at $URL ..."
npm run dev
