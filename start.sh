#!/bin/bash

cleanup() {
    echo ""
    echo "Stopping services..."

    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null

    wait $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
}

trap cleanup EXIT INT TERM

echo "Starting backend..."

(
    cd backend
    source .venv/bin/activate
    uvicorn app.main:app --reload
) &
BACKEND_PID=$!

echo "Starting frontend..."

(
    cd frontend
    npm run dev
) &
FRONTEND_PID=$!

echo ""
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both services"

wait