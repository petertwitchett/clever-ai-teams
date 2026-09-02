"""Chat session, message, run, memory and skill API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import (
    MemoryType,
    MessageRole,
    PostMortemStatus,
    RunStatus,
    SessionStatus,
    SkillStatus,
)
from app.schemas.common import APIModel

# ------------------------------------------------------------------ sessions --


class SessionCreate(BaseModel):
    """Open a new chat session bound to a compiled graph."""

    graph_id: uuid.UUID = Field(description="A compiled or published agent graph.")
    title: str | None = Field(default=None, max_length=255, description="Optional title (auto-generated otherwise).")


class SessionOut(APIModel):
    id: uuid.UUID
    user_id: uuid.UUID
    graph_id: uuid.UUID
    title: str
    status: SessionStatus
    total_input_tokens: int
    total_output_tokens: int
    total_cost_usd: float
    last_message_at: datetime | None
    created_at: datetime


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: SessionStatus | None = None


# ------------------------------------------------------------------ messages --


class ChatMessageRequest(BaseModel):
    """User command submitted to the team."""

    content: str = Field(min_length=1, max_length=32_000, description="The high-level goal or question.")
    stream: bool = Field(default=True, description="Stream execution events over SSE.")


class MessageOut(APIModel):
    id: uuid.UUID
    session_id: uuid.UUID
    run_id: uuid.UUID | None
    role: MessageRole
    sender_node_id: uuid.UUID | None
    recipient_node_id: uuid.UUID | None
    content: str
    structured_data: dict[str, Any]
    event_type: str | None
    milestone_id: str | None
    model_used: str | None
    input_tokens: int
    output_tokens: int
    latency_ms: int | None
    cost_usd: float
    created_at: datetime


# ---------------------------------------------------------------------- runs --


class RunOut(APIModel):
    id: uuid.UUID
    session_id: uuid.UUID
    status: RunStatus
    task_ledger: dict[str, Any]
    progress_ledger: dict[str, Any]
    step_count: int
    stall_count: int
    replan_count: int
    started_at: datetime | None
    completed_at: datetime | None
    duration_ms: int | None
    input_tokens: int
    output_tokens: int
    cost_usd: float
    final_response: str | None
    error_message: str | None
    created_at: datetime


class RunEventOut(BaseModel):
    """A single SSE frame (also used for the run event replay endpoint)."""

    event: str = Field(description="Event type (ledger_update, agent_debate, final_chunk, ...).")
    data: dict[str, Any] = Field(default_factory=dict)
    run_id: uuid.UUID | None = None
    timestamp: datetime | None = None


# -------------------------------------------------------------------- memory --


class MemoryCreate(BaseModel):
    """Manually append a memory to a person node."""

    content: str = Field(min_length=1, max_length=16_000)
    memory_type: MemoryType = MemoryType.ARCHIVAL
    importance: float = Field(default=0.5, ge=0.0, le=1.0)


class MemoryOut(APIModel):
    id: uuid.UUID
    node_id: uuid.UUID
    memory_type: MemoryType
    content: str
    importance: float
    access_count: int
    last_accessed_at: datetime | None
    source_run_id: uuid.UUID | None
    created_at: datetime


class MemorySearchRequest(BaseModel):
    """Semantic similarity search over a node's archival memory."""

    query: str = Field(min_length=1, max_length=4000)
    memory_type: MemoryType | None = None
    top_k: int = Field(default=5, ge=1, le=25)


class MemorySearchHit(BaseModel):
    memory: MemoryOut
    similarity: float = Field(description="Cosine similarity in [0, 1].")


# -------------------------------------------------------------------- skills --


class SkillCreate(BaseModel):
    """Register a new executable skill (admin or agent generated)."""

    name: str = Field(min_length=1, max_length=128, pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$")
    description: str = Field(min_length=1, max_length=8000, description="Docstring used for semantic retrieval.")
    code: str = Field(min_length=1, max_length=64_000, description="Python source defining the entrypoint function.")
    entrypoint: str = Field(default="run", max_length=128, pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$")
    parameters_schema: dict[str, Any] = Field(default_factory=dict)
    node_id: uuid.UUID | None = Field(default=None, description="Owner node; null = shared library skill.")


class SkillOut(APIModel):
    id: uuid.UUID
    node_id: uuid.UUID | None
    name: str
    description: str
    code: str
    entrypoint: str
    parameters_schema: dict[str, Any]
    status: SkillStatus
    version: int
    usage_count: int
    success_count: int
    failure_count: int
    avg_latency_ms: float
    is_builtin: bool
    last_used_at: datetime | None
    created_at: datetime


class SkillExecuteRequest(BaseModel):
    """Execute a skill in the sandbox with the given arguments."""

    arguments: dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int | None = Field(default=None, ge=1, le=120)


class SkillExecuteResponse(BaseModel):
    success: bool
    result: Any = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int


class SkillSearchRequest(BaseModel):
    """Semantic search over the skill library."""

    query: str = Field(min_length=1, max_length=4000)
    node_id: uuid.UUID | None = None
    top_k: int = Field(default=5, ge=1, le=25)


class SkillSearchHit(BaseModel):
    skill: SkillOut
    similarity: float


# --------------------------------------------------------------- post-mortem --


class PostMortemOut(APIModel):
    id: uuid.UUID
    run_id: uuid.UUID
    status: PostMortemStatus
    attempts: int
    lessons_extracted: int
    skills_compiled: int
    error_message: str | None
    completed_at: datetime | None
    result: dict[str, Any]
    created_at: datetime
