# 11 — Consumer Chat & Real-Time Dual-Stream Observability

> Conversational user surface, Server-Sent Events (SSE) integration, and the Magentic-One Deliberation Thought Panel.

---

## 1. Conversational Ergonomics

The consumer chat surface (`/chat`) combines the streamlined ergonomics of modern AI interfaces (ChatGPT, Gemini, LibreChat) with deep multi-agent deliberation observability:
- **Team Graph Selector**: Allows the end-user to switch between compiled agent collectives (e.g. *Deep Market Intelligence Collective*, *Software Code Review Team*).
- **Session History Manager**: Persistent relational sessions retrieved from `/api/v1/sessions` with fast search, creation, and deletion.
- **Rich Message Stream**:
  - Full GitHub-flavored Markdown rendering (`remark-gfm`).
  - Code syntax highlighting with copy-to-clipboard functionality.
  - Multi-column tables and bold callouts.
  - Agent persona badges attributing statements to specific person nodes (Orchestrator, Researcher, Critic, Developer).

---

## 2. Magentic-One Dual-Stream Observability Architecture

Behind the consumer chat bubble, the platform operates a dual-stream Server-Sent Events (SSE) consumer connected to `/api/v1/chat/runs/{run_id}/events`. As the team deliberates, events are separated into two distinct visual surfaces:

```
FastAPI Event Stream (SSE)
           │
           ├───► event: ledger_update ──► Updates Task & Progress Ledgers in Thought Panel
           ├───► event: agent_debate  ──► Renders Peer Dialectical Critique in Thought Panel
           └───► event: final_chunk   ──► Streams Synthesized Tokens to Main Conversation
```

---

## 3. The Deliberation Drawer (Thought Panel)

The collapsible Thought Panel provides full auditability across three specialized views:

### Tab 1: Task Ledger (Outer Planning Loop)
- **Structural Milestones**: Real-time checklist of decomposition steps with status indicators (`pending`, `in_progress`, `review`, `verified`).
- **Verification Criteria**: Ground-truth validation rules required before advancing.
- **Stall Detection Monitor**: Displays iteration turn counters (e.g. `0 / 4 turns`). If an agent collective stalls, the indicator alerts the user that an **Executive Replanning Phase** has been triggered.
- **Verified Facts Baseline**: Accumulated empirical findings verified by peer nodes.
- **Working Hypotheses**: Dynamic assumptions tested during the deliberation run.

### Tab 2: Progress Ledger (Inner Execution Loop)
- **Active Subtask Directive**: Inspects the targeted prompt dispatched to the specialist.
- **Assigned Node Handle**: Real-time attribution to the specialist currently working.
- **Loop Status**: Step progression (`dispatching` → `executing` → `evaluating` → `advance`).

### Tab 3: Dialectical Debate (Peer Cross-Examination)
- **Peer-to-Peer Dialogue**: Displays the iterative debate between the Specialist (e.g. Senior Researcher) and the Critic.
- **Constitutional Verification**: Flags detected logical fallacies, unsupported extrapolations, or data freshness violations.
- **Verification Score**: Displays the numerical consensus score (e.g. `96%`) and whether the milestone was approved or returned for revision.
