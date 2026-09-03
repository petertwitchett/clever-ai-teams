#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
alembic upgrade head || echo "[entrypoint] WARNING: migrations failed; app will attempt create_all at startup"

WORKER_MODE="${WORKER_MODE:-sidecar}"

if [ "$WORKER_MODE" = "worker" ] || [ "$1" = "worker" ]; then
    # Dedicated worker container (external mode): run only the ARQ worker.
    echo "[entrypoint] Starting dedicated ARQ learning worker..."
    exec python -m app.worker
fi

if [ "$WORKER_MODE" = "sidecar" ]; then
    echo "[entrypoint] Starting ARQ learning worker (sidecar)..."
    python -m app.worker &
    WORKER_PID=$!
    trap 'kill -TERM $WORKER_PID 2>/dev/null || true' TERM INT
fi

echo "[entrypoint] Starting Gunicorn with multi-core Uvicorn workers..."
exec gunicorn app.main:app -c gunicorn.conf.py
