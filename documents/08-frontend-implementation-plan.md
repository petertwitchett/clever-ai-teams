# 08 — Frontend Implementation Plan

> Scope: **Materialize-Themed Next.js Multi-Agent Frontend** with Visual Canvas Studio (@xyflow/react), Real-Time Chat & Deliberation Drawer, Lifelong Learning Studio, SCSS & Tailwind styling, animated Lucide icons, 5 switchable theme colors, and Clever Cloud Docker deployment.

---

## 1. Executive Summary

This phase delivers the complete client-facing tier of the **Clever AI Team** multi-agent orchestration platform. Following the architectural specifications established in the backend phase, the frontend provides two primary surfaces:
1. **Administrative Studio**: An interactive visual graph abstraction canvas powered by `@xyflow/react` for modeling autonomous person nodes with Letta-inspired constitutional layers, decoupled LLM brain assignments, and directed communication channels.
2. **Consumer Conversational Interface**: A ChatGPT/Gemini-style chat surface integrated with a collapsible real-time **Deliberation Drawer** displaying Magentic-One outer Task Ledgers, inner Progress Ledgers, and inter-agent dialectical critique streams via Server-Sent Events (SSE).

The frontend interface strictly mirrors the **Materialize Admin Template** visual design system, with switchable Light and Dark modes and 5 accent color palettes (Materialize Purple, Sunset Orange, Electric Cyan, Mint Emerald, and Coral Crimson).

---

## 2. Technology Stack & Architectural Roles

| Layer | Technology | Architectural Role |
|---|---|---|
| **Framework** | Next.js 14 (App Router) + TypeScript | High-performance React application supporting static optimization and SPA client routing |
| **Visual Canvas** | `@xyflow/react` (React Flow) | Hardware-accelerated infinite-canvas node graph editor with custom handles and layout serialization |
| **Styling & CSS** | SCSS (`sass`) + Tailwind CSS | Materialize design tokens, rounded pill navigation, soft ambient elevation, and dynamic CSS variables |
| **Icons & Motion** | `lucide-animated` + `lucide-react` + `motion` | Meaningful micro-animated icons with hover triggers, continuous states, and spring transitions |
| **Markdown Engine** | `react-markdown` + `remark-gfm` | Syntax-highlighted code blocks, financial tables, and structured text rendering |
| **State & API** | Fetch Client + Server-Sent Events (SSE) | Non-blocking streaming connection to `/api/v1/chat/runs/{run_id}/events` |
| **Packaging** | Multi-stage Dockerfile | Single production container combining FastAPI multi-core backend with Next.js static bundle |

---

## 3. Core Deliverables

1. **Dashboard & Analytics (`/`)**:
   - Welcome Hero Card matching Materialize CRM template ("Welcome, Architect!").
   - 4 KPI Stat Widgets: Active Teams, Voyager Skills, Chat Sessions, and Hardware Cores.
   - Magentic-One Milestone Progression Gantt widget.
   - Agent Persona Distribution circular gauge.
   - Teams catalog with direct shortcuts to Canvas Studio and Consumer Chat.

2. **Visual Graph Canvas Studio (`/canvas`)**:
   - Custom `OrchestratorNode` with reasoning brain indicator and stall limit.
   - Custom `PersonNode` with role icons, ethics guardrail badges, and 4-way handles.
   - Color-coded directed edges (`subtask_dispatch`, `dialectical_review`, `peer_collaboration`).
   - Slide-out `PersonaDrawer` for Letta-style persona modeling (Identity, Psyche, Constitutional Invariants, Brain, Voyager Skills, Memory).
   - Real-time Graph Validation and JSON DSL compilation.

3. **Consumer Chat & Observability Surface (`/chat`)**:
   - Session history sidebar with active graph selector.
   - Main conversation stream with markdown and syntax-highlighted code blocks.
   - Collapsible **Deliberation Drawer**:
     - *Task Ledger*: Structural milestones, facts baseline, hypotheses, stall counter.
     - *Progress Ledger*: Targeted directives, assigned specialist, iteration status.
     - *Inter-Agent Debate*: Peer cross-examination logs and verification scores.

4. **Personas & Ethics Catalog (`/personas`)**:
   - Grid view of all autonomous person nodes across graphs.
   - Constitutional guardrails management and brain bindings.

5. **Lifelong Learning Studio (`/skills`)**:
   - *Track 1 (Voyager)*: Python code viewer with docstring, AST check, and interactive sandbox execution runner.
   - *Track 2 (ExpeL)*: Heuristic principle cards and post-mortem evaluation triggers.

6. **Tiered Memory Explorer (`/memory`)**:
   - pgvector semantic similarity search with cosine distance metrics.

7. **System & API Docs (`/settings`)**:
   - Hardware telemetry (Clever Cloud XL 8 cores, 17 Uvicorn workers).
   - Direct link to Swagger UI (`/docs`) and OpenAPI JSON.
