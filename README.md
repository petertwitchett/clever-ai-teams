# Clever AI Team — Backend

Multi-agent AI orchestration platform: design expert teams as visual graphs of
**person nodes** (identity, morals, psyche, LLM brain, memory, skills), then
chat with the whole team through one conversational API with real-time
observability.

- **FastAPI** gateway with OpenAPI/Swagger at `/docs`, running on **all CPU
  cores** (Gunicorn `(2×N)+1` Uvicorn workers).
- **Magentic-One** dual-ledger orchestration (Task Ledger + Progress Ledger),
  dialectical peer review, stall detection and replanning.
- **PostgreSQL + pgvector** (HNSW) for relational history, archival memory and
  the Voyager skill library; **Redis** for caching, working memory, run event
  bus, locks and rate limiting.
- **Lifelong learning**: sandboxed executable skills (Voyager) + post-mortem
  reflection lessons (ExpeL).
- Fully **dockerized**, deployed on **Clever Cloud**.

## Quick start (local)

```bash
uv venv --python 3.12 .venv
uv pip install -p .venv/bin/python -e ".[dev]"
cp .env.example .env       # fill DATABASE_URL / REDIS_* / SECRET_KEY
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --port 8099
# then open http://127.0.0.1:8099/docs
.venv/bin/python tests/smoke_e2e.py    # 24-check end-to-end suite
```

## Deploy (Clever Cloud)

```bash
clever env set CC_HEALTH_CHECK_PATH /health
clever env set DATABASE_URL "postgresql://..."
clever env set REDIS_HOST "..." ; clever env set REDIS_PORT "..." ; clever env set REDIS_PASSWORD "..."
clever env set SECRET_KEY "$(openssl rand -hex 32)"
clever deploy
```

## Documentation

| Doc | Contents |
|---|---|
| [documents/01-implementation-plan.md](documents/01-implementation-plan.md) | Phase plan, constraints, requirement traceability |
| [documents/02-architecture.md](documents/02-architecture.md) | Topology, multi-core model, DSL, persona pipeline, sandbox |
| [documents/03-database-schema.md](documents/03-database-schema.md) | All tables, vector indexes, connection budget |
| [documents/04-api-reference.md](documents/04-api-reference.md) | Every endpoint, SSE frame catalogue, curl walkthrough |
| [documents/05-orchestration-engine.md](documents/05-orchestration-engine.md) | Dual-ledger control flow, review, learning loops |
| [documents/06-deployment-clever-cloud.md](documents/06-deployment-clever-cloud.md) | Container design, env vars, scaling |
| [documents/07-verification-and-testing.md](documents/07-verification-and-testing.md) | Smoke suite results, verification matrix |

## Project layout

```
app/
  core/       settings, DB engine, Redis, security, logging, errors, executor
  models/     SQLAlchemy ORM (11 tables, pgvector columns)
  schemas/    Pydantic v2 API schemas + Graph JSON DSL
  services/   graph compiler, LLM gateway, embeddings, memory, persona,
              sandbox, skills, agent runtime, orchestrator, event bus
  workers/    ExpeL/Voyager lifelong-learning background worker
  api/v1/     auth, graphs, personas, sessions, chat (SSE), skills, memory, health
alembic/      migrations (applied to the live database)
tests/        end-to-end smoke suite
documents/    full documentation set
Dockerfile, gunicorn.conf.py, entrypoint.sh
```
