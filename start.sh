#!/usr/bin/env bash
# Starts the API (127.0.0.1:8770) and the page (127.0.0.1:5180). Pids and logs go under data/.
set -euo pipefail
cd "$(dirname "$0")"
DATA="${DATA_DIR:-$PWD/data}"
mkdir -p "$DATA"

for side in server web; do
  if [ ! -d "$side/node_modules" ]; then
    echo "Installing $side dependencies"
    npm --prefix "$side" install
  fi
done

start() {
  local name="$1"; shift
  if [ -f "$DATA/$name.pid" ] && kill -0 "$(cat "$DATA/$name.pid")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$DATA/$name.pid"))"
    return
  fi
  nohup "$@" > "$DATA/$name.log" 2>&1 &
  echo $! > "$DATA/$name.pid"
  echo "$name started (pid $!), log $DATA/$name.log"
}

start server npm --prefix server run start
start web npm --prefix web run dev

echo "Page: http://127.0.0.1:5180"
