# 04 — API Reference

Interactive documentation: **`/docs`** (Swagger UI) and **`/redoc`** (ReDoc);
raw spec at `/openapi.json` (OpenAPI 3.1). Base prefix: **`/api/v1`**.

## Authentication

Two interchangeable mechanisms on every protected endpoint:
- `Authorization: Bearer <JWT>` — from `POST /api/v1/auth/login` (24h lifetime).
- `X-API-Key: <key>` — from `POST /api/v1/auth/api-key`.

The **first registered account is granted the `admin` role** automatically.
A bootstrap admin can also be created from env (`BOOTSTRAP_ADMIN_EMAIL` /
`BOOTSTRAP_ADMIN_PASSWORD`).

Rate limiting: 240 requests / 60 s / user / router group (Redis fixed window,
HTTP 429 on breach). Errors use a stable envelope:

```json
{"error": {"code": "not_found", "message": "...", "details": ..., "request_id": "..."}}
```

## System

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness (no dependency checks) |
| GET | `/health/ready` | Deep readiness: PostgreSQL + pgvector version, Redis, provider & worker info |

## Authentication — `/api/v1/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/register` | Create account (`email`, `password`, `full_name?`) → 201 UserOut |
| POST | `/login` | → `{access_token, token_type, expires_in}` |
| GET | `/me` | Current profile |
| POST | `/api-key` | Issue/rotate personal API key (shown once) |

## Canvas Graph Management — `/api/v1/graphs`

| Method | Path | Description |
|---|---|---|
| POST | `` | Create graph; optional inline `dsl` compiles immediately → GraphDetailOut |
| GET | `` | Paginated list (`status`, `include_public`, `limit`, `offset`) |
| GET | `/{id}` | Graph with materialized nodes and edges |
| PATCH | `/{id}` | Update name/description/layout/visibility |
| DELETE | `/{id}` | Delete graph (cascades nodes/edges) |
| POST | `/validate` | **Dry-run** DSL validation; returns issues without persisting |
| POST | `/{id}/compile` | Validate + materialize nodes/edges + bump version → GraphCompileResponse |
| POST | `/{id}/publish` | `compiled` → `published` |

Compiler issue codes: `duplicate_node_key`, `orchestrator_count`,
`orchestrator_key_mismatch`, `unknown_edge_endpoint`, `duplicate_dispatch_edge`,
`review_target_role` (warning), `orphan_node`, `no_review_channel` (warning).

## Persona Configuration — `/api/v1/personas`

| Method | Path | Description |
|---|---|---|
| GET | `/{node_id}` | Full person node configuration |
| GET | `/by-graph/{graph_id}` | All person nodes of a graph |
| PATCH | `/{node_id}` | Patch identity / persona traits / constitution / brain (provider, model, temperature, top_p, max_tokens) / memory limits / skills / position |

## Chat Session Lifecycle — `/api/v1/sessions`

| Method | Path | Description |
|---|---|---|
| POST | `` | Open session bound to a compiled graph (`graph_id`, `title?`) |
| GET | `` | Paginated list of my sessions |
| GET | `/{id}` | Session with token/cost accounting |
| PATCH | `/{id}` | Rename / archive |
| DELETE | `/{id}` | Delete session + history |
| GET | `/{id}/messages` | Immutable ledger (`include_internal=false` → user-visible only) |
| GET | `/{id}/runs` | Orchestration run history |

## Real-Time Chat & Streaming — `/api/v1/chat`

| Method | Path | Description |
|---|---|---|
| POST | `/{session_id}/messages` | Submit command. `stream=true` (default) → **SSE stream**; `stream=false` → RunOut immediately |
| GET | `/runs/{run_id}` | Run inspection: status, both ledgers, tokens, final response |
| GET | `/runs/{run_id}/events` | Attach/re-attach to the live SSE stream (replays history first) |
| GET | `/runs/{run_id}/events/history` | Recorded frames as JSON |
| POST | `/runs/{run_id}/cancel` | Cancel an executing run |

### SSE frame catalogue

| Event | Payload highlights |
|---|---|
| `run_started` | goal, graph name, team size |
| `plan_created` | full task_ledger |
| `ledger_update` | task_ledger + progress_ledger snapshots |
| `subtask_dispatch` | milestone id/title, assigned node |
| `agent_thinking` | node, directive, skills/lessons injected |
| `agent_debate` | node, content, skill call count, tokens |
| `tool_call` / `tool_result` | skill id, arguments / success, duration |
| `review_verdict` | reviewer, producer, verdict, critique |
| `milestone_complete` | milestone id/title |
| `stall_detected` | milestone id, stall count |
| `replan` | replan count |
| `final_chunk` | `delta` — streamed synthesis text |
| `run_completed` | status, duration, tokens, cost, final_response |
| `error` | message |
| `heartbeat` | keep-alive (15 s idle) |

## Lifelong Learning: Skills — `/api/v1/skills`

| Method | Path | Description |
|---|---|---|
| POST | `` | Register skill (AST-validated, embedded). Node-owned: graph owner; shared: admin |
| GET | `` | Paginated list (`node_id`, `status`) |
| GET | `/{id}` | Skill with code + statistics |
| DELETE | `/{id}` | Deprecate |
| POST | `/search` | Vector similarity search over docstrings |
| POST | `/{id}/execute` | Sandbox execution with arguments → result/stdout/stderr/duration |

## Lifelong Learning: Reflection — `/api/v1/post-mortems`

| Method | Path | Description |
|---|---|---|
| GET | `` | ExpeL job list (status, lessons_extracted, skills_compiled) |
| POST | `/drain` | Admin: process the queue immediately |

## Agent Memory — `/api/v1/memory`

| Method | Path | Description |
|---|---|---|
| POST | `/nodes/{node_id}` | Append memory (embeds content; `memory_type`, `importance`) |
| GET | `/nodes/{node_id}` | Browse memories (`memory_type` filter, pagination) |
| POST | `/nodes/{node_id}/search` | Cosine similarity search (`query`, `top_k`, `memory_type?`) |
| DELETE | `/{memory_id}` | Delete a memory entry |

## Typical end-to-end flow (curl)

```bash
BASE=https://<app>.cleverapps.io

# 1. register + login
curl -s $BASE/api/v1/auth/register -d '{"email":"admin@x.io","password":"secret123"}' -H 'content-type: application/json'
TOKEN=$(curl -s $BASE/api/v1/auth/login -d '{"email":"admin@x.io","password":"secret123"}' -H 'content-type: application/json' | jq -r .access_token)
AUTH="Authorization: Bearer $TOKEN"

# 2. create + compile a team graph (DSL inline)
GRAPH=$(curl -s $BASE/api/v1/graphs -H "$AUTH" -H 'content-type: application/json' -d @team-dsl.json | jq -r .id)

# 3. open a session
SESSION=$(curl -s $BASE/api/v1/sessions -H "$AUTH" -H 'content-type: application/json' -d "{\"graph_id\":\"$GRAPH\"}" | jq -r .id)

# 4. send a command and watch the team work (SSE)
curl -N $BASE/api/v1/chat/$SESSION/messages -H "$AUTH" -H 'content-type: application/json' \
     -d '{"content":"Research the current state of multi-agent AI systems.","stream":true}'
```
