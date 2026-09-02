"""Immutable message ledger: every communication event in the system.

Records user prompts, agent-to-agent dialogue, orchestrator directives, tool
calls/results and final syntheses. Messages are append-only; they form the
relational recall memory tier and the raw material for ExpeL post-mortems.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Float, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, MetadataMixin, TimestampMixin, UUIDPrimaryKeyMixin, short_string
from app.models.enums import MessageRole


class Message(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """A single immutable communication event."""

    __tablename__ = "messages"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=False, index=True
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orchestration_runs.id"), nullable=True, index=True
    )

    role: Mapped[MessageRole] = short_string(32, nullable=False, index=True)

    # Sender / recipient person nodes (null for user or system events)
    sender_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("person_nodes.id"), nullable=True, index=True
    )
    recipient_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("person_nodes.id"), nullable=True, index=True
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Structured payloads: milestone references, tool call arguments/results,
    # review verdicts, ledger snapshots ...
    structured_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # Event classification for the observability drawer (mirrors RunEventType)
    event_type: Mapped[str | None] = short_string(48, nullable=True, index=True)
    milestone_id: Mapped[str | None] = short_string(64, nullable=True)

    # Performance / accounting
    model_used: Mapped[str | None] = short_string(128, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    run = relationship("OrchestrationRun", back_populates="messages", foreign_keys=[run_id])

    __table_args__ = (
        Index("ix_messages_session_created", "session_id", "created_at"),
        Index("ix_messages_run_created", "run_id", "created_at"),
        Index("ix_messages_sender", "sender_node_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Message id={self.id} role={self.role} session={self.session_id}>"
