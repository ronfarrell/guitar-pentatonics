#!/usr/bin/env bash
set -euo pipefail

PIDFILE="/tmp/guitar-pentatonics-backend.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")"
  rm -f "$PIDFILE"
  echo "Backend stopped."
else
  echo "Backend not running."
  rm -f "$PIDFILE"
fi
