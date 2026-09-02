# 02 — System Architecture

## 1. High-level topology

```
+----------------------------------------------------------------------------------+
|                          CLIENT SURFACES (future frontends)                      |
|   Canvas Studio (React Flow)                Chat Surface (Next.js)               |
+-------------------|--------------------------------------|-----------------------+
                    | REST (JSON DSL)                      | REST + SSE
+-------------------v--------------------------------------v-----------------------+
|                     FASTAPI GATEWAY  (Docker on Clever Cloud)                    |
|   Gunicorn master -> (2 x cores) + 1 Uvicorn workers (uvloop), cap 9             |
|                                                                                  |
|   /api/v1/auth       JWT + API keys, first-user-is-admin                         |
|   /api/v1/graphs     create / validate / compile / publish (Graph DSL)           |
|   /api/v1/personas   identity, ethics, brain binding, memory limits              |
|   /api/v1/sessions   session lifecycle, message ledger, run history              |
|   /api/v1/chat       command ingestion + SSE event streams + cancel              |
|   /api/v1/skills     Voyager library: register / search / execute (sandbox)      |
|   /api/v1/memory     archival memory append / browse / vector search             |
|   /api/v1/post-mortems  ExpeL job inspection + manual drain                      |
|   /health, /health/ready, /docs, /redoc, /openapi.json                           |
+-------------------|------------------------------|-------------------------------+
                    |                              |
+-------------------v------------------+  +--------v------------------------------+
|      ORCHESTRATION ENGINE            |  |     LIFELONG LEARNING WORKER          |
|  Magentic-One dual ledger:           |  |  asyncio poller + Redis lock          |
|   outer loop: Task Ledger            |  |  ExpeL: trace -> lessons -> memory    |
|   inner loop: Progress Ledger        |  |  Voyager: trace -> skill -> sandbox   |
|   dialectical review over edges      |  |           -> vector catalog           |
|   stall detection -> replanning      |  +---------------------------------------+
|   streaming synthesis                |
+-------------------|------------------+
                    |
+-------------------v---------------------------------------------------------------+
|                              DATA & EXECUTION FABRIC                              |
|  PostgreSQL 18 + pgvector (schema clever_ai)   Redis 8            Sandbox         |
|   users, agent_graphs, person_nodes,           emb cache          python -I -S    |
|   graph_edges, chat_sessions,                  DSL cache          rlimits AS/CPU/ |
|   orchestration_runs, messages,                working memory     NPROC/FSIZE     |
|   agent_memories (HNSW), agent_skills          run event bus      import guard    |
|   (HNSW), skill_executions,                    replay log         timeout + caps  |
|   post_mortem_jobs                             locks, rate limit                  |
+-----------------------------------------------------------------------------------+
```

## 2. Multi-core runtime model

- **Gunicorn master** supervises `(2 × CPU cores) + 1` **Uvicorn workers**
  (`uvicorn.workers.UvicornWorker`, uvloop event loop). Capped by
  `MAX_WEB_WORKERS` (default 9) to bound DB connections; override with
  `WEB_CONCURRENCY`.
- Each worker owns an independent asyncpg pool (2 + 3 overflow) and Redis pool.
  Worst case: 9 × 5 = 45 DB connections against a 225 limit.
- **Cross-worker coordination is Redis-only**: SSE subscribers attach to a run's
  pub/sub channel regardless of which worker executes the run; the learning
  worker uses a Redis `SET NX` lock so only one process drains the queue;
  rate-limit counters are shared.
- CPU-heavy work is delegated to a per-worker `ProcessPoolExecutor`
  (`app/core/executor.py`), keeping event loops non-blocking.
- Worker recycling (`max_requests=2000` + jitter) bounds memory drift.

## 3. Graph JSON DSL (intermediate representation)

Produced by the canvas, validated by the compiler, executed by the orchestrator.

```json
{
  "dsl_version": "1.0",
  "metadata": {"name": "Deep Research Team", "description": "...", "version": 1, "tags": []},
  "orchestrator": {
    "node_key": "orchestrator",
    "stall_limit": 4, "max_steps": 40, "max_milestones": 12,
    "max_review_iterations": 3, "timeout_seconds": 900
  },
  "nodes": [
    {
      "key": "researcher",
      "node_type": "researcher",
      "identity": {"display_name": "Dr. Elena Voss", "professional_role": "Senior Research Specialist",
                   "primary_duty": "Gather, verify and summarize domain research."},
      "persona": {"tone": "analytical", "temperament": "methodical", "cognitive_style": "empirical",
                  "communication_style": "concise", "quirks": ["cites sources compulsively"],
                  "values": ["empirical rigor"], "background_story": "..."},
      "ethics": {"absolute_constraints": ["Never fabricate statistics."],
                 "guardrails": ["Prefer primary sources."], "data_policies": []},
      "brain": {"provider": "openai", "model": "gpt-4o", "temperature": 0.5, "top_p": 1.0, "max_tokens": null},
      "memory": {"working_memory_window": 10, "retrieval_top_k": 5, "lesson_top_k": 5, "skill_top_k": 4},
      "skill_ids": [],
      "position": {"x": 240, "y": 120}
    }
  ],
  "edges": [
    {"source": "orchestrator", "target": "researcher", "channel": "subtask_dispatch", "bidirectional": false},
    {"source": "researcher", "target": "critic", "channel": "dialectical_review", "bidirectional": true}
  ]
}
```

