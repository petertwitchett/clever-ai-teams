"""Redis client configuration and helper utilities."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import redis.asyncio as aioredis
from redis.asyncio import Redis
from redis.asyncio.connection import ConnectionPool
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_pool: ConnectionPool | None = None


def get_redis_pool() -> ConnectionPool:
    """Return the cached Redis connection pool singleton."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = ConnectionPool.from_url(
            settings.redis_url,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
            health_check_interval=30,
        )
        logger.debug("redis_pool_created", extra={"url": settings.REDIS_HOST})
    return _redis_pool


@asynccontextmanager
async def get_redis() -> AsyncGenerator[Redis, None]:
    """Yield a Redis client from the pool."""
    pool = get_redis_pool()
    client = Redis(connection_pool=pool)
    try:
        yield client
    finally:
        await client.aclose()


async def close_redis_pool() -> None:
    """Close the Redis connection pool (called at shutdown)."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.aclose()
        _redis_pool = None
        logger.info("Redis connection pool closed")


class CacheService:
    """High-level caching interface with JSON serialization."""

    @staticmethod
    async def get(key: str, default: Any = None) -> Any:
        """Get a JSON-serialized value from cache."""
        try:
            async with get_redis() as r:
                value = await r.get(settings.redis_key(key))
                if value is None:
                    return default
                return json.loads(value)
        except (RedisError, json.JSONDecodeError) as e:
            logger.warning("cache_get_failed", extra={"key": key, "error": str(e)})
            return default

    @staticmethod
    async def set(key: str, value: Any, ttl: int | None = None) -> bool:
        """Set a JSON-serialized value in cache with optional TTL."""
        try:
            async with get_redis() as r:
                ttl = ttl or settings.CACHE_TTL_SECONDS
                serialized = json.dumps(value, ensure_ascii=False, default=str)
                await r.setex(settings.redis_key(key), ttl, serialized)
                return True
        except (RedisError, TypeError) as e:
            logger.warning("cache_set_failed", extra={"key": key, "error": str(e)})
            return False

    @staticmethod
    async def delete(key: str) -> bool:
        """Delete a key from cache."""
        try:
            async with get_redis() as r:
                await r.delete(settings.redis_key(key))
                return True
        except RedisError as e:
            logger.warning("cache_delete_failed", extra={"key": key, "error": str(e)})
            return False

    @staticmethod
    async def exists(key: str) -> bool:
        """Check if a key exists in cache."""
        try:
            async with get_redis() as r:
                return bool(await r.exists(settings.redis_key(key)))
        except RedisError as e:
            logger.warning("cache_exists_failed", extra={"key": key, "error": str(e)})
            return False

    @staticmethod
    async def increment(key: str, amount: int = 1, ttl: int | None = None) -> int:
        """Atomically increment a counter."""
        try:
            async with get_redis() as r:
                namespaced_key = settings.redis_key(key)
                value = await r.incrby(namespaced_key, amount)
                if ttl and value == amount:
                    await r.expire(namespaced_key, ttl)
                return int(value)
        except RedisError as e:
            logger.warning("cache_increment_failed", extra={"key": key, "error": str(e)})
            return 0

    @staticmethod
    async def get_many(keys: list[str]) -> dict[str, Any]:
        """Batch get multiple keys."""
        if not keys:
            return {}
        try:
            async with get_redis() as r:
                namespaced = [settings.redis_key(k) for k in keys]
                values = await r.mget(namespaced)
                result: dict[str, Any] = {}
                for i, value in enumerate(values):
                    if value is not None:
                        try:
                            result[keys[i]] = json.loads(value)
                        except json.JSONDecodeError:
                            pass
                return result
        except RedisError as e:
            logger.warning("cache_get_many_failed", extra={"count": len(keys), "error": str(e)})
            return {}

    @staticmethod
    async def set_many(mapping: dict[str, Any], ttl: int | None = None) -> int:
        """Batch set multiple keys."""
        if not mapping:
            return 0
        try:
            async with get_redis() as r:
                ttl = ttl or settings.CACHE_TTL_SECONDS
                pipe = r.pipeline()
                for key, value in mapping.items():
                    serialized = json.dumps(value, ensure_ascii=False, default=str)
                    pipe.setex(settings.redis_key(key), ttl, serialized)
                await pipe.execute()
                return len(mapping)
        except (RedisError, TypeError) as e:
            logger.warning("cache_set_many_failed", extra={"count": len(mapping), "error": str(e)})
            return 0
