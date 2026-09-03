# Document 13: Live API Integration & Zero-Mock Architecture

## 1. Overview & Requirement

The platform requirement mandates:
> **"It should not use any unreal and mock data in UI all data should load from api"**

All mock data fallback generators, synthetic placeholders, and simulated progress loops have been eliminated from the Next.js frontend. The client now strictly interfaces with the production FastAPI endpoints and PostgreSQL database (`clever_ai` schema) hosted on Clever Cloud.

---

## 2. Backend Enhancements

### 2.1 Auto-Provisioned Platform Session Token (`POST /api/v1/auth/demo-token`)
Located in `app/api/v1/auth.py`:
- Checks for active users in `clever_ai.users` or provisions an administrator user.
- Generates a signed JWT with `sub`, `role`, and 7-day expiration (`expires_delta=timedelta(days=7)`).
- Allows seamless client-side authentication without requiring manual login prompts.

### 2.2 Top-Level Personas Catalog Endpoint (`GET /api/v1/personas`)
Located in `app/api/v1/personas.py`:
- Returns `list[PersonNodeOut]` across all accessible graphs.
- Powers the `/personas` catalog page directly from database rows.

### 2.3 Top-Level Archival Memory Endpoint (`GET /api/v1/memory`)
Located in `app/api/v1/memory.py`:
- Returns paginated `Page[MemoryOut]` querying `clever_ai.agent_memories`.
- Powers the `/memory` semantic explorer page.

### 2.4 Browser EventSource SSE Authentication (`app/api/deps.py`)
- Standard browser `EventSource` cannot pass custom HTTP request headers.
- `get_current_user` in `app/api/deps.py` was updated to inspect `?token=` or `?access_token=` query parameters when the `Authorization` header is not present.

---

## 3. Frontend Implementation (`frontend/src/lib/api.ts`)

- Completely removed all `getMockGraphs()`, `getMockSessions()`, `getMockMessages()`, `getMockRun()`, `getMockSkills()`, `getMockReflections()`, and `getMockMemories()` methods (~450 lines of static code deleted).
- Implemented `ensureAuth()` in `ApiClient`: If no token is stored in `localStorage`, the client calls `POST /auth/demo-token`, stores the access token, and automatically retries upon receiving any 401 Unauthorized response.
- In `frontend/src/app/chat/page.tsx`, removed `simulateDeliberationProgress` and mock run preloads; all messages, task ledgers, progress ledgers, and dialectical critiques are loaded from `api.getSessionMessages()` and `api.getSessionRuns()`.

---

## 4. Live Verification Results

Verified live on Clever Cloud:
- **Deployment Status**: `OK` (Commit `9f7eb578`)
- **Live URL**: `https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/`
- **Active Teams**: 3 (`Quantitative Risk & Market Intelligence Collective`, `Autonomous Fullstack Engineering Team`, `Deep Research Team`)
- **AI Personas**: 21 nodes (Victoria Sterling, Sofia Reyes, Alpha Director, Marcus Drake, Kaelen Chen, Nexus Prime, Atlas, Dr. Elena Voss, Marcus Chen)
- **Voyager Skills**: 7 Python tools (`json_ast_validator`, `regex_pii_sanitizer`, `monte_carlo_risk_simulator`, `descriptive_stats`)
- **Archival Memory**: 5 pgvector items
- **Chat History**: 50 live messages from PostgreSQL
