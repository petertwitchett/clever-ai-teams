#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
alembic upgrade head || echo "[entrypoint] WARNING: migrations failed; app will attempt create_all at startup"

echo "[entrypoint] Starting Gunicorn with multi-core Uvicorn workers..."
exec gunicorn app.main:app -c gunicorn.conf.py
