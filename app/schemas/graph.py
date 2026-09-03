"""Graph, node, and edge API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import EdgeChannel, GraphStatus, NodeType
from app.schemas.common import APIModel
from app.schemas.dsl import GraphDSL


class GraphCreate(BaseModel):
    """Create a new (draft) graph, optionally with an initial DSL."""

    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)
    dsl: GraphDSL | None = Field(default=None, description="Optional initial DSL document.")
    canvas_layout: dict[str, Any] = Field(default_factory=dict)
    is_public: bool = False


class GraphUpdate(BaseModel):
    """Patch a graph's metadata, layout, or DSL.

    Supplying ``dsl`` saves the canvas *without* compiling it, which is what an
    autosaving editor needs: work in progress is persisted even when the graph is
    structurally incomplete. Call ``/compile`` to promote it to executable.
    """

    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)
    dsl: GraphDSL | None = Field(
        default=None,
        description="Persist the canvas DSL without compiling (draft save).",
    )
    canvas_layout: dict[str, Any] | None = None
    is_public: bool | None = None
    max_steps: int | None = Field(default=None, ge=1, le=500)
    stall_limit: int | None = Field(default=None, ge=1, le=50)
    timeout_seconds: int | None = Field(default=None, ge=30, le=7200)


class GraphCompileRequest(BaseModel):
    """Compile a DSL document into an executable graph.

    ``dsl`` may be omitted to recompile whatever is already stored on the graph
    (useful after a draft save, or to re-validate after a schema change).
    """

    dsl: GraphDSL | None = None
    canvas_layout: dict[str, Any] = Field(default_factory=dict, description="Raw canvas state for round-tripping.")


class CompilationIssue(BaseModel):
    """Single validation finding from the graph compiler."""

    severity: str = Field(description="error | warning")
    code: str
    message: str
    node_key: str | None = None
    edge_index: int | None = None


class GraphCompileResponse(BaseModel):
    """Compiler verdict."""

    graph_id: uuid.UUID
    status: GraphStatus
    version: int
    issues: list[CompilationIssue] = Field(default_factory=list)
    node_count: int
    edge_count: int


class PersonNodeOut(APIModel):
    """Person node representation."""

    id: uuid.UUID
    graph_id: uuid.UUID
    node_key: str
    node_type: NodeType
    display_name: str
    professional_role: str
    primary_duty: str
    persona_traits: dict[str, Any]
    constitutional_constraints: list[str]
    llm_provider: str | None
    llm_model: str | None
    temperature: float
    top_p: float
    max_tokens: int | None
    working_memory_window: int
    memory_retrieval_k: int
    assigned_skill_ids: list[str]
    position_x: float
    position_y: float
    created_at: datetime
    updated_at: datetime


class GraphEdgeOut(APIModel):
    """Edge representation."""

    id: uuid.UUID
    graph_id: uuid.UUID
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    channel: EdgeChannel
    bidirectional: bool
    conditions: dict[str, Any]


class GraphOut(APIModel):
    """Graph summary representation.

    The ``*_count`` fields let a canvas library render cards for many graphs from
    a single list call, instead of fetching every graph's detail (N+1).
    """

    id: uuid.UUID
    name: str
    description: str | None
    owner_id: uuid.UUID
    status: GraphStatus
    version: int
    is_public: bool
    is_template: bool
    compiled_at: datetime | None
    compilation_errors: list[str]
    max_steps: int
    stall_limit: int
    timeout_seconds: int
    created_at: datetime
    updated_at: datetime

    node_count: int = Field(default=0, description="Person nodes materialized on this graph.")
    edge_count: int = Field(default=0, description="Directed communication channels on this graph.")
    session_count: int = Field(default=0, description="Chat sessions bound to this graph.")


class GraphDetailOut(GraphOut):
    """Graph with full DSL, nodes and edges."""

    dsl: dict[str, Any]
    canvas_layout: dict[str, Any]
    nodes: list[PersonNodeOut] = Field(default_factory=list)
    edges: list[GraphEdgeOut] = Field(default_factory=list)


class PersonaUpdate(BaseModel):
    """Patch a person node's persona/brain configuration."""

    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    professional_role: str | None = Field(default=None, min_length=1, max_length=128)
    primary_duty: str | None = Field(default=None, min_length=1, max_length=2000)
    persona_traits: dict[str, Any] | None = None
    constitutional_constraints: list[str] | None = Field(default=None, max_length=20)
    llm_provider: str | None = Field(default=None, max_length=64)
    llm_model: str | None = Field(default=None, max_length=128)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    top_p: float | None = Field(default=None, ge=0.0, le=1.0)
    max_tokens: int | None = Field(default=None, ge=1, le=128_000)
    working_memory_window: int | None = Field(default=None, ge=1, le=100)
    memory_retrieval_k: int | None = Field(default=None, ge=0, le=25)
    assigned_skill_ids: list[str] | None = None
    position_x: float | None = None
    position_y: float | None = None
