"""Voyager-style executable skill library with vector retrieval.

Skills are validated Python functions with natural-language docstrings. The
docstring is embedded so the agent can retrieve relevant tools by semantic
similarity against an incoming subtask description.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base, MetadataMixin, TimestampMixin, UUIDPrimaryKeyMixin, short_string
from app.models.enums import SkillStatus


class AgentSkill(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """Executable skill owned by a person node (or shared when node_id is null)."""

    __tablename__ = "agent_skills"

    node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("person_nodes.id"), nullable=True, index=True
    )

    name: Mapped[str] = short_string(128, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)  # docstring used for retrieval
    code: Mapped[str] = mapped_column(Text, nullable=False)  # validated Python source
    entrypoint: Mapped[str] = short_string(128, nullable=False, default="run")

    # JSON schema for the function arguments (extracted by the skill compiler)
    parameters_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    status: Mapped[SkillStatus] = short_string(32, nullable=False, default=SkillStatus.CANDIDATE, index=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.EMBEDDING_DIMENSION), nullable=True)

    # Provenance and usage statistics
    origin_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orchestration_runs.id"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_latency_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("node_id", "name", "version", name="uq_agent_skills_node_name_version"),
        Index("ix_agent_skills_node_status", "node_id", "status"),
        Index(
            "ix_agent_skills_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    def __repr__(self) -> str:
        return f"<AgentSkill id={self.id} name={self.name} status={self.status}>"


class SkillExecution(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Audit record for a sandboxed skill execution."""

    __tablename__ = "skill_executions"

    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_skills.id"), nullable=False, index=True
    )
    node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("person_nodes.id"), nullable=True, index=True
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orchestration_runs.id"), nullable=True, index=True
    )

    arguments: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stdout: Mapped[str | None] = mapped_column(Text, nullable=True)
    stderr: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<SkillExecution id={self.id} skill={self.skill_id} success={self.success}>"
