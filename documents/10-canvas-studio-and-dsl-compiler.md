# 10 — Visual Canvas Studio & JSON DSL Compiler

> Implementation of the @xyflow/react node canvas, custom agent node schemas, directed communication topologies, and JSON DSL compiler.

---

## 1. Visual Canvas Architecture

The Administrative Studio delivers a hardware-accelerated, infinite-canvas workflow designer implemented via `@xyflow/react` (`GraphCanvas.tsx`):

```
+-------------------------------------------------------------------------+
| GRAPH CANVAS STUDIO                                                     |
|                                                                         |
|                 [ Magentic Orchestrator (o1-preview) ]                  |
|                                   │                                     |
|                       subtask_dispatch (supervisory)                    |
|                                   ▼                                     |
|             [ Elena Vance (Claude 3.5) ] ── dialectical_review ──►     |
|             Senior Research Specialist   ◄── (peer cross-exam)  ──     |
|                                   │                                     |
|                    peer_collaboration (dataset handoff)                 |
|                                   ▼                                     |
|             [ Kaelen Chen (DeepSeek-R1) ] ── dialectical_review ──►     |
|             Quantitative Data Engineer    [ Marcus Drake (o1-mini) ]    |
|                                           Analytical Dialectical Critic |
+-------------------------------------------------------------------------+
```

### Node Specialization
1. **OrchestratorNode**:
   - Distinct gold/amber gradient header with crown badge.
   - Dual-Ledger indicator (`Task Ledger` outer loop + `Progress Ledger` inner loop).
   - Stall detection threshold display (`Stall Limit: 4 turns`).
   - LLM Brain binding badge (`o1-preview` via OpenAI Gateway).
   - Supervisory Top & Bottom handles (`dispatch-out`, `return-in`).

2. **PersonNode**:
   - Dynamic role icons (Scale for Critic, Code for Developer, Search for Researcher, Brain for General).
   - Identity call-sign and professional mandate summary.
   - Decoupled Brain binding indicator (`claude-3-5-sonnet`, `deepseek-r1`, `llama-3.3-70b`).
   - Priority 0 Constitutional Invariants badge (`2 Guardrails`).
   - Voyager dynamic skill tools counter (`3 Tools`).
   - Archival memory depth pointer (`k=5`).
   - 4-Way Handles: Top (subtask in), Bottom (artifact out), Left/Right (peer critique & collaboration).

---

## 2. Directed Edge Communication Channels

Edges on the canvas are classified and styled according to communication semantics:
- **`subtask_dispatch`**: Solid stroke (`stroke-width: 2px`) in primary accent color. Dictates top-down milestone directive assignment from the Orchestrator to a Specialist.
- **`dialectical_review`**: Dashed stroke (`strokeDasharray: "6,4"`) in rose/crimson (`#f43f5e`). Dictates peer-to-peer cross-examination and logic auditing by the Critic node.
- **`peer_collaboration`**: Dotted stroke (`strokeDasharray: "3,3"`) in cyan (`#06b6d4`). Dictates lateral dataset and code artifact handoffs between specialists.

---

## 3. Persona Modeling Slide-Out Drawer

Clicking any PersonNode on the canvas opens the `PersonaDrawer` contextual editor, organizing the Letta/MemGPT cognitive blocks across 6 tabs:
1. **Identity**: Full Name, Role, Primary Duty.
2. **Psychology**: Tone, Temperament, Cognitive Problem-Solving Style, Behavioral Quirks.
3. **Constitutional Ethics (Priority 0)**: Non-negotiable safety guardrails and absolute negative constraints.
4. **LLM Brain**: Provider gateway selector (Anthropic, OpenAI, DeepSeek, Ollama, LiteLLM), Model identifier, Temperature slider, Top-P slider, Context window limit.
5. **Voyager Skills**: Selection of vectorized dynamic Python tools executable in sandboxes.
6. **Tiered Memory**: Working context message window bounds and Archival top-$k$ limit.

---

## 4. Graph Validation & JSON DSL Compilation

The canvas compiles real-time visual nodes and edges into an intermediate JSON DSL:
- **Structural Invariants**:
  - Enforces exactly one Orchestrator Node.
  - Flags and prevents disconnected orphan nodes.
  - Verifies dialectical review edges connect compatible roles.
- **Compilation Endpoint**: Sends the validated DSL to `POST /api/v1/graphs/{id}/compile`, materializing `person_nodes` and `graph_edges` rows in the PostgreSQL database and caching the compiled graph in Redis.
