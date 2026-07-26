#!/usr/bin/env bash
# Stops the backend. Analyzed songs and cache are untouched (they live in backend/data).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$REPO/windows/stop_backend.sh"
