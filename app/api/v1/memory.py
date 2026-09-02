"""Agent memory management endpoints (/api/v1/memory)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession, rate_limit
from app.api.v1.personas import _get_node_checked
from app.core.errors import NotFoundError
from app.models import AgentMemory, MemoryType
from app.schemas import MemoryCreate, MemoryOut, MemorySearchHit, MemorySearchRequest, Page, StatusResponse
from app.services.memory import MemoryService

router = APIRouter(prefix="/memory", tags=["Agent Memory"], dependencies=[Depends(rate_limit)])


@router.post(
    "/nodes/{node_id}",
    response_model=MemoryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Append a memory to a person node",
    description="Embeds the content and writes it to the node's semantic archival memory (core_memory_append).",
)
async def append_memory(node_id: uuid.UUID, payload: MemoryCreate, db: DBSession, user: CurrentUser) -> AgentMemory:
    await _get_node_checked(db, node_id, user)
    return await MemoryService.append(
        db, node_id, payload.content, memory_type=payload.memory_type, importance=payload.importance
    )


@router.get("/nodes/{node_id}", response_model=Page[MemoryOut], summary="Browse a node's memories")
async def list_memories(
    node_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    memory_type: MemoryType | None = Query(default=None),
) -> Page[MemoryOut]:
    await _get_node_checked(db, node_id, user)
    base = select(AgentMemory).where(AgentMemory.node_id == node_id)
    if memory_type is not None:
        base = base.where(AgentMemory.memory_type == memory_type)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(AgentMemory.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return Page(items=[MemoryOut.model_validate(m) for m in rows], total=total, limit=limit, offset=offset)


@router.post(
    "/nodes/{node_id}/search",
    response_model=list[MemorySearchHit],
    summary="Semantic memory search",
    description="pgvector cosine-similarity search over the node's archival memory (archival_memory_search).",
)
async def search_memories(
    node_id: uuid.UUID, payload: MemorySearchRequest, db: DBSession, user: CurrentUser
) -> list[MemorySearchHit]:
    await _get_node_checked(db, node_id, user)
    hits = await MemoryService.search(
        db, node_id, payload.query, memory_type=payload.memory_type, top_k=payload.top_k
    )
    return [
        MemorySearchHit(memory=MemoryOut.model_validate(memory), similarity=round(score, 4))
        for memory, score in hits
    ]


@router.delete("/{memory_id}", response_model=StatusResponse, summary="Delete a memory entry")
async def delete_memory(memory_id: uuid.UUID, db: DBSession, user: CurrentUser) -> StatusResponse:
    memory = await db.get(AgentMemory, memory_id)
    if memory is None:
        raise NotFoundError(f"Memory {memory_id} not found")
    await _get_node_checked(db, memory.node_id, user)
    await db.delete(memory)
    return StatusResponse(detail="Memory deleted")
