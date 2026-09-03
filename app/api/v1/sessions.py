"""Chat session lifecycle endpoints (/api/v1/sessions)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession, rate_limit
from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.models import AgentGraph, ChatSession, GraphStatus, Message, OrchestrationRun, SessionStatus, UserRole
from app.schemas import MessageOut, Page, RunOut, SessionCreate, SessionOut, SessionUpdate, StatusResponse

router = APIRouter(prefix="/sessions", tags=["Chat Session Lifecycle"], dependencies=[Depends(rate_limit)])


async def _get_session_checked(db, session_id: uuid.UUID, user) -> ChatSession:
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise NotFoundError(f"Session {session_id} not found")
    if session.user_id != user.id and user.role not in (UserRole.ADMIN, UserRole.OPERATOR):
        raise AuthorizationError("You do not own this session")
    return session


@router.post(
    "",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Open a chat session",
    description="Binds a new conversation to a compiled/published agent graph (the selected team).",
)
async def create_session(payload: SessionCreate, db: DBSession, user: CurrentUser) -> ChatSession:
    graph = await db.get(AgentGraph, payload.graph_id)
    if graph is None:
        raise NotFoundError(f"Graph {payload.graph_id} not found")
    if graph.status not in (GraphStatus.COMPILED, GraphStatus.PUBLISHED):
        raise ValidationFailedError(f"Graph must be compiled before use (status: {graph.status}).")
    if graph.owner_id != user.id and not graph.is_public and user.role not in (UserRole.ADMIN, UserRole.OPERATOR):
        raise AuthorizationError("You do not have access to this graph")

    session = ChatSession(
        user_id=user.id,
        graph_id=graph.id,
        title=payload.title or f"Session with {graph.name}",
        status=SessionStatus.ACTIVE,
    )
    db.add(session)
    await db.flush()
    return session


@router.get(
    "",
    response_model=Page[SessionOut],
    summary="List my sessions (optionally scoped to one canvas)",
    description=(
        "Paginated conversation history for the caller. Pass `graph_id` to list only the "
        "conversations belonging to one canvas/team, which is what a canvas-scoped chat sidebar "
        "needs. Each item includes `graph_name`, `message_count` and `run_count` so the sidebar "
        "renders from a single request.\n\n"
        "Use `search` to match session titles."
    ),
)
async def list_sessions(
    db: DBSession,
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status_filter: SessionStatus | None = Query(default=None, alias="status"),
    graph_id: uuid.UUID | None = Query(default=None, description="Only sessions bound to this graph"),
    search: str | None = Query(default=None, max_length=128, description="Free-text match on session title"),
) -> Page[SessionOut]:
    message_count = (
        select(func.count(Message.id))
        .where(Message.session_id == ChatSession.id)
        .correlate(ChatSession)
        .scalar_subquery()
    )
    run_count = (
        select(func.count(OrchestrationRun.id))
        .where(OrchestrationRun.session_id == ChatSession.id)
        .correlate(ChatSession)
        .scalar_subquery()
    )

    base = (
        select(
            ChatSession,
            AgentGraph.name.label("graph_name"),
            AgentGraph.status.label("graph_status"),
            message_count.label("message_count"),
            run_count.label("run_count"),
        )
        .join(AgentGraph, AgentGraph.id == ChatSession.graph_id)
        .where(ChatSession.user_id == user.id)
    )

    if status_filter:
        base = base.where(ChatSession.status == status_filter)
    if graph_id is not None:
        base = base.where(ChatSession.graph_id == graph_id)
    if search:
        base = base.where(ChatSession.title.ilike(f"%{search.strip()}%"))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        await db.execute(
            base.order_by(ChatSession.last_message_at.desc().nulls_last()).limit(limit).offset(offset)
        )
    ).all()

    items = []
    for session, graph_name, graph_status, msg_count, r_count in rows:
        item = SessionOut.model_validate(session)
        item.graph_name = graph_name
        item.graph_status = str(graph_status) if graph_status is not None else None
        item.message_count = msg_count or 0
        item.run_count = r_count or 0
        items.append(item)

    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{session_id}", response_model=SessionOut, summary="Get a session")
async def get_session(session_id: uuid.UUID, db: DBSession, user: CurrentUser) -> ChatSession:
    return await _get_session_checked(db, session_id, user)


@router.patch("/{session_id}", response_model=SessionOut, summary="Rename or archive a session")
async def update_session(
    session_id: uuid.UUID, payload: SessionUpdate, db: DBSession, user: CurrentUser
) -> ChatSession:
    session = await _get_session_checked(db, session_id, user)
    if payload.title is not None:
        session.title = payload.title
    if payload.status is not None:
        session.status = payload.status
    await db.flush()
    return session


@router.delete("/{session_id}", response_model=StatusResponse, summary="Delete a session and its history")
async def delete_session(session_id: uuid.UUID, db: DBSession, user: CurrentUser) -> StatusResponse:
    session = await _get_session_checked(db, session_id, user)
    await db.delete(session)
    return StatusResponse(detail=f"Session {session_id} deleted")


@router.get(
    "/{session_id}/messages",
    response_model=Page[MessageOut],
    summary="Message history",
    description=(
        "Full immutable message ledger for the session: user prompts, orchestrator directives, "
        "agent debates, tool calls and final answers. Filter with include_internal=false to get "
        "only the user-visible conversation."
    ),
)
async def list_messages(
    session_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    include_internal: bool = Query(default=True, description="Include agent-to-agent traffic"),
) -> Page[MessageOut]:
    await _get_session_checked(db, session_id, user)
    base = select(Message).where(Message.session_id == session_id)
    if not include_internal:
        base = base.where(Message.role.in_(["user", "assistant"]))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(Message.created_at).limit(limit).offset(offset))).scalars().all()
    return Page(items=[MessageOut.model_validate(m) for m in rows], total=total, limit=limit, offset=offset)


@router.get("/{session_id}/runs", response_model=Page[RunOut], summary="Orchestration runs of a session")
async def list_runs(
    session_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Page[RunOut]:
    await _get_session_checked(db, session_id, user)
    base = select(OrchestrationRun).where(OrchestrationRun.session_id == session_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        (await db.execute(base.order_by(OrchestrationRun.created_at.desc()).limit(limit).offset(offset)))
        .scalars()
        .all()
    )
    return Page(items=[RunOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)
