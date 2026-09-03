"""Application factory: FastAPI app with lifespan, middleware and OpenAPI."""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1 import api_router, health
from app.core.config import settings
from app.core.database import close_async_engine, create_all_tables, ensure_schema_and_extensions
from app.core.errors import register_exception_handlers
from app.core.executor import shutdown_executor
from app.core.logging import configure_logging, get_logger, request_id_ctx
from app.core.redis_client import close_redis_pool, get_redis
from app.core.security import generate_request_id, hash_password

logger = get_logger(__name__)

_DESCRIPTION = """
**Clever AI Team** - a multi-agent orchestration platform.

Design expert AI teams as visual graphs of *person nodes* - each with its own identity,
psychological persona, constitutional ethics, LLM brain, tiered memory and executable
skill library - then chat with the whole team through a single conversational interface.

### Core subsystems
- **Canvas Graph Management** - create, validate, compile and publish agent graphs (JSON DSL).
- **Persona Configuration** - per-node identity, morals, behavior, brain binding, memory limits.
- **Chat Session Lifecycle** - ChatGPT-style sessions bound to a compiled team graph.
- **Real-Time Chat & Streaming** - SSE dual-stream: ledger/debate observability + final answer chunks.
- **Magentic-One Orchestration** - Task Ledger (outer planning loop) + Progress Ledger (inner
  execution loop) with dialectical peer review, stall detection and replanning.
- **Lifelong Learning** - Voyager executable-skill compilation + ExpeL post-mortem reflection.
- **Agent Memory** - pgvector semantic archival memory with importance-weighted retrieval.

### Authentication
Register at `POST /api/v1/auth/register` (first account becomes admin), then either:
- `Authorization: Bearer <token>` from `POST /api/v1/auth/login`, or
- `X-API-Key: <key>` from `POST /api/v1/auth/api-key`.
"""


async def _bootstrap_admin() -> None:
    """Create the bootstrap admin account if configured and absent."""
    if not (settings.BOOTSTRAP_ADMIN_EMAIL and settings.BOOTSTRAP_ADMIN_PASSWORD):
        return
    from sqlalchemy import select

    from app.core.database import get_async_session
    from app.models import User, UserRole

    async with get_async_session() as db:
        existing = (
            await db.execute(select(User).where(User.email == settings.BOOTSTRAP_ADMIN_EMAIL))
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                User(
                    email=settings.BOOTSTRAP_ADMIN_EMAIL,
                    hashed_password=hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD),
                    full_name="Bootstrap Admin",
                    role=UserRole.ADMIN,
                )
            )
            await db.commit()
            logger.info("bootstrap_admin_created", extra={"email": settings.BOOTSTRAP_ADMIN_EMAIL})


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info(
        "startup",
        extra={
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "cpu_cores": settings.cpu_count,
            "llm_providers": settings.configured_llm_providers,
        },
    )

    # Database schema
    if settings.DB_AUTO_CREATE_SCHEMA:
        await ensure_schema_and_extensions()
        await create_all_tables()
    await _bootstrap_admin()

    # LangGraph durable checkpointing
    if settings.ORCHESTRATION_ENGINE == "langgraph":
        from app.engine.checkpointer import init_checkpointer

        await init_checkpointer()

    # Warm the Redis pool
    try:
        async with get_redis() as r:
            await r.ping()
        logger.info("redis_connected")
    except Exception as exc:  # noqa: BLE001
        logger.warning("redis_unavailable_at_startup", extra={"error": str(exc)[:200]})

    # Background learning worker.
    # embedded  -> in-process asyncio poller (legacy single-unit mode)
    # sidecar   -> arq worker process started by the container entrypoint
    # external  -> arq worker fleet in separate containers; API does nothing
    # none      -> no learning execution here
    stop_event = asyncio.Event()
    worker_task: asyncio.Task | None = None
    if settings.ENABLE_BACKGROUND_WORKERS and settings.WORKER_MODE == "embedded":
        from app.workers.learning import learning_worker_loop

        worker_task = asyncio.create_task(learning_worker_loop(stop_event), name="learning-worker")
    else:
        logger.info("learning_worker_mode", extra={"mode": settings.WORKER_MODE})

    yield

    # Shutdown
    stop_event.set()
    if worker_task is not None:
        try:
            await asyncio.wait_for(worker_task, timeout=10)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            worker_task.cancel()
    await close_redis_pool()
    await close_async_engine()
    if settings.ORCHESTRATION_ENGINE == "langgraph":
        from app.engine.checkpointer import close_checkpointer

        await close_checkpointer()
    shutdown_executor()
    logger.info("shutdown_complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=_DESCRIPTION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
        contact={"name": "Clever AI Team"},
        license_info={"name": "MIT"},
        openapi_tags=[
            {"name": "System", "description": "Health and readiness probes."},
            {"name": "Authentication", "description": "Accounts, JWT tokens and API keys."},
            {"name": "Canvas Graph Management", "description": "Design, validate, compile and publish agent graphs."},
            {"name": "Persona Configuration", "description": "Per-node identity, ethics, brain and memory settings."},
            {"name": "Chat Session Lifecycle", "description": "Conversations bound to compiled team graphs."},
            {"name": "Real-Time Chat & Streaming", "description": "Command ingestion and SSE execution streams."},
            {"name": "Lifelong Learning: Skills", "description": "Voyager executable skill library and sandbox."},
            {"name": "Lifelong Learning: Reflection", "description": "ExpeL post-mortem reflection pipeline."},
            {"name": "Agent Memory", "description": "Semantic archival memory (pgvector)."},
        ],
    )

    # Middleware
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_origins != ["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or generate_request_id()
        token = request_id_ctx.set(request_id)
        start = time.monotonic()
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = request_id
        duration_ms = int((time.monotonic() - start) * 1000)
        if not request.url.path.startswith(("/health", "/docs", "/openapi", "/redoc")):
            logger.info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    "request_id": request_id,
                },
            )
        return response

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", include_in_schema=False)
    async def root():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs",
            "redoc": "/redoc",
            "openapi": "/openapi.json",
            "health": "/health",
            "api": settings.API_V1_PREFIX,
        }

    return app


app = create_app()
