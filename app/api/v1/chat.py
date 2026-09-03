"""Real-time chat ingestion and streaming endpoints (/api/v1/chat).

Flow:
1. POST /chat/{session_id}/messages persists the user command, creates an
   OrchestrationRun and launches the Magentic-One engine as a background task.
   With stream=true the response is an SSE stream of live execution events
   (dual-stream: ledger_update / agent_debate frames + final_chunk frames).
2. GET /chat/runs/{run_id}/events attaches (or re-attaches) to a run's event
   stream - works across worker processes thanks to Redis pub/sub.
"""

from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, status
from sse_starlette.sse import EventSourceResponse

from app.api.deps import CurrentUser, DBSession, rate_limit
from app.api.v1.sessions import _get_session_checked
from app.core.config import settings
from app.core.errors import NotFoundError, ValidationFailedError
from app.core.logging import get_logger
from app.models import ChatSession, Message, MessageRole, OrchestrationRun, RunStatus, UserRole
from app.schemas import ChatMessageRequest, RunEventOut, RunOut, StatusResponse
from app.services.event_bus import EventBus

logger = get_logger(__name__)

router = APIRouter(prefix="/chat", tags=["Real-Time Chat & Streaming"], dependencies=[Depends(rate_limit)])

# Keep strong references to fire-and-forget run tasks (asyncio requirement).
_background_runs: set[asyncio.Task] = set()


def _run_executor():
    """Select the orchestration engine entrypoint."""
    if settings.ORCHESTRATION_ENGINE == "langgraph":
        from app.engine.runner import execute_langgraph_run

        return execute_langgraph_run
    from app.services.orchestrator import execute_run

    return execute_run


def _launch_run(run_id: uuid.UUID) -> None:
    executor = _run_executor()
    task = asyncio.create_task(executor(run_id), name=f"run-{run_id}")
    _background_runs.add(task)
    task.add_done_callback(_background_runs.discard)


async def _create_run(db, session: ChatSession, content: str) -> OrchestrationRun:
    user_message = Message(
        session_id=session.id,
        role=MessageRole.USER,
        content=content,
        event_type="user_command",
    )
    db.add(user_message)
    await db.flush()

    run = OrchestrationRun(
        session_id=session.id,
        user_message_id=user_message.id,
        status=RunStatus.PENDING,
        task_ledger={},
        progress_ledger={},
    )
    db.add(run)
    await db.flush()
    user_message.run_id = run.id
    await db.flush()
    return run


def _sse_frames(run_id: uuid.UUID):
    """Adapt EventBus frames into SSE protocol events."""

    async def generator():
        async for frame in EventBus.subscribe(run_id):
            yield {
                "event": frame.get("event", "message"),
                "data": json.dumps(frame, ensure_ascii=False, default=str),
            }

    return generator()


@router.post(
    "/{session_id}/messages",
    summary="Send a command to the team",
    description=(
        "Submits a high-level goal to the session's agent graph. The Orchestrator node decomposes it "
        "into a Task Ledger, dispatches subtasks to specialists, runs dialectical reviews and streams "
        "the synthesized answer.\n\n"
        "With `stream=true` (default) the response is a Server-Sent Events stream with frames: "
        "`run_started`, `plan_created`, `ledger_update`, `subtask_dispatch`, `agent_thinking`, "
        "`agent_debate`, `tool_call`, `tool_result`, `review_verdict`, `milestone_complete`, "
        "`stall_detected`, `replan`, `final_chunk`, `run_completed`, `error`, `heartbeat`.\n\n"
        "With `stream=false` the endpoint returns the run descriptor immediately; poll "
        "`GET /chat/runs/{run_id}` or attach to `GET /chat/runs/{run_id}/events`."
    ),
    status_code=status.HTTP_201_CREATED,
    response_model=None,
    responses={
        201: {"description": "Run descriptor (stream=false) or SSE stream (stream=true)."},
    },
)
async def send_message(session_id: uuid.UUID, payload: ChatMessageRequest, db: DBSession, user: CurrentUser):
    session = await _get_session_checked(db, session_id, user)
    run = await _create_run(db, session, payload.content)
    await db.commit()  # make the run visible to the background task's own session

    _launch_run(run.id)

    if payload.stream:
        return EventSourceResponse(_sse_frames(run.id), media_type="text/event-stream")
    return RunOut.model_validate(run)


