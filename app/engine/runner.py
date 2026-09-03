"""LangGraph run driver.

Executes a compiled graph with ``astream_events(version="v2")`` and translates
runtime events into the platform's SSE frame taxonomy, publishing them on the
Redis event bus so any worker's SSE consumer can observe the run.

Event mapping
-------------
``on_custom_event``  ledger_sync        -> LEDGER_UPDATE / PLAN_CREATED / MILESTONE_COMPLETE
                     deliberation_event -> AGENT_THINKING / AGENT_DEBATE / REVIEW_VERDICT / ...
                     content_delta      -> FINAL_CHUNK (main chat bubble)
``on_chain_start``   node entry (debug-level trace only)
interrupts           -> ERROR-free ``run_interrupted`` frame awaiting resume
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger, run_id_ctx
from app.models import RunEventType, RunStatus
from app.services.event_bus import EventBus

logger = get_logger(__name__)

_DELIBERATION_EVENT_MAP = {
    "agent_thinking": RunEventType.AGENT_THINKING,
    "agent_debate": RunEventType.AGENT_DEBATE,
    "review_verdict": RunEventType.REVIEW_VERDICT,
    "subtask_dispatch": RunEventType.SUBTASK_DISPATCH,
    "milestone_complete": RunEventType.MILESTONE_COMPLETE,
    "stall_detected": RunEventType.STALL_DETECTED,
    "replan": RunEventType.REPLAN,
    "tool_call": RunEventType.TOOL_CALL,
    "tool_result": RunEventType.TOOL_RESULT,
}

_LEDGER_PHASE_MAP = {
    "planned": RunEventType.PLAN_CREATED,
    "replanned": RunEventType.REPLAN,
    "dispatch": RunEventType.LEDGER_UPDATE,
    "milestone_complete": RunEventType.LEDGER_UPDATE,
    "stalled": RunEventType.LEDGER_UPDATE,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def execute_langgraph_run(run_id: uuid.UUID) -> None:
    """Run one orchestration through the LangGraph engine (owns its sessions)."""
    from langchain_core.messages import HumanMessage

    from app.core.database import get_async_session
    from app.engine.checkpointer import get_checkpointer
    from app.engine.factory import compile_graph_for_run
    from app.engine.state import (
        MultiAgentState,
        new_progress_ledger,
        new_task_ledger,
        usage_totals,
    )
    from app.models import ChatSession, Message, OrchestrationRun, PostMortemJob
    from app.models.enums import PostMortemStatus
    from app.services.graph_compiler import load_compiled_dsl

    token = run_id_ctx.set(str(run_id))
    started = _utcnow()

    try:
        # ---- load run/session/goal -----------------------------------------
        async with get_async_session() as db:
            run = await db.get(OrchestrationRun, run_id)
            if run is None:
                logger.error("run_not_found", extra={"run_id": str(run_id)})
                return
            session = await db.get(ChatSession, run.session_id)
            if session is None:
                logger.error("session_not_found_for_run", extra={"run_id": str(run_id)})
                return
            user_message = await db.get(Message, run.user_message_id) if run.user_message_id else None
            goal = user_message.content if user_message else "(missing user goal)"
            graph_id = session.graph_id
            session_id = session.id
            dsl = await load_compiled_dsl(db, graph_id)

            run.status = RunStatus.PLANNING
            run.started_at = started
            await db.commit()

        checkpointer = get_checkpointer()
        compiled, ctx = compile_graph_for_run(
            dsl,
            graph_id=graph_id,
            session_id=session_id,
            run_id=run_id,
            checkpointer=checkpointer,
        )

        await EventBus.publish(
            run_id,
            RunEventType.RUN_STARTED,
            {
                "goal": goal[:500],
                "graph": dsl.metadata.name,
                "team_size": len(dsl.nodes),
                "session_id": str(session_id),
                "engine": "langgraph",
                "checkpointing": bool(checkpointer),
            },
        )

        initial: MultiAgentState = {
            "goal": goal,
            "messages": [HumanMessage(content=goal)],
            "task_ledger": new_task_ledger(goal),
            "progress_ledger": new_progress_ledger(),
            "deliberation_trace": [],
            "final_response": None,
            "usage": [],
            "step_count": 0,
        }

        config: dict[str, Any] = {
            "configurable": {"thread_id": f"run-{run_id}", "checkpoint_ns": ""},
            "recursion_limit": settings.LANGGRAPH_RECURSION_LIMIT,
        }

        final_state = await _drive(compiled, initial, config, run_id)

        # ---- persist terminal state ----------------------------------------
        totals = usage_totals(final_state or {})
        completed = _utcnow()
        async with get_async_session() as db:
            run = await db.get(OrchestrationRun, run_id)
            session = await db.get(ChatSession, session_id)
            if run is None:
                return
            interrupted = bool((final_state or {}).get("__interrupt__"))
            run.task_ledger = dict((final_state or {}).get("task_ledger") or {})
            run.progress_ledger = dict((final_state or {}).get("progress_ledger") or {})
            run.final_response = (final_state or {}).get("final_response")
            run.input_tokens = int(totals["input_tokens"])
            run.output_tokens = int(totals["output_tokens"])
            run.cost_usd = float(totals["cost_usd"])
            run.step_count = int((final_state or {}).get("step_count", 0))
            run.stall_count = int(run.task_ledger.get("stall_count", 0))
            run.replan_count = int(run.task_ledger.get("replan_count", 0))
            run.completed_at = completed
            run.duration_ms = int((completed - started).total_seconds() * 1000)
            run.status = RunStatus.COMPLETED if not interrupted else RunStatus.REVIEWING

            if session is not None:
                session.total_input_tokens += run.input_tokens
                session.total_output_tokens += run.output_tokens
                session.total_cost_usd += run.cost_usd
                session.last_message_at = completed

            if run.status == RunStatus.COMPLETED:
                db.add(PostMortemJob(run_id=run.id, status=PostMortemStatus.QUEUED))
            await db.commit()

            if run.status == RunStatus.COMPLETED and settings.WORKER_MODE in ("sidecar", "external"):
                from app.worker import enqueue_post_mortem

                await enqueue_post_mortem(run.id)

            await EventBus.publish(
                run_id,
                RunEventType.RUN_COMPLETED,
                {
                    "status": str(run.status),
                    "duration_ms": run.duration_ms,
                    "input_tokens": run.input_tokens,
                    "output_tokens": run.output_tokens,
                    "cost_usd": round(run.cost_usd, 6),
                    "final_response": run.final_response,
                    "engine": "langgraph",
                },
            )
        logger.info(
            "langgraph_run_completed",
            extra={"run_id": str(run_id), "steps": run.step_count, "duration_ms": run.duration_ms},
        )

    except asyncio.CancelledError:
        await _mark_terminal(run_id, RunStatus.CANCELLED, "Run cancelled.")
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("langgraph_run_failed", extra={"run_id": str(run_id)})
        await _mark_terminal(run_id, RunStatus.FAILED, str(exc)[:4000])
    finally:
        run_id_ctx.reset(token)


async def _drive(compiled: Any, initial: Any, config: dict[str, Any], run_id: uuid.UUID) -> dict[str, Any]:
    """Consume astream_events(v2) and forward frames to the event bus."""
    async for event in compiled.astream_events(initial, config=config, version="v2"):
        kind = event.get("event")
        if kind != "on_custom_event":
            continue
        name = event.get("name")
        data = event.get("data") or {}

        if name == "content_delta":
            await EventBus.publish(run_id, RunEventType.FINAL_CHUNK, {"delta": data.get("delta", "")})
        elif name == "ledger_sync":
            phase = data.get("phase", "dispatch")
            frame = _LEDGER_PHASE_MAP.get(phase, RunEventType.LEDGER_UPDATE)
            await EventBus.publish(run_id, frame, data)
        elif name == "deliberation_event":
            frame = _DELIBERATION_EVENT_MAP.get(str(data.get("kind")), RunEventType.AGENT_DEBATE)
            await EventBus.publish(run_id, frame, data)

    # Final state (and any pending interrupt) from the checkpointer/graph.
    try:
        snapshot = await compiled.aget_state(config)
        state = dict(snapshot.values or {})
        if getattr(snapshot, "interrupts", None):
            state["__interrupt__"] = [
                getattr(i, "value", None) for i in snapshot.interrupts
            ]
            await EventBus.publish(
                run_id,
                RunEventType.LEDGER_UPDATE,
                {"phase": "interrupted", "interrupts": state["__interrupt__"]},
            )
        return state
    except Exception as exc:  # noqa: BLE001 - checkpointer may be disabled
        logger.warning("langgraph_state_fetch_failed", extra={"error": str(exc)[:300]})
        return {}


async def _mark_terminal(run_id: uuid.UUID, status: RunStatus, error: str | None) -> None:
    from app.core.database import get_async_session
    from app.models import OrchestrationRun

    async with get_async_session() as db:
        run = await db.get(OrchestrationRun, run_id)
        if run is None:
            return
        run.status = status
        run.error_message = error
        run.completed_at = _utcnow()
        if run.started_at:
            run.duration_ms = int((run.completed_at - run.started_at).total_seconds() * 1000)
        await db.commit()
    await EventBus.publish(run_id, RunEventType.ERROR, {"error": error or str(status)})


async def resume_run(run_id: uuid.UUID, resume_value: Any) -> dict[str, Any]:
    """Resume a run suspended by ``interrupt()`` (human-in-the-loop approval)."""
    from langgraph.types import Command

    from app.core.database import get_async_session
    from app.engine.checkpointer import get_checkpointer
    from app.engine.factory import compile_graph_for_run
    from app.models import ChatSession, OrchestrationRun
    from app.services.graph_compiler import load_compiled_dsl

    checkpointer = get_checkpointer()
    if checkpointer is None:
        raise RuntimeError("Checkpointing is disabled; interrupted runs cannot be resumed.")

    async with get_async_session() as db:
        run = await db.get(OrchestrationRun, run_id)
        if run is None:
            raise RuntimeError(f"Run {run_id} not found")
        session = await db.get(ChatSession, run.session_id)
        if session is None:
            raise RuntimeError("Session not found")
        dsl = await load_compiled_dsl(db, session.graph_id)
        graph_id, session_id = session.graph_id, session.id

    compiled, _ctx = compile_graph_for_run(
        dsl, graph_id=graph_id, session_id=session_id, run_id=run_id, checkpointer=checkpointer
    )
    config = {
        "configurable": {"thread_id": f"run-{run_id}", "checkpoint_ns": ""},
        "recursion_limit": settings.LANGGRAPH_RECURSION_LIMIT,
    }
    state = await _drive(compiled, Command(resume=resume_value), config, run_id)
    return state


async def get_run_state_history(run_id: uuid.UUID, limit: int = 20) -> list[dict[str, Any]]:
    """Time-travel: list persisted checkpoints for a run."""
    from app.core.database import get_async_session
    from app.engine.checkpointer import get_checkpointer
    from app.engine.factory import compile_graph_for_run
    from app.models import ChatSession, OrchestrationRun
    from app.services.graph_compiler import load_compiled_dsl

    checkpointer = get_checkpointer()
    if checkpointer is None:
        return []

    async with get_async_session() as db:
        run = await db.get(OrchestrationRun, run_id)
        if run is None:
            return []
        session = await db.get(ChatSession, run.session_id)
        if session is None:
            return []
        dsl = await load_compiled_dsl(db, session.graph_id)
        graph_id, session_id = session.graph_id, session.id

    compiled, _ctx = compile_graph_for_run(
        dsl, graph_id=graph_id, session_id=session_id, run_id=run_id, checkpointer=checkpointer
    )
    config = {"configurable": {"thread_id": f"run-{run_id}", "checkpoint_ns": ""}}

    history: list[dict[str, Any]] = []
    async for snapshot in compiled.aget_state_history(config):
        values = snapshot.values or {}
        history.append(
            {
                "checkpoint_id": (snapshot.config or {}).get("configurable", {}).get("checkpoint_id"),
                "next": list(snapshot.next or ()),
                "step_count": values.get("step_count"),
                "milestones": [
                    {k: m.get(k) for k in ("id", "title", "status", "assigned_node")}
                    for m in (values.get("task_ledger") or {}).get("milestones", [])
                ],
                "created_at": getattr(snapshot, "created_at", None),
            }
        )
        if len(history) >= limit:
            break
    return history
