# syntax=docker/dockerfile:1

# -------------------------------------------------------- frontend build stage
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
RUN npm run build

# --------------------------------------------------------- python build stage
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

COPY pyproject.toml README.md ./
COPY app ./app

RUN pip install --prefix=/install .

# -------------------------------------------------------------- runtime stage
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LITELLM_LOCAL_MODEL_COST_MAP=True \
    PORT=8080 \
    STATIC_DIR=/srv/static

RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /srv

COPY --from=builder /install /usr/local
COPY --from=frontend-builder /app/frontend/out /srv/static
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini gunicorn.conf.py entrypoint.sh ./

RUN chmod +x entrypoint.sh && chown -R app:app /srv

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PORT\",\"8080\")}/health', timeout=4)" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