@router.get("/runs/{run_id}", response_model=RunOut, summary="Inspect a run (ledgers, status, result)")
async def get_run(run_id: uuid.UUID, db: DBSession, user: CurrentUser) -> OrchestrationRun:
    run = await db.get(OrchestrationRun, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id} not found")
    await _get_session_checked(db, run.session_id, user)
    return run


@router.get(
    "/runs/{run_id}/events",
    summary="Attach to a run's live event stream (SSE)",
    description=(
        "Server-Sent Events stream for the run. Replays all recorded frames first (late-join safe), then "
        "streams live events until `run_completed` or `error`. Heartbeat frames keep proxies alive."
    ),
)
async def stream_run_events(run_id: uuid.UUID, db: DBSession, user: CurrentUser):
    run = await db.get(OrchestrationRun, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id} not found")
    await _get_session_checked(db, run.session_id, user)
    return EventSourceResponse(_sse_frames(run_id), media_type="text/event-stream")


@router.get(
    "/runs/{run_id}/events/history",
    response_model=list[RunEventOut],
    summary="Replay recorded run events (JSON)",
)
async def run_event_history(run_id: uuid.UUID, db: DBSession, user: CurrentUser) -> list[RunEventOut]:
    run = await db.get(OrchestrationRun, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id} not found")
    await _get_session_checked(db, run.session_id, user)
    frames = await EventBus.replay(run_id)
    return [RunEventOut(**frame) for frame in frames]


@router.post("/runs/{run_id}/cancel", response_model=StatusResponse, summary="Request run cancellation")
async def cancel_run(run_id: uuid.UUID, db: DBSession, user: CurrentUser) -> StatusResponse:
    run = await db.get(OrchestrationRun, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id} not found")
    await _get_session_checked(db, run.session_id, user)
    for task in list(_background_runs):
        if task.get_name() == f"run-{run_id}":
            task.cancel()
            return StatusResponse(detail="Cancellation signalled to the running task.")
    if not RunStatus(run.status).is_terminal:
        run.status = RunStatus.CANCELLED
        await db.flush()
        return StatusResponse(detail="Run marked cancelled (it was not executing on this worker).")
    return StatusResponse(detail=f"Run already terminal ({run.status}).")


@router.post(
    "/runs/{run_id}/resume",
    response_model=StatusResponse,
    summary="Resume a run suspended for human approval (HITL)",
    description=(
        "Resumes a LangGraph run paused by an `interrupt()` gate — for example when a specialist "
        "synthesized new sandboxed code that requires operator approval. The graph reloads its "
        "persisted checkpoint and continues from the exact suspension point.\n\n"
        "Send `{\"approved\": true}` to allow execution, or `{\"approved\": false}` to reject it."
    ),
)
async def resume_run_endpoint(
    run_id: uuid.UUID, payload: dict, db: DBSession, user: CurrentUser
) -> StatusResponse:
    run = await db.get(OrchestrationRun, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id} not found")
    await _get_session_checked(db, run.session_id, user)
    if settings.ORCHESTRATION_ENGINE != "langgraph":
        raise ValidationFailedError("Run resumption requires the LangGraph engine.")

    from app.engine.runner import resume_run

    async def _resume() -> None:
        try:
            await resume_run(run_id, payload)
        except Exception:  # noqa: BLE001
            logger.exception("resume_failed", extra={"run_id": str(run_id)})

    task = asyncio.create_task(_resume(), name=f"run-{run_id}")
    _background_runs.add(task)
    task.add_done_callback(_background_runs.discard)
    return StatusResponse(detail="Resume signal accepted; the graph is continuing from its checkpoint.")


@router.get(
    "/runs/{run_id}/checkpoints",
    summary="Time-travel: list persisted graph checkpoints",
    description=(
        "Returns the LangGraph checkpoint history for the run (most recent first): the pending next "
        "node, step counter and milestone snapshot at each transition. Requires the LangGraph engine "
        "with checkpointing enabled."
    ),
)
async def run_checkpoints(
    run_id: uuid.UUID, db: DBSession, user: CurrentUser, limit: int = 20
) -> list[dict]:
    run = await db.get(OrchestrationRun, run_id)
    if run is None:
        raise NotFoundError(f"Run {run_id} not found")
    await _get_session_checked(db, run.session_id, user)
    if settings.ORCHESTRATION_ENGINE != "langgraph":
        return []

    from app.engine.runner import get_run_state_history

    return await get_run_state_history(run_id, limit=limit)