**Compiler rules** (`app/services/graph_compiler.py`):
- exactly one `orchestrator` node, matching `orchestrator.node_key`;
- unique node keys; every edge endpoint must exist; no self-loops;
- every node reachable from the orchestrator (orphan detection);
- at most one `subtask_dispatch` edge per (source, target);
- warning when a `dialectical_review` edge targets a non-critic/verifier;
- warning when the graph has no review channel at all.

Errors keep the graph in `draft` with `compilation_errors` recorded; success
rebuilds `person_nodes`/`graph_edges`, bumps `version`, sets `compiled`.

## 4. Persona assembly (5-priority pipeline)

Per invocation (`app/services/persona.py`):

| Priority | Layer | Source |
|---|---|---|
| P0 | Immutable constitution | `person_nodes.constitutional_constraints` |
| P1 | Identity & psyche | identity columns + `persona_traits` JSONB |
| P2 | ExpeL lessons (top-k) | `agent_memories` where `memory_type=lesson`, cosine ranked |
| P3 | Voyager skills (top-k) | `agent_skills` docstring embeddings, cosine ranked |
| P4 | Working context | ledger status + directive + Redis dialogue buffer |

Outputs are audited by the **constitutional interceptor** (cheap lexical screen
+ LLM compliance audit). Violations trigger up to 2 corrective re-prompts, then
a explicit refusal message.

## 5. Orchestration lifecycle

```
user command -> POST /chat/{session}/messages
  -> Message(user) + OrchestrationRun(pending) persisted, background task started
  -> PLANNING   : orchestrator brain emits Task Ledger JSON (facts, hypotheses, milestones)
  -> EXECUTING  : for each milestone
       dispatch directive to assigned specialist (persona-assembled invocation)
       specialist may call sandboxed skills ({"action":"use_skill", ...} loop)
       dialectical review by nodes on review edges -> approved / revision_requested
       revision loop until approved or max_review_iterations
  -> stall detection: consecutive failures >= stall_limit -> REPLANNING (max 2)
       verified milestones kept, pending tail replaced, hypotheses revised
  -> SYNTHESIZING: orchestrator streams final answer (final_chunk frames)
  -> COMPLETED  : ledgers + final response persisted, PostMortemJob queued
```

**SSE frames** (`event:` field): `run_started`, `plan_created`, `ledger_update`,
`subtask_dispatch`, `agent_thinking`, `agent_debate`, `tool_call`, `tool_result`,
`review_verdict`, `milestone_complete`, `stall_detected`, `replan`,
`final_chunk`, `run_completed`, `error`, `heartbeat`.

## 6. Tiered memory

| Tier | Store | Contents | Access |
|---|---|---|---|
| Working | Redis lists (`cat:wm:{session}:{node}`) | recent dialogue turns per node | O(1) push/trim, 6h TTL |
| Relational recall | PostgreSQL `messages` | every communication event, tokens, latency, cost | SQL, immutable |
| Semantic archival | PostgreSQL `agent_memories` + HNSW | facts, experiences, preferences, ExpeL lessons | cosine top-k, importance & access stats |

## 7. Sandbox security model

Layers (in `app/services/sandbox.py`):
1. **AST screening** — import allowlist (math/json/re/datetime/statistics/...),
   forbidden calls (`eval`, `exec`, `open`, `__import__`, ...), forbidden dunder
   attribute access, no `global`/`nonlocal`.
2. **Process isolation** — `python -I -S` subprocess, empty env, temp workdir,
   `RLIMIT_AS` (512 MB), `RLIMIT_CPU`, `RLIMIT_NPROC=0` (no forking),
   `RLIMIT_FSIZE` (1 MB), stripped builtins (`open`, `input`, `breakpoint`),
   guarded `__import__` with pre-imported allowlist.
3. **Parent supervision** — wall-clock timeout with kill, stdout/stderr caps,
   JSON result marshalling via a sentinel marker.

On self-managed hosts this can be swapped for Docker/gVisor; on Clever Cloud
Docker apps nested containers are unavailable, so this hardened-subprocess
strategy is the deployed configuration.

## 8. LLM provider abstraction

`app/services/llm_gateway.py` resolves each node's `(provider, model)`:
1. If `LITELLM_PROXY_URL` is set → all traffic through the proxy.
2. Else explicit provider with configured key → prefixed LiteLLM model string.
3. Else first configured provider (openai → anthropic → groq → deepseek →
   openrouter → gemini → ollama).
4. Else deterministic **mock provider** (if `LLM_ALLOW_MOCK_FALLBACK=true`) so
   the entire platform remains testable without keys.

Embeddings (`app/services/embeddings.py`) use the same pattern with a Redis
cache (7-day TTL) and a deterministic hash-projection fallback that keeps
pgvector search functional offline.
