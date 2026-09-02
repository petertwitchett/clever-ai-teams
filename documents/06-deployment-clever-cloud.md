# 06 — Deployment on Clever Cloud (Docker)

## 1. Container design

`Dockerfile` (multi-stage):
- **builder**: `python:3.12-slim`, installs the project into `/install` via pip.
- **runtime**: `python:3.12-slim`, non-root `app` user, copies site-packages +
  source + alembic + gunicorn config, `HEALTHCHECK` on `/health`, port **8080**.

`entrypoint.sh`:
1. `alembic upgrade head` (idempotent; app also runs `create_all` as a safety net).
2. `exec gunicorn app.main:app -c gunicorn.conf.py`.

`gunicorn.conf.py` — multi-core model:
- workers = `(2 × CPU cores) + 1`, capped by `MAX_WEB_WORKERS` (default 9),
  overridable with `WEB_CONCURRENCY`;
- `uvicorn.workers.UvicornWorker` (uvloop + httptools);
- `timeout 120`, `graceful_timeout 30`, `keepalive 65` (SSE-friendly);
- `max_requests 2000` (+200 jitter) for worker recycling;
- `preload_app = False` — every worker owns its own event loop, asyncpg pool and
  Redis pool (no cross-fork sharing hazards).

## 2. Required environment variables (Clever Cloud console or CLI)

```bash
clever env set CC_HEALTH_CHECK_PATH "/health"
clever env set DATABASE_URL "postgresql://<user>:<pass>@<host>:6041/<db>"
clever env set REDIS_HOST "<redis-host>"
clever env set REDIS_PORT "40820"
clever env set REDIS_PASSWORD "<redis-pass>"
clever env set SECRET_KEY "<long random string>"       # JWT signing
clever env set ENVIRONMENT "production"
# optional LLM providers (any subset):
clever env set OPENAI_API_KEY "sk-..."
clever env set ANTHROPIC_API_KEY "sk-ant-..."
clever env set GROQ_API_KEY "gsk_..."
clever env set LITELLM_PROXY_URL "https://proxy..."    # routes everything
# optional bootstrap admin:
clever env set BOOTSTRAP_ADMIN_EMAIL "admin@example.com"
clever env set BOOTSTRAP_ADMIN_PASSWORD "<password>"
```

Clever Cloud add-on aliases are auto-detected: `POSTGRESQL_ADDON_URI`,
`REDIS_ADDON_HOST/PORT/PASSWORD` work without any renaming.

If no LLM key is set the platform stays fully functional through the
**deterministic mock provider** (`LLM_ALLOW_MOCK_FALLBACK=true` default) —
useful for infrastructure validation; answers are placeholders.

## 3. Deploying

```bash
# app is already linked (.clever.json)
git add -A && git commit -m "deploy"
clever deploy                      # pushes to the Clever Cloud remote, builds the Dockerfile
clever status                      # instance state
clever logs                        # build + runtime logs (JSON lines from the app)
clever open                        # opens https://<app>.cleverapps.io
```

Verification checklist after deploy:

```bash
BASE=$(clever domain | head -1)
curl -s https://$BASE/health          # {"status":"ok",...}
curl -s https://$BASE/health/ready    # database+redis healthy, worker counts
open https://$BASE/docs               # Swagger UI
```

## 4. Scaling notes

| Axis | Mechanism |
|---|---|
| Vertical | Bigger Clever instance ⇒ more cores ⇒ Gunicorn auto-scales workers `(2N+1)`, still capped by `MAX_WEB_WORKERS` |
| Horizontal | Multiple container instances are safe: all shared state (events, locks, rate limits, working memory, caches) lives in Redis; DB pools are per-worker and bounded |
| DB connections | worst case = instances × workers × (pool 2 + overflow 3); with 225 max_connections keep `instances × workers ≤ 40` |
| SSE behind LB | replay-first subscription makes reconnects lossless; heartbeats every 15 s prevent idle timeouts |

## 5. Operational endpoints

- `/health` — cheap liveness for the platform health check (`CC_HEALTH_CHECK_PATH`).
- `/health/ready` — DB (version, pgvector, pool stats) + Redis + provider matrix.
- Structured JSON logs to stdout (Clever log drain compatible): every request has
  `request_id`, every orchestration log line has `run_id`.

## 6. Known platform constraints

- **No nested Docker** on Clever Cloud Docker apps ⇒ the skill sandbox uses the
  hardened subprocess isolation (AST allowlist + rlimits + import guard +
  timeout). To use Docker/gVisor isolation, deploy on a host with a Docker
  socket and swap the runner in `app/services/sandbox.py`.
- `RLIMIT_NPROC=0` may be unavailable in some container runtimes; the harness
  degrades gracefully (try/except) while keeping memory/CPU/file limits.
- Redis provided without TLS on the given port; set `REDIS_TLS=true` if the
  add-on's TLS port is used instead.
