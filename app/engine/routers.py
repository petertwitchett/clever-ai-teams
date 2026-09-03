"""Conditional edge predicates for the multi-agent StateGraph.

Routing decisions are pure functions of the persisted state, which keeps the
graph deterministic and replayable from any checkpoint.
"""

from __future__ import annotations

from app.core.logging import get_logger
from app.engine.nodes import RunContext
from app.engine.state import MultiAgentState, all_milestones_resolved, next_pending_milestone

logger = get_logger(__name__)


def make_route_plan(ctx: RunContext):
    """After planning/advancing: synthesize, dispatch the next milestone, or stop."""

    def route_plan(state: MultiAgentState) -> str:
        ledger = state.get("task_ledger") or {}
        if all_milestones_resolved(ledger):  # type: ignore[arg-type]
            return "synthesize"
        if int(state.get("step_count", 0)) >= min(
            ctx.dsl.orchestrator.max_steps, 200
        ):
            logger.info("route_plan_max_steps", extra={"run_id": str(ctx.run_id)})
            return "synthesize"
        if next_pending_milestone(ledger) is None:  # type: ignore[arg-type]
            return "synthesize"
        return "dispatch"

    return route_plan


def make_route_dispatch(ctx: RunContext):
    """Route the directive to the specialist person node that owns the milestone."""

    def route_dispatch(state: MultiAgentState) -> str:
        progress = state.get("progress_ledger") or {}
        assigned = progress.get("assigned_node")
        valid = set(ctx.specialist_keys())
        if assigned in valid:
            return f"person__{assigned}"
        fallback = next(iter(sorted(valid)), None)
        if fallback is None:
            return "synthesize"
        logger.warning(
            "route_dispatch_fallback", extra={"assigned": assigned, "fallback": fallback}
        )
        return f"person__{fallback}"

    return route_dispatch


def make_route_review(ctx: RunContext):
    """After review: advance, retry with critique, or stall into replanning."""

    def route_review(state: MultiAgentState) -> str:
        progress = state.get("progress_ledger") or {}
        ledger = state.get("task_ledger") or {}
        status = progress.get("review_status")
        attempt = int(progress.get("attempt", 1))
        max_reviews = ctx.dsl.orchestrator.max_review_iterations
        stall_limit = ctx.dsl.orchestrator.stall_limit
        replan_count = int(ledger.get("replan_count", 0))

        if status == "accepted":
            return "advance"

        # Rejected: retry with the critique while attempts remain.
        if attempt <= max_reviews:
            return "retry"

        # Retries exhausted. Replan while the stall budget allows it, otherwise
        # accept the artifact with reservations so the run can still finish.
        if attempt > max_reviews and replan_count < 2 and attempt >= stall_limit:
            return "stall"
        return "advance"

    return route_review
