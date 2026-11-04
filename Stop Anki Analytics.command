#!/bin/zsh
# Double-click in Finder to stop the dashboard started by "Anki Analytics.command".

cd "${0:A:h}" || exit 1
PORT=${ANKI_ANALYTICS_PORT:-5174}
PIDFILE=data/.server.pid
listening=$(lsof -ti tcp:$PORT -sTCP:LISTEN)

if [[ -f $PIDFILE && -n $listening && $listening == $(<$PIDFILE) ]]; then
  kill $listening
  rm -f $PIDFILE
  echo "Anki Analytics has stopped. You can close this window."
elif [[ -n $listening ]]; then
  echo "Something else is using port $PORT (perhaps npm run dev), so it was left running."
else
  rm -f $PIDFILE
  echo "Anki Analytics wasn't running. You can close this window."
fi
