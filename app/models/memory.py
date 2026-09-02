"""Tiered agent memory: semantic archival memory with pgvector embeddings.

Each person node accumulates memories (facts, experiences, distilled lessons,
preferences) as 1536-dimensional embeddings, retrieved by cosine similarity
during persona assembly. This is the Letta/Mem0-style archival tier.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base, MetadataMixin, TimestampMixin, UUIDPrimaryKeyMixin, short_string
from app.models.enums import MemoryType, PostMortemStatus


class AgentMemory(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """A single archival memory entry belonging to a person node."""

    __tablename__ = "agent_memories"

    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("person_nodes.id"), nullable=False, index=True
    )
    memory_type: Mapped[MemoryType] = short_string(32, nullable=False, index=True)

    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)

    # Provenance
    source_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orchestration_runs.id"), nullable=True, index=True
    )
    source_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=True
    )

    # Retrieval statistics (importance-weighted retrieval)
    importance: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_agent_memories_node_type", "node_id", "memory_type"),
        Index(
            "ix_agent_memories_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    def __repr__(self) -> str:
        return f"<AgentMemory id={self.id} node={self.node_id} type={self.memory_type}>"


class PostMortemJob(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """Queued ExpeL post-mortem reflection job for a completed run."""

    __tablename__ = "post_mortem_jobs"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orchestration_runs.id"), nullable=False, index=True, unique=True
    )
    status: Mapped[PostMortemStatus] = short_string(32, nullable=False, default=PostMortemStatus.QUEUED, index=True)

    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lessons_extracted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skills_compiled: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    def __repr__(self) -> str:
        return f"<PostMortemJob id={self.id} run={self.run_id} status={self.status}>"
