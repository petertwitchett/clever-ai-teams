"""Typed LangGraph state channels for the multi-agent runtime.

Channel semantics:
- ``task_ledger``        direct assignment; replaced atomically on (re)planning
- ``progress_ledger``    direct assignment; inner-loop dispatch/review status
- ``messages``           ``add_messages`` reducer (append-only, dedup by id)
- ``deliberation_trace`` ``operator.add`` reducer (append-only observability)
- ``final_response``     synthesized answer streamed to the consumer chat

Human-in-the-loop approval does not use a state channel: the pending payload
lives in LangGraph's own ``interrupt()`` record inside the checkpoint, which is
what ``Command(resume=...)`` answers. Keeping it out of the state avoids two
sources of truth for the same pending decision.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

MilestoneState = Literal[
    "pending", "in_progress", "under_review", "verified", "rejected", "skipped", "failed"
]
ReviewState = Literal["awaiting_execution", "in_review", "accepted", "rejected", "not_required"]


class Milestone(TypedDict, total=False):
    """A single unit of the Task Ledger plan."""

    id: str
    title: str
    description: str
    assigned_node: str
    verification_criteria: str
    status: MilestoneState
    artifact: str | None
    review_iterations: int
    review_note: str


class TaskLedger(TypedDict, total=False):
    """Outer planning loop state (Magentic-One)."""

    goal: str
    facts: list[str]
    hypotheses: list[str]
    milestones: list[Milestone]
    stall_count: int
    replan_count: int


class ProgressLedger(TypedDict, total=False):
    """Inner execution loop state (Magentic-One)."""

    current_milestone_id: str | None
    assigned_node: str | None
    directive: str | None
    artifact: str | None
    review_status: ReviewState
    review_critique: str | None
    reviewer_node: str | None
    attempt: int
    completed: list[str]
    failed: list[str]


class MultiAgentState(TypedDict, total=False):
    """Root graph state persisted by the checkpointer after every transition."""

    # conversation
    goal: str
    messages: Annotated[list[BaseMessage], add_messages]

    # dual ledgers
    task_ledger: TaskLedger
    progress_ledger: ProgressLedger

    # observability (append-only)
    deliberation_trace: Annotated[list[dict[str, Any]], operator.add]

    # output
    final_response: str | None

    # accounting (append-only; summed by the runner)
    usage: Annotated[list[dict[str, Any]], operator.add]

    # bookkeeping
    step_count: int


def new_task_ledger(goal: str) -> TaskLedger:
    return TaskLedger(
        goal=goal, facts=[], hypotheses=[], milestones=[], stall_count=0, replan_count=0
    )


def new_progress_ledger() -> ProgressLedger:
    return ProgressLedger(
        current_milestone_id=None,
        assigned_node=None,
        directive=None,
        artifact=None,
        review_status="awaiting_execution",
        review_critique=None,
        reviewer_node=None,
        attempt=0,
        completed=[],
        failed=[],
    )


def next_pending_milestone(ledger: TaskLedger) -> Milestone | None:
    """First milestone that still needs work."""
    for milestone in ledger.get("milestones", []):
        if milestone.get("status") not in ("verified", "skipped"):
            return milestone
    return None


def milestone_by_id(ledger: TaskLedger, milestone_id: str | None) -> Milestone | None:
    if milestone_id is None:
        return None
    for milestone in ledger.get("milestones", []):
        if milestone.get("id") == milestone_id:
            return milestone
    return None


def all_milestones_resolved(ledger: TaskLedger) -> bool:
    milestones = ledger.get("milestones", [])
    if not milestones:
        return True
    return all(m.get("status") in ("verified", "skipped") for m in milestones)


def usage_totals(state: MultiAgentState) -> dict[str, float]:
    """Aggregate the append-only usage channel."""
    totals = {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
    for entry in state.get("usage", []) or []:
        totals["input_tokens"] += int(entry.get("input_tokens", 0) or 0)
        totals["output_tokens"] += int(entry.get("output_tokens", 0) or 0)
        totals["cost_usd"] += float(entry.get("cost_usd", 0.0) or 0.0)
    return totals
