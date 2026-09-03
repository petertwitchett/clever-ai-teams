# 14 — Multi-Canvas Library and Team Lifecycle

Scope: managing **many** agent teams (canvases) and chatting with a chosen one.
This document covers the endpoints, the state machine a canvas moves through,
and the frontend surfaces that drive it.

---

## 1. Why this exists

The original delivery could already store any number of graphs, but three things
made a real multi-canvas experience impossible:

| Problem | Effect | Fix |
| --- | --- | --- |
| `GET /graphs` returned no counts | The canvas picker fetched every graph's full detail to show "3 nodes" — an N+1 that degrades linearly with library size | Counts computed as correlated subqueries in the list query |
| No way to save without compiling | An editor could not autosave incomplete work; every save demanded a structurally valid team | `PATCH /graphs/{id}` accepts a `dsl` for draft saves |
| No way to clone, unpublish, or safely delete | Building the 5th team meant rebuilding from scratch; publishing was a one-way door; deleting a canvas with chat history returned a 500 | `duplicate`, `unpublish`, and a guarded `DELETE` |

---

## 2. Canvas state machine

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
   POST /graphs      ▼          POST /{id}/compile              │
  (no dsl)      ┌────────┐  ──────────────────────────►  ┌──────────┐
  ─────────────►│ draft  │                               │ compiled │
                └────────┘  ◄──────────────────────────  └──────────┘
                    ▲          PATCH /{id} with dsl           │   ▲
                    │        (edit invalidates compile)       │   │
                    │                                         │   │
                    │                    POST /{id}/publish   │   │ POST /{id}/unpublish
                    │                                         ▼   │
                    │                                    ┌───────────┐
                    └────────────────────────────────────│ published │
                         PATCH /{id} with dsl            └───────────┘
```

Rules the backend enforces:

- **Only `compiled` or `published` canvases can host a conversation.**
  `POST /sessions` rejects a draft with `422`.
- **Editing the DSL of a compiled canvas returns it to `draft`** and clears
  `compiled_at`. The stored `person_nodes`/`graph_edges` describe the *previous*
  canvas, so executing it would run a team the operator no longer sees.
  `/compile` must be called again.
- **`unpublish` returns to `compiled`, not `draft`** — the team is still
  executable, it is merely no longer shared.

---

## 3. Endpoints

### 3.1 Canvas library

```
GET /api/v1/graphs
    ?limit=20&offset=0
    &search=<name or description substring>
    &status=draft|compiled|published|archived
    &compiled_only=true          # only canvases you can chat with
    &owned_only=true             # exclude public canvases from other owners
    &include_public=true
    &sort=updated_at|created_at|name|sessions
```

Every item carries `node_count`, `edge_count` and `session_count`, so a picker
or card grid renders from **one** request no matter how large the library is.
The counts are correlated scalar subqueries against `person_nodes`,
`graph_edges` and `chat_sessions`:

```sql
SELECT agent_graphs.*,
       (SELECT count(*) FROM person_nodes  WHERE graph_id = agent_graphs.id) AS node_count,
       (SELECT count(*) FROM graph_edges   WHERE graph_id = agent_graphs.id) AS edge_count,
       (SELECT count(*) FROM chat_sessions WHERE graph_id = agent_graphs.id) AS session_count
