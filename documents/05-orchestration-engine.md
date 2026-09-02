# 05 — Orchestration Engine (Magentic-One Dual Ledger)

Implementation: `app/services/orchestrator.py`, `app/services/agent_runtime.py`,
`app/services/persona.py`, `app/services/event_bus.py`.

## 1. Control flow

```
                     User command (POST /chat/{session}/messages)
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │        OUTER PLANNING LOOP          │
                    │           (Task Ledger)             │
                    │ orchestrator brain → JSON plan:     │
                    │   facts[], hypotheses[],            │
                    │   milestones[{id,title,description, │
                    │     assigned_node, verification}]   │
                    └───────────────────┬─────────────────┘
                                        │  next pending milestone
                                        ▼
                    ┌─────────────────────────────────────┐
                    │        INNER EXECUTION LOOP         │
                    │          (Progress Ledger)          │
                    │ 1 persona-assembled directive to    │
                    │   the assigned specialist           │
                    │ 2 specialist may invoke sandboxed   │
                    │   skills ({"action":"use_skill"})   │
                    │ 3 artifact produced                 │
                    └───────────────────┬─────────────────┘
                                        ▼
                    ┌─────────────────────────────────────┐
                    │         DIALECTICAL REVIEW          │
                    │ reviewers = dialectical_review      │
                    │ edges of the producer               │
                    │ verdict JSON: approved /            │
                    │ revision_requested (+critique)      │
                    └───────────────────┬─────────────────┘
                          rejected      │      approved
              ┌─────────────────────────┤
              ▼                         ▼
   re-prompt specialist        milestone → verified,
   with critique + previous    Progress Ledger updated,
   attempt (bounded by         next milestone
   max_review_iterations)
                                        │ all milestones terminal
                                        ▼
                    ┌─────────────────────────────────────┐
                    │        FINAL SYNTHESIS LOOP         │
                    │ orchestrator streams the answer     │
                    │ (final_chunk SSE frames)            │
                    └─────────────────────────────────────┘
```

## 2. Task Ledger (outer loop)

Stored on `orchestration_runs.task_ledger`:

```json
{
  "goal": "...",
  "facts": ["verified facts extracted from the request"],
  "hypotheses": ["working assumptions"],
  "milestones": [
    {"id": "m1", "title": "...", "description": "...", "assigned_node": "researcher",
     "verification_criteria": "...", "status": "verified", "artifact": "...", "review_iterations": 1}
  ],
  "stall_count": 0
}
```

Planner guarantees enforced in code (not trusted from the model):
- milestone count clamped to `max_milestones`;
- `assigned_node` coerced to a real non-orchestrator specialist;
- degenerate/mock plans fall back to a single milestone.

## 3. Stall detection and replanning

- A milestone failure (review retries exhausted, or specialist error)
  increments the stall counter and emits `stall_detected`.
- `consecutive_failures >= stall_limit` (graph-configurable, default 4)
  triggers **replanning**: the orchestrator receives the current ledger and the
  failure context, revises hypotheses and emits a new milestone tail. Verified
  milestones are never redone.
- Replanning is bounded (2 per run); afterwards a chronically failing milestone
  is `skipped` so the run can still synthesize a partial answer.
- Global guards: `max_steps` per run, `RUN_TIMEOUT_SECONDS` wall clock
  (asyncio.wait_for → status `timeout`).

## 4. Progress Ledger (inner loop)

`orchestration_runs.progress_ledger`:
```json
{"current_milestone_id": "m2", "completed": ["m1"], "failed": []}
```
Every transition also publishes a `ledger_update` SSE frame, so the chat
surface's deliberation drawer can render live milestone states.

## 5. Dialectical review

- Reviewers are discovered from the compiled DSL:
  `dialectical_review` edges where the producer is the source (or target, if
  bidirectional).
- The reviewer is invoked **in persona** (its own constitution, lessons,
  memory) with a structured verdict prompt:
  `{"verdict": "approved"|"revision_requested", "critique": "...", "confidence": 0..1}`.
- Multiple reviewers rotate round-robin across review iterations.
- Unparseable verdicts default to approval (fail-open keeps mock/small-model
  teams functional); `rejected` maps to `revision_requested`.

## 6. Agent invocation pipeline (per directive)

1. **Persona assembly** — 5-priority system prompt (see architecture doc) with
   retrieval: top-k lessons, top-k archival memories, top-k skills by cosine
   similarity against `directive + task_text`.
2. **Brain call** — LiteLLM with the node's provider/model/temperature/top_p.
3. **Skill loop** — if the reply is `{"action": "use_skill", "skill_id", "arguments"}`,
   the skill executes in the sandbox; the JSON result is fed back. Bounded at 4
   iterations; skills outside the node's retrieved set are refused.
4. **Constitutional audit** — lexical screen + LLM compliance check; up to 2
   corrective re-prompts, then an explicit refusal.
5. **Persistence** — message ledger row (tokens, latency, cost, skill calls) +
   Redis working-memory push + `agent_debate` SSE frame.

## 7. Event bus semantics

- Publish: `PUBLISH cat:run-events:{run_id}` + `RPUSH cat:run-events-log:{run_id}`
  (capped at 500 frames, 24 h TTL).
- Subscribe: replay the log first (late joiners see the whole history), then
  live pub/sub until `run_completed`/`error`; 15 s heartbeats keep proxies open.
- Because both sides are Redis, **the SSE consumer and the run executor can be
  on different Gunicorn workers** (or different container instances).

## 8. Lifelong learning integration

Run completion enqueues a `post_mortem_jobs` row. The background worker
(one active drainer cluster-wide via Redis lock):

- **ExpeL track** — renders the full message trace, asks the evaluator model for
  atomic lessons per agent (`{"node_key", "lesson", "importance"}`), embeds and
  writes them as `agent_memories(memory_type=lesson)`. They are re-injected at
  P2 of persona assembly in future runs.
- **Voyager track** — the evaluator may propose reusable pure-Python routines;
  candidates are AST-validated, smoke-tested in the sandbox, documented and
  embedded into `agent_skills` (status `verified` when the smoke test passes).
  Rejections are logged, never fatal.
