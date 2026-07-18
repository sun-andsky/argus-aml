#!/bin/bash
# Starts both the FastAPI server and Celery worker in one process group.
# Used on Render free tier where only one web service is allowed.
# On local Docker Compose or paid Render plans, run them as separate services.

set -e

echo "[start.sh] Starting Celery worker in background..."
celery -A app.celery_app worker --loglevel=info --concurrency=1 &
CELERY_PID=$!

echo "[start.sh] Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} &
API_PID=$!

# If either process dies, kill the other and exit so Render restarts the service
wait -n $CELERY_PID $API_PID
EXIT_CODE=$?

echo "[start.sh] A process exited (code $EXIT_CODE) — shutting down both"
kill $CELERY_PID $API_PID 2>/dev/null
exit $EXIT_CODE