FROM agent_graphs
WHERE owner_id = :me OR is_public
ORDER BY updated_at DESC
LIMIT :limit OFFSET :offset;
```

### 3.2 Lifecycle operations

| Verb | Path | Purpose |
| --- | --- | --- |
| `POST` | `/graphs` | Create. With `dsl` it compiles immediately; without, it is a blank draft. |
| `PATCH` | `/graphs/{id}` | Edit name, description, `canvas_layout`, `is_public`, `max_steps`, `stall_limit`, `timeout_seconds`, and/or **draft-save** the `dsl`. |
| `POST` | `/graphs/{id}/compile` | Compile. **Body optional**: with a `dsl` it compiles that document; with no body it recompiles the DSL already stored. |
| `POST` | `/graphs/{id}/duplicate?name=...` | Clone into a new private draft, then recompile so the clone is chat-ready. History is *not* copied. |
| `POST` | `/graphs/{id}/publish` | `compiled` → `published`. |
| `POST` | `/graphs/{id}/unpublish` | `published` → `compiled`. |
| `DELETE` | `/graphs/{id}?force=false` | Delete. Refuses with `409` if conversations exist; `force=true` deletes the canvas together with its sessions, runs and messages. |

**Draft save vs. compile.** `PATCH` with a `dsl` persists the canvas *without*
validating it, so an editor can autosave a half-finished team. `/compile` is the
gate that validates structure and rebuilds `person_nodes` / `graph_edges`.

**Recompile with no body** is what a "Compile" button needs after a sequence of
draft saves. It refuses with `422` when nothing is stored, and with `422`
(including the Pydantic errors) when the stored DSL is structurally invalid —
never a `500`.

**Delete guard.** `chat_sessions.graph_id` is a non-nullable FK, so deleting a
referenced canvas previously surfaced an `IntegrityError` as a `500`. The
endpoint now counts sessions first and returns:

```json
{
  "error": {
    "code": "conflict",
    "message": "This canvas still has 3 chat session(s). Re-send with force=true to delete the canvas and its conversation history.",
    "details": { "session_count": 3 }
  }
}
```

`force=true` deletes the sessions through the ORM so `ChatSession`'s own
cascades remove runs and messages.

### 3.3 Canvas-scoped conversations

```
GET /api/v1/sessions
    ?graph_id=<uuid>        # only conversations on this canvas
    &search=<title substring>
    &status=active|archived|...
```

`SessionOut` now carries `graph_name`, `graph_status`, `message_count` and
`run_count`, so a sidebar renders which team each conversation belongs to
without extra requests.

---

## 4. Frontend surfaces

### 4.1 Canvas Studio (`/canvas`)

- **Library rail** — searchable, sortable list of every canvas with status
  badges and node/edge/session counts. Backed by one `listGraphs` call.
- **Per-canvas actions** — Compile, Publish/Unpublish, Duplicate, Rename,
  Delete, and "Chat with this team" (only enabled once compiled).
- **Editor** — `Save Draft` persists work in progress; `Compile & Save` validates
  and makes the team executable, surfacing compiler errors and warnings inline.

A defect fixed here: `Compile & Save` previously called `compileGraph(id)` with
no body for an existing canvas, which recompiled the **stored** DSL and silently
discarded the operator's on-canvas edits. It now always sends the exported DSL.

### 4.2 Chat (`/chat`)

- **Canvas picker** lists only chat-ready teams (`compiled_only=true`).
- **Session history is scoped to the selected canvas** and reloads when the
  selection changes; sessions can be renamed and deleted in place.
- **Correctness guard:** sending a command always targets the canvas the session
  is bound to. Selecting a different canvas in the picker starts a new session
  rather than routing the message to the wrong team.

---

## 5. Verification

`tests/test_multi_canvas.py` — 51 checks against the live Clever Cloud database:

| Area | Coverage |
| --- | --- |
| Library | counts present without detail fetches, `search`, `compiled_only`, `owned_only`, `sort=name`, pagination totals |
| Duplicate | new id, nodes/edges copied, recompiled to `compiled`, renamed, private by default, source untouched |
| Edit | rename, description, `stall_limit`, `max_steps`, `timeout_seconds`, `canvas_layout` round-trip |
| Draft save | compiled canvas returns to `draft`, stored nodes unchanged until recompile |
| Recompile | rebuilds nodes/edges from the edited DSL, version bump, `422` when no DSL is stored |
| Publish | publish → `published`, unpublish → `compiled`, published canvas still chat-eligible |
| Sessions | `graph_name`/`graph_status`/counts present, `graph_id` scoping, title search, `session_count` reflects reality |
| Delete | `409` with session count, canvas intact after refusal, `force=true` cascades, session-free canvas deletes directly |

Run:

```bash
.venv/bin/python tests/test_multi_canvas.py http://127.0.0.1:8099
```

Regression status alongside the existing suites: **51/51 multi-canvas,
24/24 end-to-end, 16/16 HITL gate.**
