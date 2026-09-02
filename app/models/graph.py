"""Agent graph models: graphs, person nodes, and directed edges."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, MetadataMixin, TimestampMixin, UUIDPrimaryKeyMixin, short_string
from app.models.enums import EdgeChannel, GraphStatus, NodeType


class AgentGraph(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """Multi-agent workflow graph with persona nodes and communication edges.

    The graph is designed in the canvas UI and compiled into a JSON DSL that
    drives the orchestrator runtime. It represents a reusable expert team.
    """

    __tablename__ = "agent_graphs"

    name: Mapped[str] = short_string(128, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[GraphStatus] = short_string(32, nullable=False, default=GraphStatus.DRAFT, index=True)

    # JSON DSL compiled from the canvas visual layout
    dsl: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    
    # Canvas layout metadata (node positions, zoom level, minimap state)
    canvas_layout: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # Compilation metadata
    compiled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    compilation_errors: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Orchestration constraints
    max_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    stall_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=900)

    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relationships (lazy loading to avoid circular imports at runtime)
    nodes: Mapped[list["PersonNode"]] = relationship("PersonNode", back_populates="graph", cascade="all, delete-orphan")
    edges: Mapped[list["GraphEdge"]] = relationship("GraphEdge", back_populates="graph", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_agent_graphs_owner_status", "owner_id", "status"),
        Index("ix_agent_graphs_public", "is_public", "status"),
    )

    def __repr__(self) -> str:
        return f"<AgentGraph id={self.id} name={self.name} status={self.status}>"


class PersonNode(Base, UUIDPrimaryKeyMixin, TimestampMixin, MetadataMixin):
    """Autonomous person node within an agent graph.

    Each person has a distinct identity, moral constraints, behavioral persona,
    assigned LLM brain, memory configuration, and skill set. The orchestrator
    dispatches subtasks to these nodes based on their role and duty.
    """

    __tablename__ = "person_nodes"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_graphs.id"), nullable=False, index=True
    )
    node_key: Mapped[str] = short_string(64, nullable=False)  # Unique within graph for DSL references
    node_type: Mapped[NodeType] = short_string(32, nullable=False, index=True)

    # Identity block
    display_name: Mapped[str] = short_string(128, nullable=False)
    professional_role: Mapped[str] = short_string(128, nullable=False)
    primary_duty: Mapped[str] = mapped_column(Text, nullable=False)

    # Psychological persona
    persona_traits: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Example: {"tone": "analytical", "temperament": "methodical", "quirks": ["..."], ...}

    # Constitutional ethics (immutable negative constraints)
    constitutional_constraints: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    # Brain binding
    llm_provider: Mapped[str | None] = short_string(64, nullable=True)  # e.g., "openai", "anthropic", "ollama"
    llm_model: Mapped[str | None] = short_string(128, nullable=True)  # e.g., "gpt-4o", "claude-3-5-sonnet-20241022"
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    top_p: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Memory configuration
    working_memory_window: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    memory_retrieval_k: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    # Skill attachment (vector IDs referencing agent_skills table)
    assigned_skill_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    # Canvas UI position
    position_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Relationships
    graph: Mapped["AgentGraph"] = relationship("AgentGraph", back_populates="nodes")

    __table_args__ = (
        UniqueConstraint("graph_id", "node_key", name="uq_person_nodes_graph_key"),
        Index("ix_person_nodes_graph_type", "graph_id", "node_type"),
    )

    def __repr__(self) -> str:
        return f"<PersonNode id={self.id} key={self.node_key} type={self.node_type}>"


class GraphEdge(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Directed communication channel between two person nodes.

    Edges define the topology of the multi-agent collaboration: who can dispatch
    subtasks to whom, who reviews whose work, and which nodes can collaborate
    laterally.
    """

    __tablename__ = "graph_edges"

    graph_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_graphs.id"), nullable=False, index=True
    )
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("person_nodes.id"), nullable=False, index=True
    )
    target_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("person_nodes.id"), nullable=False, index=True
    )

    channel: Mapped[EdgeChannel] = short_string(32, nullable=False)
    bidirectional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Optional activation conditions
    conditions: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    graph: Mapped["AgentGraph"] = relationship("AgentGraph", back_populates="edges")

    __table_args__ = (
        Index("ix_graph_edges_source", "source_node_id"),
        Index("ix_graph_edges_target", "target_node_id"),
        Index("ix_graph_edges_channel", "graph_id", "channel"),
    )

    def __repr__(self) -> str:
        return f"<GraphEdge id={self.id} {self.source_node_id} -> {self.target_node_id} ({self.channel})>"
