"""Database connection management with asyncpg and pgvector support."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool, Pool

from app.core.config import settings

logger = logging.getLogger(__name__)

_async_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_async_engine() -> AsyncEngine:
    """Return the cached async SQLAlchemy engine singleton."""
    global _async_engine
    if _async_engine is None:
        connect_args: dict = {
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "server_settings": {
                "application_name": settings.APP_NAME,
                "jit": "off",
                "search_path": f"{settings.DB_SCHEMA},public",
            },
        }
        if settings.DB_STATEMENT_TIMEOUT_MS > 0:
            connect_args["server_settings"]["statement_timeout"] = str(settings.DB_STATEMENT_TIMEOUT_MS)
        
        # Configure SSL mode for asyncpg
        if settings.DB_SSL == "disable":
            connect_args["ssl"] = False
        elif settings.DB_SSL == "require":
            connect_args["ssl"] = "require"
        # "prefer" = omit ssl param, asyncpg negotiates automatically

        poolclass = NullPool if settings.ENVIRONMENT == "test" else None

        _async_engine = create_async_engine(
            settings.async_database_url,
            echo=settings.DB_ECHO,
            pool_pre_ping=True,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE,
            connect_args=connect_args,
            poolclass=poolclass,
        )

    return _async_engine


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the async session factory."""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            bind=get_async_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _async_session_factory


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session; automatically rollback on exception."""
    factory = get_async_session_factory()
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def ensure_schema_and_extensions() -> None:
    """Create the dedicated schema and ensure required extensions exist.

    The target database is shared with other tooling (PostGIS/tiger geocoder
    tables live in ``public``), so every table owned by this application is
    isolated inside ``settings.DB_SCHEMA``.
    """
    engine = get_async_engine()
    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.DB_SCHEMA}"'))
        for extension in ("vector", "pgcrypto", "pg_trgm"):
            try:
                await conn.execute(text(f"CREATE EXTENSION IF NOT EXISTS {extension}"))
            except Exception as exc:  # pragma: no cover - depends on grants
                logger.warning("extension_unavailable", extra={"extension": extension, "error": str(exc)})
        result = await conn.execute(text("SELECT extversion FROM pg_extension WHERE extname = 'vector'"))
        version = result.scalar()
        if not version:
            raise RuntimeError("pgvector extension is required but could not be enabled")
        logger.info("schema_ready", extra={"schema": settings.DB_SCHEMA, "pgvector": version})


async def ensure_vector_extension() -> None:
    """Backwards compatible alias for :func:`ensure_schema_and_extensions`."""
    await ensure_schema_and_extensions()


async def create_all_tables() -> None:
    """Create any missing tables from the SQLAlchemy metadata."""
    from app.models.base import Base  # imported lazily to avoid circular imports

    engine = get_async_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("schema_tables_ready", extra={"tables": len(Base.metadata.tables)})


async def check_database_health() -> dict:
    """Return a health probe payload for the database."""
    engine = get_async_engine()
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        result.scalar()
        version = (await conn.execute(text("SHOW server_version"))).scalar()
        vector_version = (
            await conn.execute(text("SELECT extversion FROM pg_extension WHERE extname = 'vector'"))
        ).scalar()
    pool = engine.pool
    return {
        "status": "healthy",
        "server_version": version,
        "pgvector_version": vector_version,
        "schema": settings.DB_SCHEMA,
        "pool": {
            "size": getattr(pool, "size", lambda: None)(),
            "checked_out": getattr(pool, "checkedout", lambda: None)(),
        },
    }


async def close_async_engine() -> None:
    """Dispose of the async engine pool (called at shutdown)."""
    global _async_engine, _async_session_factory
    if _async_engine is not None:
        await _async_engine.dispose()
        _async_engine = None
        _async_session_factory = None
        logger.info("Async database engine disposed")
