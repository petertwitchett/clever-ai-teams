"""Canvas graph management endpoints (/api/v1/graphs)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DBSession, rate_limit
from app.core.errors import AuthorizationError, NotFoundError, ValidationFailedError
from app.models import AgentGraph, ChatSession, GraphEdge, GraphStatus, PersonNode, UserRole
from app.schemas import (
    GraphCompileRequest,
    GraphCompileResponse,
    GraphCreate,
    GraphDetailOut,
    GraphOut,
    GraphUpdate,
    Page,
    StatusResponse,
)
from app.services.graph_compiler import compile_graph, validate_dsl

router = APIRouter(prefix="/graphs", tags=["Canvas Graph Management"], dependencies=[Depends(rate_limit)])


async def _get_owned_graph(db, graph_id: uuid.UUID, user, *, allow_public: bool = False) -> AgentGraph:
    graph = await db.get(AgentGraph, graph_id)
    if graph is None:
        raise NotFoundError(f"Graph {graph_id} not found")
    is_owner = graph.owner_id == user.id or user.role in (UserRole.ADMIN, UserRole.OPERATOR)
    if not is_owner and not (allow_public and graph.is_public):
        raise AuthorizationError("You do not have access to this graph")
    return graph


@router.post(
    "",
    response_model=GraphDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a graph",
    description="Creates a draft graph. Provide an initial DSL to compile it immediately.",
)
async def create_graph(payload: GraphCreate, db: DBSession, user: CurrentUser) -> AgentGraph:
    graph = AgentGraph(
        name=payload.name,
        description=payload.description,
        owner_id=user.id,
        status=GraphStatus.DRAFT,
        canvas_layout=payload.canvas_layout,
        is_public=payload.is_public,
        dsl={},
    )
    db.add(graph)
    await db.flush()
    if payload.dsl is not None:
        graph, _issues = await compile_graph(db, graph.id, payload.dsl, payload.canvas_layout)
    result = await db.execute(
        select(AgentGraph)
        .options(selectinload(AgentGraph.nodes), selectinload(AgentGraph.edges))
        .where(AgentGraph.id == graph.id)
    )
    return result.scalar_one()


@router.get(
    "",
    response_model=Page[GraphOut],
    summary="List graphs (canvas library)",
    description=(
        "Paginated library of agent graphs. Each item carries `node_count`, `edge_count` and "
        "`session_count` so a canvas picker can render many teams from one request without "
        "fetching each graph's detail.\n\n"
        "Supports free-text `search` over name/description, `status` filtering, `owned_only`, "
        "`compiled_only` (ready to chat with), and `sort` by `updated_at`, `created_at`, `name`, "
        "or `sessions`."
    ),
)
async def list_graphs(
    db: DBSession,
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status_filter: GraphStatus | None = Query(default=None, alias="status"),
    include_public: bool = Query(default=True, description="Include public graphs from other owners"),
    owned_only: bool = Query(default=False, description="Restrict to graphs owned by the caller"),
    compiled_only: bool = Query(
        default=False, description="Only graphs that can be chatted with (compiled or published)"
    ),
    search: str | None = Query(default=None, max_length=128, description="Free-text match on name/description"),
    sort: str = Query(default="updated_at", pattern="^(updated_at|created_at|name|sessions)$"),
) -> Page[GraphOut]:
    if owned_only or not include_public:
        conditions = AgentGraph.owner_id == user.id
    else:
        conditions = (AgentGraph.owner_id == user.id) | (AgentGraph.is_public.is_(True))

    # Correlated scalar subqueries keep this a single round trip regardless of
    # how many graphs exist (the canvas library can hold hundreds).
    node_count = (
        select(func.count(PersonNode.id))
        .where(PersonNode.graph_id == AgentGraph.id)
        .correlate(AgentGraph)
        .scalar_subquery()
    )
    edge_count = (
        select(func.count(GraphEdge.id))
        .where(GraphEdge.graph_id == AgentGraph.id)
        .correlate(AgentGraph)
        .scalar_subquery()
    )
    session_count = (
        select(func.count(ChatSession.id))
        .where(ChatSession.graph_id == AgentGraph.id)
        .correlate(AgentGraph)
        .scalar_subquery()
    )

    base = select(
        AgentGraph,
        node_count.label("node_count"),
        edge_count.label("edge_count"),
        session_count.label("session_count"),
    ).where(conditions)

    if status_filter:
        base = base.where(AgentGraph.status == status_filter)
    if compiled_only:
        base = base.where(AgentGraph.status.in_([GraphStatus.COMPILED, GraphStatus.PUBLISHED]))
    if search:
        pattern = f"%{search.strip()}%"
        base = base.where(AgentGraph.name.ilike(pattern) | AgentGraph.description.ilike(pattern))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    order_by = {
        "updated_at": AgentGraph.updated_at.desc(),
        "created_at": AgentGraph.created_at.desc(),
        "name": AgentGraph.name.asc(),
        "sessions": session_count.desc(),
    }[sort]

    rows = (await db.execute(base.order_by(order_by).limit(limit).offset(offset))).all()

    items = []
    for graph, n_count, e_count, s_count in rows:
        item = GraphOut.model_validate(graph)
        item.node_count = n_count or 0
        item.edge_count = e_count or 0
        item.session_count = s_count or 0
        items.append(item)

    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{graph_id}", response_model=GraphDetailOut, summary="Get graph with nodes and edges")
async def get_graph(graph_id: uuid.UUID, db: DBSession, user: CurrentUser) -> AgentGraph:
    await _get_owned_graph(db, graph_id, user, allow_public=True)
    result = await db.execute(
        select(AgentGraph)
        .options(selectinload(AgentGraph.nodes), selectinload(AgentGraph.edges))
        .where(AgentGraph.id == graph_id)
    )
    return result.scalar_one()


@router.patch("/{graph_id}", response_model=GraphOut, summary="Update graph metadata / layout")
async def update_graph(graph_id: uuid.UUID, payload: GraphUpdate, db: DBSession, user: CurrentUser) -> AgentGraph:
    graph = await _get_owned_graph(db, graph_id, user)
    for field in ("name", "description", "canvas_layout", "is_public"):
        value = getattr(payload, field)
        if value is not None:
            setattr(graph, field, value)
    await db.flush()
    return graph


@router.delete("/{graph_id}", response_model=StatusResponse, summary="Delete a graph")
async def delete_graph(graph_id: uuid.UUID, db: DBSession, user: CurrentUser) -> StatusResponse:
    graph = await _get_owned_graph(db, graph_id, user)
    await db.delete(graph)
    return StatusResponse(detail=f"Graph {graph_id} deleted")


@router.post(
    "/validate",
    response_model=GraphCompileResponse,
    summary="Validate a DSL document without persisting",
    description="Dry-run structural validation of a canvas DSL. Returns errors and warnings.",
)
async def validate_graph_dsl(payload: GraphCompileRequest, user: CurrentUser) -> GraphCompileResponse:
    issues = validate_dsl(payload.dsl)
    errors = [issue for issue in issues if issue.severity == "error"]
    return GraphCompileResponse(
        graph_id=uuid.UUID(int=0),
        status=GraphStatus.DRAFT if errors else GraphStatus.COMPILED,
        version=0,
        issues=issues,
        node_count=len(payload.dsl.nodes),
        edge_count=len(payload.dsl.edges),
    )


@router.post(
    "/{graph_id}/compile",
    response_model=GraphCompileResponse,
    summary="Compile a DSL into an executable graph",
    description=(
        "Validates the JSON DSL and, on success, rebuilds the person nodes and directed edges, "
        "marks the graph as compiled and bumps its version. Compilation errors keep the graph in draft."
    ),
)
async def compile_graph_endpoint(
    graph_id: uuid.UUID, payload: GraphCompileRequest, db: DBSession, user: CurrentUser
) -> GraphCompileResponse:
    await _get_owned_graph(db, graph_id, user)
    graph, issues = await compile_graph(db, graph_id, payload.dsl, payload.canvas_layout)
    return GraphCompileResponse(
        graph_id=graph.id,
        status=graph.status,
        version=graph.version,
        issues=issues,
        node_count=len(payload.dsl.nodes),
        edge_count=len(payload.dsl.edges),
    )


@router.post(
    "/{graph_id}/duplicate",
    response_model=GraphDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a graph into a new canvas",
    description=(
        "Clones an existing team into a fresh draft owned by the caller: DSL, canvas layout, "
        "person nodes and edges are copied, while runtime history (sessions, runs, messages) is "
        "not. This is the fast path for building many canvases from a known-good team.\n\n"
        "The clone is recompiled immediately when the source had a valid DSL, so it is ready to "
        "chat with; otherwise it stays a draft."
    ),
)
async def duplicate_graph(
    graph_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
    name: str | None = Query(default=None, max_length=128, description="Name for the clone"),
) -> AgentGraph:
    source = await _get_owned_graph(db, graph_id, user, allow_public=True)

    clone = AgentGraph(
        name=(name or f"{source.name} (copy)")[:128],
        description=source.description,
        owner_id=user.id,
        status=GraphStatus.DRAFT,
        dsl=source.dsl or {},
        canvas_layout=source.canvas_layout or {},
        max_steps=source.max_steps,
        stall_limit=source.stall_limit,
        timeout_seconds=source.timeout_seconds,
        is_public=False,
        is_template=False,
    )
    db.add(clone)
    await db.flush()

    # Recompile from the source DSL so nodes/edges are rebuilt for the clone
    # (rather than copying rows and re-pointing foreign keys by hand).
    if source.dsl:
        try:
            dsl = GraphDSL.model_validate(source.dsl)
        except PydanticValidationError:
            dsl = None
        if dsl is not None:
            if name:
                dsl.metadata.name = name
            await compile_graph(db, clone.id, dsl, source.canvas_layout or {})

    result = await db.execute(
        select(AgentGraph)
        .options(selectinload(AgentGraph.nodes), selectinload(AgentGraph.edges))
        .where(AgentGraph.id == clone.id)
    )
    return result.scalar_one()


@router.post("/{graph_id}/publish", response_model=GraphOut, summary="Publish a compiled graph")
async def publish_graph(graph_id: uuid.UUID, db: DBSession, user: CurrentUser) -> AgentGraph:
    graph = await _get_owned_graph(db, graph_id, user)
    if graph.status not in (GraphStatus.COMPILED, GraphStatus.PUBLISHED):
        raise ValidationFailedError(f"Only compiled graphs can be published (current status: {graph.status}).")
    graph.status = GraphStatus.PUBLISHED
    await db.flush()
    return graph
