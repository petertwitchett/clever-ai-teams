# 07 — Verification & Testing

## 1. End-to-end smoke test

`tests/smoke_e2e.py` exercises the full lifecycle against a running instance
(local or deployed) using the **real** PostgreSQL + Redis add-ons:

```bash
.venv/bin/python tests/smoke_e2e.py http://127.0.0.1:8099     # local
.venv/bin/python tests/smoke_e2e.py https://<app>.cleverapps.io  # deployed
```

### Latest local result — 24 / 24 passed

| # | Check | Verifies |
|---|---|---|
| 1 | readiness | DB (pgvector 0.8.5) + Redis healthy |
| 2–3 | register, login | auth, bcrypt, JWT issuance |
| 4 | dsl validate | dry-run compiler, zero errors on the reference team |
| 5–6 | graph create+compile, nodes materialized | DSL → 3 person_nodes + 3 graph_edges, status `compiled` |
| 7 | persona patch | brain-binding update via /personas |
| 8 | skill register | AST validation + docstring embedding |
| 9 | skill sandbox execute | subprocess isolation; correct stats result (`mean=22.0`) |
| 10 | skill vector search | pgvector cosine retrieval of the skill |
| 11 | forbidden skill rejected | `import os` blocked with HTTP 422 |
| 12–13 | memory append + vector search | archival memory write & cosine recall |
| 14 | session create | graph-bound session |
| 15 | chat command accepted | run creation + background execution |
| 16–18 | run completed, task ledger populated, final response | full dual-ledger cycle |
| 19 | event history | replay log: `run_started` … `run_completed` |
| 20–21 | SSE stream opened + frames received | live dual-stream: `plan_created`, `ledger_update`, `agent_thinking`, `agent_debate`, `review_verdict`, `milestone_complete`, `final_chunk`, `heartbeat` |
| 22 | message ledger | immutable trace (10 messages for 2 runs) |
| 23 | post-mortem drain guarded | admin-only guard (403 for regular users) |
| 24 | post-mortem jobs listed | ExpeL queue rows created per run |

## 2. Sandbox unit checks (executed during development)

| Scenario | Result |
|---|---|
| `math.sqrt` skill happy path | success, 24 ms |
| Dynamic `__import__("math")` inside sandbox | allowed (allowlist) |
| `import os` (static) | AST rejection before execution |
| Infinite loop | killed at CPU limit (SIGKILL), reported as timeout |
| Import outside allowlist at runtime | `ImportError` from the guard |

## 3. Verification matrix vs. specification

| Subsystem | Spec target | Status |
|---|---|---|
| Multi-core gateway | Load spread across (2N+1) workers | Gunicorn config deployed; worker counts surfaced in `/health/ready`. Load-test with `k6`/`locust` against the deployed URL as a follow-up. |
| Constitutional guardrails | Violations intercepted | Interceptor + recovery loop implemented; lexical screen active even in mock mode; LLM audit active with a real provider. |
| Magentic-One ledgers | Stall flagged at limit, replanning | Implemented + smoke-verified (plan → execute → review → synthesize). Stall path unit-verified via bounded review retries. |
| Dialectical review | ≥1 review cycle before acceptance | `review_verdict` frames observed in SSE stream (critic node reviewed the researcher's artifact). |
| Dynamic skill execution | compile+run+index < 8 s | Register+embed ≈ 1 s, sandbox run ≈ 25 ms locally. |
| Lifelong refinement | Lessons extracted post-run | Post-mortem jobs queued per run; with a real LLM key, lessons/skills are written (mock mode records the queue processing). |

## 4. Running with a real LLM

Set any provider key and re-run the smoke test — the same flow then produces
real plans, real critiques, real lessons:

```bash
clever env set OPENAI_API_KEY "sk-..."   # or ANTHROPIC_API_KEY / GROQ_API_KEY / OLLAMA_BASE_URL
clever restart
```

Per-node brains are chosen in the DSL (`brain.provider` / `brain.model`), e.g.
orchestrator on `gpt-4o` and specialists on `groq/llama-3.3-70b-versatile`.

## 5. Local development

```bash
uv venv --python 3.12 .venv
uv pip install -p .venv/bin/python -e ".[dev]"
cp .env.example .env                      # fill in credentials
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --port 8099 --reload
.venv/bin/python tests/smoke_e2e.py
```
