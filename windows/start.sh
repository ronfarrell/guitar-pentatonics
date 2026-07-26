#!/usr/bin/env bash
# Starts the backend directly (no Docker — keeps GPU-accelerated Torch/Essentia/
# Demucs) and opens the app in a chromeless Edge window, launched from Windows
# via a Desktop shortcut (see windows/install-shortcuts.ps1).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting Guitar Pentatonics..."
"$REPO/windows/run_backend.sh"

echo "Waiting for the backend to become ready..."
READY=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://localhost:8010/health/" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" != "1" ]; then
  echo "Backend didn't come up in time — check /tmp/guitar-pentatonics-backend.log for details."
  exit 1
fi

echo "Ready. Opening the app..."

# Open as a chromeless "app window" (no address bar/tabs) via Edge or Chrome
# so it reads as a standalone app rather than a browser tab. Falls back to
# the default browser if neither is installed. Uses its own profile dir so
# it doesn't touch the user's normal browser session, and remembers window
# size/position between launches like a real app would.
powershell.exe -NoProfile -Command '
  $ErrorActionPreference = "SilentlyContinue"
  $profileDir = "$env:LOCALAPPDATA\GuitarPentatonicsApp"
  $edge = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" | Select-Object -ExpandProperty "(default)"
  $chrome = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" | Select-Object -ExpandProperty "(default)"
  $browser = if ($edge) { $edge } elseif ($chrome) { $chrome } else { $null }
  if ($browser) {
    Start-Process -FilePath $browser -ArgumentList "--app=http://localhost:8010/", "--user-data-dir=$profileDir"
  } else {
    Start-Process "http://localhost:8010/"
  }
' >/dev/null 2>&1 || true
