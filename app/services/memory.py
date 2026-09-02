"""Tiered memory service.

- Working memory: recent dialogue turns cached in Redis per (session, node).
- Relational recall: the immutable message ledger in PostgreSQL.
- Semantic archival: pgvector similarity search over agent_memories.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis_client import get_redis
from app.models import AgentMemory, MemoryType
from app.services.embeddings import EmbeddingService

logger = get_logger(__name__)


class MemoryService:
    """Facade over the tiered memory architecture."""

    # ------------------------------------------------------------ archival --

    @staticmethod
    async def append(
        db: AsyncSession,
        node_id: uuid.UUID,
        content: str,
        *,
        memory_type: MemoryType = MemoryType.ARCHIVAL,
        importance: float = 0.5,
        source_run_id: uuid.UUID | None = None,
        source_session_id: uuid.UUID | None = None,
        metadata: dict | None = None,
    ) -> AgentMemory:
        """Embed and persist a new archival memory (core_memory_append analog)."""
        embedding = await EmbeddingService.embed(content)
        memory = AgentMemory(
            node_id=node_id,
            memory_type=memory_type,
            content=content,
            embedding=embedding,
            importance=importance,
            source_run_id=source_run_id,
            source_session_id=source_session_id,
            meta=metadata or {},
        )
        db.add(memory)
        await db.flush()
        logger.debug("memory_appended", extra={"node_id": str(node_id), "type": str(memory_type)})
        return memory

    @staticmethod
    async def search(
        db: AsyncSession,
        node_id: uuid.UUID,
        query: str,
        *,
        memory_type: MemoryType | None = None,
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> list[tuple[AgentMemory, float]]:
        """Cosine similarity search over a node's archival memory."""
        if top_k <= 0:
            return []
        query_embedding = await EmbeddingService.embed(query)
        distance = AgentMemory.embedding.cosine_distance(query_embedding)
        stmt = (
            select(AgentMemory, (1 - distance).label("similarity"))
            .where(AgentMemory.node_id == node_id, AgentMemory.embedding.isnot(None))
            .order_by(distance)
            .limit(top_k)
        )
        if memory_type is not None:
            stmt = stmt.where(AgentMemory.memory_type == memory_type)
        rows = (await db.execute(stmt)).all()
        hits = [(row[0], float(row[1])) for row in rows if float(row[1]) >= min_similarity]

        # Update access statistics (importance-weighted retrieval bookkeeping).
        if hits:
            ids = [hit[0].id for hit in hits]
            await db.execute(
                update(AgentMemory)
                .where(AgentMemory.id.in_(ids))
                .values(access_count=AgentMemory.access_count + 1, last_accessed_at=datetime.now(timezone.utc))
            )
        return hits

    @staticmethod
    async def recent_lessons(
        db: AsyncSession, node_id: uuid.UUID, query: str, top_k: int = 5
    ) -> list[str]:
        """Top-k ExpeL lessons most relevant to the incoming subtask."""
        hits = await MemoryService.search(db, node_id, query, memory_type=MemoryType.LESSON, top_k=top_k)
        return [memory.content for memory, _ in hits]

    # ------------------------------------------------------ working memory --

    @staticmethod
    def _wm_key(session_id: uuid.UUID, node_id: uuid.UUID | str) -> str:
        return settings.redis_key("wm", str(session_id), str(node_id))

    @staticmethod
    async def push_working_memory(
        session_id: uuid.UUID, node_id: uuid.UUID | str, role: str, content: str, *, window: int = 10
    ) -> None:
        """Append a dialogue turn to a node's short-term buffer (Redis list)."""
        entry = json.dumps({"role": role, "content": content[:4000]}, ensure_ascii=False)
        try:
            async with get_redis() as r:
                key = MemoryService._wm_key(session_id, node_id)
                pipe = r.pipeline()
                pipe.rpush(key, entry)
                pipe.ltrim(key, -max(window, 1) * 2, -1)
                pipe.expire(key, 60 * 60 * 6)
                await pipe.execute()
        except Exception as exc:  # pragma: no cover
            logger.warning("working_memory_push_failed", extra={"error": str(exc)})

    @staticmethod
    async def get_working_memory(
        session_id: uuid.UUID, node_id: uuid.UUID | str, *, window: int = 10
    ) -> list[dict[str, str]]:
        """Read the recent turns for a node in this session."""
        try:
            async with get_redis() as r:
                key = MemoryService._wm_key(session_id, node_id)
                entries = await r.lrange(key, -max(window, 1) * 2, -1)
            return [json.loads(entry) for entry in entries]
        except Exception as exc:  # pragma: no cover
            logger.warning("working_memory_read_failed", extra={"error": str(exc)})
            return []
