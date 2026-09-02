"""Health and system observability endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import settings
from app.core.database import check_database_health
from app.core.logging import get_logger
from app.core.redis_client import get_redis
from app.schemas import HealthResponse

logger = get_logger(__name__)

router = APIRouter(tags=["System"])


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    """Cheap liveness endpoint (no dependency checks)."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/health/ready", response_model=HealthResponse, summary="Readiness probe")
async def readiness() -> HealthResponse:
    """Deep readiness: verifies PostgreSQL (with pgvector) and Redis."""
    checks: dict = {}
    overall = "ok"

    try:
        checks["database"] = await check_database_health()
    except Exception as exc:  # noqa: BLE001
        checks["database"] = {"status": "unhealthy", "error": str(exc)[:300]}
        overall = "degraded"

    try:
        async with get_redis() as r:
            pong = await r.ping()
            info = await r.info("server")
        checks["redis"] = {"status": "healthy" if pong else "unhealthy", "version": info.get("redis_version")}
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = {"status": "unhealthy", "error": str(exc)[:300]}
        overall = "degraded"

    checks["llm_providers"] = settings.configured_llm_providers or ["mock (no API keys configured)"]
    checks["workers"] = {
        "web_workers": settings.web_workers,
        "cpu_cores": settings.cpu_count,
        "cpu_executor_workers": settings.cpu_executor_workers,
    }

    return HealthResponse(
        status=overall,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        checks=checks,
    )
