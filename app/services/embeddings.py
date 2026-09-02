"""Embedding service with Redis caching and deterministic offline fallback.

Real embeddings come from the configured provider through LiteLLM. When no
provider is available a deterministic hash-projection embedding keeps the whole
vector pipeline (pgvector search, skill retrieval, memory recall) functional
for development and testing.
"""

from __future__ import annotations

import hashlib
import json
import math

import litellm

from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis_client import get_redis

logger = get_logger(__name__)


def _fallback_embedding(text: str, dimension: int) -> list[float]:
    """Deterministic pseudo-embedding: seeded hash projections, L2-normalized."""
    vector = [0.0] * dimension
    tokens = text.lower().split()
    if not tokens:
        tokens = [""]
    for position, token in enumerate(tokens[:512]):
        digest = hashlib.sha256(token.encode()).digest()
        for i in range(0, 32, 4):
            index = int.from_bytes(digest[i : i + 2], "big") % dimension
            sign = 1.0 if digest[i + 2] % 2 == 0 else -1.0
            weight = 1.0 / (1.0 + 0.01 * position)
            vector[index] += sign * weight
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


def _cache_key(text: str) -> str:
    digest = hashlib.sha256(f"{settings.EMBEDDING_MODEL}:{text}".encode()).hexdigest()
    return settings.redis_key("emb", digest)


class EmbeddingService:
    """Generate and cache text embeddings."""

    @staticmethod
    def has_real_provider() -> bool:
        return bool(settings.OPENAI_API_KEY or settings.LITELLM_PROXY_URL)

    @staticmethod
    async def embed(text: str) -> list[float]:
        results = await EmbeddingService.embed_many([text])
        return results[0]

    @staticmethod
    async def embed_many(texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts, using Redis as a per-text cache."""
        if not texts:
            return []
        results: list[list[float] | None] = [None] * len(texts)
        misses: list[int] = []

        # 1. cache lookup
        try:
            async with get_redis() as r:
                cached = await r.mget([_cache_key(t) for t in texts])
            for i, value in enumerate(cached):
                if value is not None:
                    try:
                        results[i] = json.loads(value)
                    except json.JSONDecodeError:
                        misses.append(i)
                else:
                    misses.append(i)
        except Exception as exc:  # pragma: no cover - redis outage guard
            logger.warning("embedding_cache_read_failed", extra={"error": str(exc)})
            misses = list(range(len(texts)))

        if not misses:
            return results  # type: ignore[return-value]

        # 2. compute misses
        miss_texts = [texts[i] for i in misses]
        computed = await EmbeddingService._compute(miss_texts)
        for slot, vector in zip(misses, computed):
            results[slot] = vector

        # 3. write back
        try:
            async with get_redis() as r:
                pipe = r.pipeline()
                for slot, vector in zip(misses, computed):
                    pipe.setex(_cache_key(texts[slot]), settings.CACHE_TTL_EMBEDDING, json.dumps(vector))
                await pipe.execute()
        except Exception as exc:  # pragma: no cover
            logger.warning("embedding_cache_write_failed", extra={"error": str(exc)})

        return results  # type: ignore[return-value]

    @staticmethod
    async def _compute(texts: list[str]) -> list[list[float]]:
        if not EmbeddingService.has_real_provider():
            return [_fallback_embedding(t, settings.EMBEDDING_DIMENSION) for t in texts]
        try:
            kwargs: dict = {"model": settings.EMBEDDING_MODEL, "input": texts}
            if settings.LITELLM_PROXY_URL:
                kwargs["api_base"] = settings.LITELLM_PROXY_URL
                if settings.LITELLM_PROXY_API_KEY:
                    kwargs["api_key"] = settings.LITELLM_PROXY_API_KEY
            elif settings.OPENAI_API_KEY:
                kwargs["api_key"] = settings.OPENAI_API_KEY
            response = await litellm.aembedding(**kwargs)
            vectors = [item["embedding"] for item in response.data]
            # Guard against dimension mismatch with the pgvector column.
            for i, vector in enumerate(vectors):
                if len(vector) != settings.EMBEDDING_DIMENSION:
                    logger.warning(
                        "embedding_dimension_mismatch",
                        extra={"expected": settings.EMBEDDING_DIMENSION, "got": len(vector)},
                    )
                    vectors[i] = (vector + [0.0] * settings.EMBEDDING_DIMENSION)[: settings.EMBEDDING_DIMENSION]
            return vectors
        except Exception as exc:  # noqa: BLE001
            logger.warning("embedding_provider_failed_fallback", extra={"error": str(exc)[:300]})
            return [_fallback_embedding(t, settings.EMBEDDING_DIMENSION) for t in texts]
