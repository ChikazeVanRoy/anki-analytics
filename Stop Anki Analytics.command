#!/bin/zsh
# Double-click in Finder to stop the dashboard started by "Anki Analytics.command".

PORT=${PORT:-5174}
pids=$(lsof -ti tcp:$PORT -sTCP:LISTEN)
if [[ -n $pids ]]; then
  echo $pids | xargs kill
  echo "Anki Analytics has stopped. You can close this window."
else
  echo "Anki Analytics wasn't running. You can close this window."
fi
