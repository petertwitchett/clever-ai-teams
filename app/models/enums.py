"""Enumerations shared by ORM models, schemas and the orchestration engine."""

from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    """Platform level authorisation roles."""

    ADMIN = "admin"
    OPERATOR = "operator"
    USER = "user"


class GraphStatus(StrEnum):
    """Lifecycle of an agent graph on the canvas."""

    DRAFT = "draft"
    COMPILED = "compiled"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class NodeType(StrEnum):
    """Role archetype of a person node inside the graph."""

    ORCHESTRATOR = "orchestrator"
    SPECIALIST = "specialist"
    CRITIC = "critic"
    RESEARCHER = "researcher"
    DEVELOPER = "developer"
    VERIFIER = "verifier"
    SYNTHESIZER = "synthesizer"


class EdgeChannel(StrEnum):
    """Semantics of a directed edge between two person nodes."""

    SUBTASK_DISPATCH = "subtask_dispatch"
    DIALECTICAL_REVIEW = "dialectical_review"
    PEER_COLLABORATION = "peer_collaboration"
    ESCALATION = "escalation"
    SYNTHESIS = "synthesis"


class SessionStatus(StrEnum):
    """Lifecycle of a chat session."""

    ACTIVE = "active"
    IDLE = "idle"
    ARCHIVED = "archived"


class RunStatus(StrEnum):
    """Lifecycle of an orchestration run."""

    PENDING = "pending"
    PLANNING = "planning"
    EXECUTING = "executing"
    REVIEWING = "reviewing"
    REPLANNING = "replanning"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"

    @property
    def is_terminal(self) -> bool:
        return self in {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED, RunStatus.TIMEOUT}


class MilestoneStatus(StrEnum):
    """State of a single milestone in the Task Ledger."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    REJECTED = "rejected"
    SKIPPED = "skipped"
    FAILED = "failed"


class MessageRole(StrEnum):
    """Author category of a persisted message."""

    USER = "user"
    ASSISTANT = "assistant"
    AGENT = "agent"
    ORCHESTRATOR = "orchestrator"
    SYSTEM = "system"
    TOOL = "tool"
    CRITIC = "critic"


class MemoryType(StrEnum):
    """Category of an entry in the tiered memory store."""

    CORE = "core"
    ARCHIVAL = "archival"
    LESSON = "lesson"
    EXPERIENCE = "experience"
    FACT = "fact"
    PREFERENCE = "preference"


class SkillStatus(StrEnum):
    """Lifecycle of a Voyager-style executable skill."""

    CANDIDATE = "candidate"
    VERIFIED = "verified"
    DEPRECATED = "deprecated"
    QUARANTINED = "quarantined"


class RunEventType(StrEnum):
    """Server-sent event frame types streamed to the chat surface."""

    RUN_STARTED = "run_started"
    LEDGER_UPDATE = "ledger_update"
    PLAN_CREATED = "plan_created"
    REPLAN = "replan"
    SUBTASK_DISPATCH = "subtask_dispatch"
    AGENT_DEBATE = "agent_debate"
    AGENT_THINKING = "agent_thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    REVIEW_VERDICT = "review_verdict"
    MILESTONE_COMPLETE = "milestone_complete"
    STALL_DETECTED = "stall_detected"
    FINAL_CHUNK = "final_chunk"
    RUN_COMPLETED = "run_completed"
    ERROR = "error"
    HEARTBEAT = "heartbeat"


class ReviewVerdict(StrEnum):
    """Outcome of a dialectical review cycle."""

    APPROVED = "approved"
    REVISION_REQUESTED = "revision_requested"
    REJECTED = "rejected"


class PostMortemStatus(StrEnum):
    """Lifecycle of an asynchronous ExpeL post-mortem job."""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
