#!/usr/bin/env bash
# Starts the FastAPI backend directly against the project's existing venv —
# no Docker. Keeps GPU-accelerated Torch/Essentia/Demucs exactly as already
# set up, and serves the built frontend itself (see app/main.py).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO/backend"

PIDFILE="/tmp/guitar-pentatonics-backend.pid"
LOGFILE="/tmp/guitar-pentatonics-backend.log"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Backend already running (pid $(cat "$PIDFILE"))"
  exit 0
fi

if [ ! -x ".venv/bin/uvicorn" ]; then
  echo "No .venv found in backend/ — set it up first (see README: Run locally)."
  exit 1
fi

setsid nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8010 \
  </dev/null >"$LOGFILE" 2>&1 &
disown

echo $! > "$PIDFILE"
echo "Backend starting (pid $!) — log: $LOGFILE"
