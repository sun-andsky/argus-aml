#!/bin/bash
# start.sh — used on Render free tier to run API + worker in one service
# Downloads model files first, then starts both processes.

set -e

echo "[start.sh] Downloading model artifacts..."
bash /app/download_models.sh

echo "[start.sh] Starting Celery worker in background..."
celery -A app.celery_app worker --loglevel=info --concurrency=1 &
CELERY_PID=$!

echo "[start.sh] Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} &
API_PID=$!

# If either process exits, kill the other so Render restarts the whole service
wait -n $CELERY_PID $API_PID
EXIT_CODE=$?
echo "[start.sh] A process exited (code $EXIT_CODE) — shutting down"
kill $CELERY_PID $API_PID 2>/dev/null
exit $EXIT_CODE
