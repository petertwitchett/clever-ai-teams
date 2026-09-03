"""LangGraph durable checkpointing (AsyncPostgresSaver).

Provides a process-wide ``AsyncPostgresSaver`` backed by a dedicated psycopg3
async pool. Checkpoint tables live in the application schema
(``settings.DB_SCHEMA``) via the connection ``search_path`` so they never
collide with the unrelated PostGIS tables in ``public``.

Durability semantics this unlocks:
- every node transition is snapshotted -> crash/restart resumption
- ``thread_id`` = chat session id -> multi-turn state continuity
- checkpoint history -> time-travel inspection of any past run step
- ``interrupt()`` can suspend a run and resume it later from persisted state
"""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_pool: Any = None
_checkpointer: Any = None


def _psycopg_conninfo() -> str:
    """Build a psycopg3 conninfo string from the SQLAlchemy URL."""
    url = settings.DATABASE_URL
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg://", "postgresql+psycopg2://"):
        url = url.replace(prefix, "postgresql://")
    return url


async def init_checkpointer() -> Any | None:
    """Create the pool, run checkpoint table migrations, return the saver."""
    global _pool, _checkpointer
    if not settings.LANGGRAPH_CHECKPOINTS_ENABLED:
        logger.info("langgraph_checkpoints_disabled")
        return None
    if _checkpointer is not None:
        return _checkpointer

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg_pool import AsyncConnectionPool

    conninfo = _psycopg_conninfo()
    _pool = AsyncConnectionPool(
        conninfo=conninfo,
        min_size=1,
        max_size=max(1, settings.LANGGRAPH_CHECKPOINT_POOL_SIZE),
        open=False,
        timeout=30,
        kwargs={
            "autocommit": True,
            "prepare_threshold": None,
            "options": f"-c search_path={settings.DB_SCHEMA},public",
        },
    )
    await _pool.open(wait=True, timeout=30)

    _checkpointer = AsyncPostgresSaver(_pool)
    try:
        await _checkpointer.setup()  # idempotent DDL for checkpoint tables
        logger.info("langgraph_checkpointer_ready", extra={"schema": settings.DB_SCHEMA})
    except Exception as exc:  # noqa: BLE001 - degrade to in-memory rather than fail boot
        logger.warning("langgraph_checkpoint_setup_failed", extra={"error": str(exc)[:400]})
        await close_checkpointer()
        return None
    return _checkpointer


def get_checkpointer() -> Any | None:
    """Return the initialized checkpointer (None when disabled/unavailable)."""
    return _checkpointer


async def close_checkpointer() -> None:
    """Dispose the checkpointer pool at shutdown."""
    global _pool, _checkpointer
    _checkpointer = None
    if _pool is not None:
        try:
            await _pool.close()
        except Exception:  # pragma: no cover - best effort
            pass
        _pool = None
        logger.info("langgraph_checkpointer_closed")


async def checkpoint_health() -> dict[str, Any]:
    """Health payload describing checkpoint availability."""
    if not settings.LANGGRAPH_CHECKPOINTS_ENABLED:
        return {"enabled": False, "status": "disabled"}
    if _checkpointer is None:
        return {"enabled": True, "status": "unavailable"}
    stats = {}
    try:
        stats = {"pool_size": _pool.get_stats().get("pool_size") if _pool else None}
    except Exception:  # pragma: no cover
        pass
    return {"enabled": True, "status": "healthy", **stats}
