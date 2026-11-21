#!/usr/bin/env bash
# Stops the API and the page started by start.sh.
cd "$(dirname "$0")"
DATA="${DATA_DIR:-$PWD/data}"

stop() {
  local name="$1" port="$2"
  if [ -f "$DATA/$name.pid" ]; then
    pkill -P "$(cat "$DATA/$name.pid")" 2>/dev/null
    kill "$(cat "$DATA/$name.pid")" 2>/dev/null
    rm -f "$DATA/$name.pid"
  fi
  # npm starts child processes; free the port if anything is still listening.
  local left
  left="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$left" ] && kill $left 2>/dev/null
  echo "$name stopped"
}

stop server 8770
stop web 5180
