"""Lifelong learning management endpoints (/api/v1/skills, memory, post-mortems)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select

from app.api.deps import AdminUser, CurrentUser, DBSession, rate_limit
from app.core.errors import AuthorizationError, NotFoundError
from app.models import AgentSkill, PostMortemJob, SkillStatus
from app.schemas import (
    Page,
    PostMortemOut,
    SkillCreate,
    SkillExecuteRequest,
    SkillExecuteResponse,
    SkillOut,
    SkillSearchHit,
    SkillSearchRequest,
    StatusResponse,
)
from app.services.skills import SkillService
from app.workers.learning import drain_post_mortem_queue

router = APIRouter(prefix="/skills", tags=["Lifelong Learning: Skills"], dependencies=[Depends(rate_limit)])


@router.post(
    "",
    response_model=SkillOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a skill",
    description=(
        "Registers an executable Python skill. The code is screened by the AST validator "
        "(stdlib allowlist, no filesystem/network/process access) and embedded into the vector "
        "skill catalog for semantic retrieval by person nodes."
    ),
)
async def create_skill(payload: SkillCreate, db: DBSession, user: CurrentUser) -> AgentSkill:
    if payload.node_id is not None:
        # Owner of the parent graph may attach skills to their own person nodes.
        from app.api.v1.personas import _get_node_checked

        await _get_node_checked(db, payload.node_id, user)
    elif user.role not in ("admin", "operator"):
        raise AuthorizationError("Shared (library) skills require an admin or operator role")
    return await SkillService.register(
        db,
        name=payload.name,
        description=payload.description,
        code=payload.code,
        entrypoint=payload.entrypoint,
        parameters_schema=payload.parameters_schema,
        node_id=payload.node_id,
    )


@router.get("", response_model=Page[SkillOut], summary="List skills")
async def list_skills(
    db: DBSession,
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    node_id: uuid.UUID | None = Query(default=None),
    status_filter: SkillStatus | None = Query(default=None, alias="status"),
) -> Page[SkillOut]:
    base = select(AgentSkill)
    if node_id is not None:
        base = base.where(AgentSkill.node_id == node_id)
    if status_filter is not None:
        base = base.where(AgentSkill.status == status_filter)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(AgentSkill.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return Page(items=[SkillOut.model_validate(s) for s in rows], total=total, limit=limit, offset=offset)


@router.get("/{skill_id}", response_model=SkillOut, summary="Get a skill")
async def get_skill(skill_id: uuid.UUID, db: DBSession, user: CurrentUser) -> AgentSkill:
    skill = await db.get(AgentSkill, skill_id)
    if skill is None:
        raise NotFoundError(f"Skill {skill_id} not found")
    return skill


@router.delete("/{skill_id}", response_model=StatusResponse, summary="Deprecate a skill")
async def deprecate_skill(skill_id: uuid.UUID, db: DBSession, user: CurrentUser) -> StatusResponse:
    skill = await db.get(AgentSkill, skill_id)
    if skill is None:
        raise NotFoundError(f"Skill {skill_id} not found")
    if skill.node_id is not None:
        from app.api.v1.personas import _get_node_checked

        await _get_node_checked(db, skill.node_id, user)
    elif user.role not in ("admin", "operator"):
        raise AuthorizationError("Shared (library) skills require an admin or operator role")
    skill.status = SkillStatus.DEPRECATED
    await db.flush()
    return StatusResponse(detail=f"Skill {skill.name} deprecated")


@router.post(
    "/search",
    response_model=list[SkillSearchHit],
    summary="Semantic skill search",
    description="Vector similarity search over skill docstrings (the Voyager retrieval path).",
)
async def search_skills(payload: SkillSearchRequest, db: DBSession, user: CurrentUser) -> list[SkillSearchHit]:
    hits = await SkillService.search(db, payload.query, node_id=payload.node_id, top_k=payload.top_k)
    return [SkillSearchHit(skill=SkillOut.model_validate(skill), similarity=round(score, 4)) for skill, score in hits]


@router.post(
    "/{skill_id}/execute",
    response_model=SkillExecuteResponse,
    summary="Execute a skill in the sandbox",
    description=(
        "Runs the skill inside the isolated sandbox subprocess (rlimit memory/CPU caps, import "
        "allowlist, no filesystem or network). Records an audit row and updates usage statistics."
    ),
)
async def execute_skill(
    skill_id: uuid.UUID, payload: SkillExecuteRequest, db: DBSession, user: CurrentUser
) -> SkillExecuteResponse:
    result = await SkillService.execute(db, skill_id, payload.arguments, timeout=payload.timeout_seconds)
    return SkillExecuteResponse(
        success=result.success,
        result=result.result if result.success else result.error,
        stdout=result.stdout or "",
        stderr=result.stderr or "",
        duration_ms=result.duration_ms,
    )


# --------------------------------------------------------------- post-mortem --

postmortem_router = APIRouter(
    prefix="/post-mortems", tags=["Lifelong Learning: Reflection"], dependencies=[Depends(rate_limit)]
)


@postmortem_router.get("", response_model=Page[PostMortemOut], summary="List ExpeL post-mortem jobs")
async def list_post_mortems(
    db: DBSession,
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Page[PostMortemOut]:
    base = select(PostMortemJob)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (
        (await db.execute(base.order_by(PostMortemJob.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    )
    return Page(items=[PostMortemOut.model_validate(j) for j in rows], total=total, limit=limit, offset=offset)


@postmortem_router.post(
    "/drain",
    response_model=StatusResponse,
    summary="Process queued post-mortems now",
    description="Manually drains the ExpeL reflection queue (normally handled by the background worker).",
)
async def drain_now(user: AdminUser) -> StatusResponse:
    processed = await drain_post_mortem_queue()
    return StatusResponse(detail=f"Processed {processed} post-mortem job(s).")
