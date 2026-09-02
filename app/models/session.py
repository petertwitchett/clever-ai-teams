"""Chat session and orchestration run models."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, MetadataMixin, TimestampMixin, UUIDPrimaryKeyMixin, short_string, utcnow
from app.models.enums import RunStatus, SessionStatus


class ChatSession(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """User chat session bound to a compiled agent graph.

    A session tracks the conversational lifecycle, token usage, and orchestration
    run history. Each user message spawns a new orchestration run.
    """

    __tablename__ = "chat_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    graph_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_graphs.id"), nullable=False, index=True
    )

    title: Mapped[str] = short_string(255, nullable=False)
    status: Mapped[SessionStatus] = short_string(32, nullable=False, default=SessionStatus.ACTIVE, index=True)

    # Token budget tracking
    total_input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=utcnow)

    # Relationships
    runs: Mapped[list["OrchestrationRun"]] = relationship(
        "OrchestrationRun", back_populates="session", cascade="all, delete-orphan", order_by="OrchestrationRun.created_at"
    )
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="session", cascade="all, delete-orphan", order_by="Message.created_at"
    )

    __table_args__ = (Index("ix_chat_sessions_user_status", "user_id", "status"),)

    def __repr__(self) -> str:
        return f"<ChatSession id={self.id} user={self.user_id} graph={self.graph_id}>"


class OrchestrationRun(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """Single orchestration run triggered by a user prompt.

    The run captures the full lifecycle of the Magentic-One dual-ledger execution:
    Task Ledger milestones, Progress Ledger steps, agent debates, tool calls, and
    the final synthesized response.
    """

    __tablename__ = "orchestration_runs"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=False, index=True
    )
    user_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", use_alter=True, name="fk_orchestration_runs_user_message"),
        nullable=True,
        index=True,
    )

    status: Mapped[RunStatus] = short_string(32, nullable=False, default=RunStatus.PENDING, index=True)

    # Task Ledger (outer loop)
    task_ledger: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Structure: {"milestones": [...], "facts": [...], "hypotheses": [...], "stall_count": 0}

    # Progress Ledger (inner loop)
    progress_ledger: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Structure: {"current_milestone_id": "...", "steps": [...], "iterations": 0}

    # Execution metrics
    step_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stall_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    replan_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Timestamps
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Token and cost tracking
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Final output
    final_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="runs")
    messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="run",
        foreign_keys="Message.run_id",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )

    __table_args__ = (
        Index("ix_orchestration_runs_session_status", "session_id", "status"),
        Index("ix_orchestration_runs_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<OrchestrationRun id={self.id} session={self.session_id} status={self.status}>"
