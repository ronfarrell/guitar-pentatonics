@echo off
title Guitar Pentatonics
wsl.exe -d Ubuntu-26.04 -- bash -lc "/home/ron/guitar-pentatonics/windows/start.sh"
if errorlevel 1 (
    echo.
    echo Something went wrong starting the app. Check /tmp/guitar-pentatonics-backend.log inside WSL for details.
    pause
)
