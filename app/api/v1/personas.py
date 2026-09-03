"""Persona configuration endpoints (/api/v1/personas)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession, rate_limit
from app.core.errors import AuthorizationError, NotFoundError
from app.core.redis_client import CacheService
from app.models import AgentGraph, PersonNode, UserRole
from app.schemas import PersonaUpdate, PersonNodeOut

router = APIRouter(prefix="/personas", tags=["Persona Configuration"], dependencies=[Depends(rate_limit)])


async def _get_node_checked(db, node_id: uuid.UUID, user) -> PersonNode:
    node = await db.get(PersonNode, node_id)
    if node is None:
        raise NotFoundError(f"Person node {node_id} not found")
    graph = await db.get(AgentGraph, node.graph_id)
    if graph is None:
        raise NotFoundError("Parent graph not found")
    if graph.owner_id != user.id and user.role not in (UserRole.ADMIN, UserRole.OPERATOR):
        raise AuthorizationError("You do not own the graph containing this person")
    return node


@router.get("", response_model=list[PersonNodeOut], summary="List all person nodes across accessible graphs")
async def list_all_personas(db: DBSession, user: CurrentUser) -> list[PersonNode]:
    rows = (await db.execute(select(PersonNode).order_by(PersonNode.created_at.desc()))).scalars().all()
    return list(rows)


@router.get("/{node_id}", response_model=PersonNodeOut, summary="Get a person node configuration")
async def get_persona(node_id: uuid.UUID, db: DBSession, user: CurrentUser) -> PersonNode:
    return await _get_node_checked(db, node_id, user)


@router.get(
    "/by-graph/{graph_id}",
    response_model=list[PersonNodeOut],
    summary="List all person nodes of a graph",
)
async def list_personas(graph_id: uuid.UUID, db: DBSession, user: CurrentUser) -> list[PersonNode]:
    graph = await db.get(AgentGraph, graph_id)
    if graph is None:
        raise NotFoundError(f"Graph {graph_id} not found")
    if graph.owner_id != user.id and not graph.is_public and user.role not in (UserRole.ADMIN, UserRole.OPERATOR):
        raise AuthorizationError("You do not have access to this graph")
    rows = (await db.execute(select(PersonNode).where(PersonNode.graph_id == graph_id))).scalars().all()
    return list(rows)


@router.patch(
    "/{node_id}",
    response_model=PersonNodeOut,
    summary="Update a person node",
    description=(
        "Patch identity, psychological persona, constitutional constraints, brain binding "
        "(provider/model/temperature/top_p), memory limits, skills or canvas position. "
        "Note: recompiling the parent graph from a DSL overwrites these fields."
    ),
)
async def update_persona(node_id: uuid.UUID, payload: PersonaUpdate, db: DBSession, user: CurrentUser) -> PersonNode:
    node = await _get_node_checked(db, node_id, user)
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in data.items():
        setattr(node, field, value)
    await db.flush()
    # Invalidate the cached compiled DSL: runtime reads node rows, but keep it coherent.
    await CacheService.delete(f"graph_dsl:{node.graph_id}")
    return node
