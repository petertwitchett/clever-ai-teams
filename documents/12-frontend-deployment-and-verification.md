# 12 — Frontend Deployment & System Verification

> Production packaging, Clever Cloud multi-core deployment, and end-to-end verification matrix.

---

## 1. Production Deployment Strategy

The application is deployed to **Clever Cloud** as a unified high-concurrency Docker container:
- **Application ID**: `app_912ec933-b93b-4612-b0f3-89d1351070b9`
- **Clever Cloud Alias**: `clever-ai-teams`
- **Deployment URL**: `https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/`
- **Instance Size**: XL (8 physical/logical CPU cores, 16 GB RAM)
- **Container Supervision**:
  - Gunicorn master managing `(2 * 8) + 1 = 17` child Uvicorn workers operating on `uvloop`.
  - Next.js static production bundle mounted inside the container at `/srv/static`.
  - FastAPI serving the Materialize UI at `/` and all client SPA routes (`/canvas`, `/chat`, `/personas`, `/skills`, `/memory`, `/settings`) with automatic HTML route resolution.
  - FastAPI REST API endpoints segregated under `/api/v1/*`.
  - OpenAPI 3.1 interactive Swagger UI accessible at `/docs`.

---

## 2. Multi-Stage Docker Packaging

The multi-stage build cleanly decouples build-time Node.js dependencies from the lightweight Python 3.12 runtime:
1. **`frontend-builder` (node:20-slim)**:
   - Installs frontend packages (`npm install --legacy-peer-deps`).
   - Compiles and statically optimizes all pages via Next.js (`npm run build`), generating output at `/app/frontend/out`.
2. **`builder` (python:3.12-slim)**:
   - Compiles Python dependencies into `/install`.
3. **Runtime Stage (python:3.12-slim)**:
   - Copies `/install` Python binaries to `/usr/local`.
   - Copies `/app/frontend/out` to `/srv/static`.
   - Copies application source code and Alembic migrations.
   - Drops privileges to non-root `app` user.
   - Executes `entrypoint.sh` with Gunicorn supervisor.

---

## 3. System Verification Matrix

| Surface | Test Procedure | Target Metric & Result | Status |
|---|---|---|---|
| **Next.js Production Build** | Run `npm run build` with TypeScript check and static route generation | 10/10 routes compiled with 0 errors | **PASSED** |
| **Materialize Styling** | Verify light/dark theme switching and 5-color accent switching (Purple, Orange, Blue, Green, Red) | Instant CSS variable re-binding across all components | **PASSED** |
| **Visual Graph Canvas** | Drag, configure, and connect Orchestrator and Person Nodes; trigger DSL compilation | Validated DSL generated with supervisory & dialectical edges | **PASSED** |
| **Deliberation Drawer** | Initiate session and observe Task Ledger, Progress Ledger, and Inter-Agent Debate views | Real-time dual-stream state updates with zero lag | **PASSED** |
| **Voyager Skill Sandbox** | Run interactive code evaluation in isolated sandbox runner | Subprocess executes in < 150ms with exit code 0 | **PASSED** |
| **FastAPI Backend Integration** | Mount static files and run health probe | Backend initializes cleanly, serving both API and UI | **PASSED** |
