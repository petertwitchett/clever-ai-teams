# 03 — Database Schema

All application tables live in the dedicated PostgreSQL schema **`clever_ai`**
(the shared database also hosts unrelated PostGIS/tiger tables in `public`).
Migrations are managed by Alembic (`alembic upgrade head`, run automatically by
the container entrypoint). Every table has UUID primary keys
(`gen_random_uuid()` server default), timezone-aware `created_at`/`updated_at`,
and a JSONB `metadata` bag.

## Entity relationship overview

```
users 1--* agent_graphs 1--* person_nodes 1--* agent_memories (vector 1536, HNSW)
                        1--* graph_edges              1--* agent_skills (vector 1536, HNSW)
users 1--* chat_sessions *--1 agent_graphs                 1--* skill_executions
chat_sessions 1--* orchestration_runs 1--* messages
orchestration_runs 1--1 post_mortem_jobs
```

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | varchar(255) unique | login identity |
| hashed_password | varchar(255) | bcrypt over SHA-256 prehash |
| full_name | varchar(255) null | |
| role | varchar(32) | `admin` / `operator` / `user` (first registered account → admin) |
| is_active | bool | |
| api_key | varchar(128) unique null | `X-API-Key` auth |

### agent_graphs
| Column | Type | Notes |
|---|---|---|
| name, description | varchar(128), text | |
| owner_id | uuid FK users | |
| status | varchar(32) | `draft` → `compiled` → `published` → `archived` |
| dsl | jsonb | full GraphDSL document |
| canvas_layout | jsonb | raw canvas state (round-trip for the studio) |
| compiled_at | timestamptz null | |
| compilation_errors | jsonb list | populated on failed compile |
| version | int | bumped on every successful compile |
| max_steps, stall_limit, timeout_seconds | int | orchestrator limits |
| is_public, is_template | bool | |

### person_nodes
| Column | Type | Notes |
|---|---|---|
| graph_id | uuid FK | unique with `node_key` |
| node_key | varchar(64) | DSL key, `^[a-z][a-z0-9_-]{1,62}$` |
| node_type | varchar(32) | orchestrator / specialist / critic / researcher / developer / verifier / synthesizer |
| display_name, professional_role | varchar(128) | identity block |
| primary_duty | text | |
| persona_traits | jsonb | tone, temperament, cognitive_style, quirks, values, background_story |
| constitutional_constraints | jsonb list | P0 layer |
| llm_provider, llm_model | varchar null | brain binding (null → gateway default) |
| temperature, top_p | float | sampling |
| max_tokens | int null | |
| working_memory_window, memory_retrieval_k | int | memory config |
| assigned_skill_ids | jsonb list | pre-assigned skills |
| position_x, position_y | float | canvas coordinates |

### graph_edges
| Column | Type | Notes |
|---|---|---|
| graph_id, source_node_id, target_node_id | uuid FK | |
| channel | varchar(32) | subtask_dispatch / dialectical_review / peer_collaboration / escalation / synthesis |
| bidirectional | bool | debate channels |
| conditions | jsonb | optional activation conditions |

### chat_sessions
| Column | Type | Notes |
|---|---|---|
| user_id, graph_id | uuid FK | |
| title | varchar(255) | |
| status | varchar(32) | active / idle / archived |
| total_input_tokens, total_output_tokens | int | accounting |
| total_cost_usd | float | |
| last_message_at | timestamptz | ordering |

### orchestration_runs
| Column | Type | Notes |
|---|---|---|
| session_id | uuid FK | |
| user_message_id | uuid FK messages (use_alter) | the triggering command |
| status | varchar(32) | pending/planning/executing/reviewing/replanning/synthesizing/completed/failed/cancelled/timeout |
| task_ledger | jsonb | goal, facts, hypotheses, milestones[], stall_count |
| progress_ledger | jsonb | current_milestone_id, completed[], failed[] |
| step_count, stall_count, replan_count | int | |
| started_at, completed_at, duration_ms | | |
| input_tokens, output_tokens, cost_usd | | |
| final_response, error_message | text | |

Milestone object (inside `task_ledger.milestones[]`):
`{id, title, description, assigned_node, verification_criteria, status, artifact, review_iterations}` —
status: pending / in_progress / under_review / verified / rejected / skipped / failed.

### messages (immutable ledger)
| Column | Type | Notes |
|---|---|---|
| session_id, run_id | uuid FK | |
| role | varchar(32) | user / assistant / agent / orchestrator / system / tool / critic |
| sender_node_id, recipient_node_id | uuid FK person_nodes null | |
| content | text | |
| structured_data | jsonb | directives, skill calls, verdicts, ledger snapshots |
| event_type | varchar(48) | mirrors SSE frame types |
| milestone_id | varchar(64) null | |
| model_used | varchar(128) null | |
| input_tokens, output_tokens, latency_ms, cost_usd | | performance accounting |

### agent_memories (semantic archival tier)
| Column | Type | Notes |
|---|---|---|
| node_id | uuid FK | owner person node |
| memory_type | varchar(32) | core / archival / lesson / experience / fact / preference |
| content | text | |
| embedding | **vector(1536)** | HNSW index (`m=16, ef_construction=64`, cosine) |
| source_run_id, source_session_id | uuid FK null | provenance |
| importance | float | 0..1 |
| access_count, last_accessed_at | | retrieval bookkeeping |

### agent_skills (Voyager library)
| Column | Type | Notes |
|---|---|---|
| node_id | uuid FK null | null = shared library skill |
| name | varchar(128) | unique with (node_id, version) |
| description | text | docstring — the embedded retrieval text |
| code | text | AST-validated Python source |
| entrypoint | varchar(128) | default `run` |
| parameters_schema | jsonb | JSON argument schema |
| status | varchar(32) | candidate → verified / deprecated / quarantined |
| embedding | **vector(1536)** | HNSW cosine index |
| origin_run_id | uuid null | Voyager provenance |
| version, usage_count, success_count, failure_count, avg_latency_ms, last_used_at, is_builtin | | statistics drive auto-promotion (3 successes) and quarantine (5 failures) |

### skill_executions (sandbox audit)
`skill_id, node_id, run_id, arguments jsonb, success bool, stdout, stderr, result jsonb, duration_ms`

### post_mortem_jobs (ExpeL queue)
`run_id unique, status (queued/processing/completed/failed/skipped), attempts,
lessons_extracted, skills_compiled, error_message, completed_at, result jsonb`

## Indexing strategy

- HNSW cosine indexes on both `embedding` columns — sub-millisecond ANN lookups.
- Composite b-trees on the hot paths: `(session_id, created_at)`,
  `(run_id, created_at)`, `(node_id, memory_type)`, `(node_id, status)`,
  `(owner_id, status)`, `(user_id, status)`.
- `alembic_version` lives in `clever_ai` too (`version_table_schema`).

## Connection budget

| Parameter | Value |
|---|---|
| DB `max_connections` | 225 |
| Pool per worker | 2 persistent + 3 overflow |
| Web workers (cap) | 9 |
| Worst-case app connections | 45 |
