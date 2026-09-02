"""Voyager-style skill library: registration, semantic retrieval, execution.

Skills are validated Python functions. Their docstrings are embedded so that
person nodes can retrieve relevant tools by cosine similarity against an
incoming subtask description, then execute them in the sandbox.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationFailedError
from app.core.logging import get_logger
from app.models import AgentSkill, SkillExecution, SkillStatus
from app.services.embeddings import EmbeddingService
from app.services.sandbox import SandboxResult, run_in_sandbox, validate_skill_code

logger = get_logger(__name__)


class SkillService:
    """Manage the executable skill library."""

    @staticmethod
    async def register(
        db: AsyncSession,
        *,
        name: str,
        description: str,
        code: str,
        entrypoint: str = "run",
        parameters_schema: dict[str, Any] | None = None,
        node_id: uuid.UUID | None = None,
        origin_run_id: uuid.UUID | None = None,
        status: SkillStatus = SkillStatus.CANDIDATE,
        is_builtin: bool = False,
        smoke_test_args: dict[str, Any] | None = None,
    ) -> AgentSkill:
        """Validate, optionally smoke-test, embed and store a new skill."""
        verdict = validate_skill_code(code)
        if not verdict.valid:
            raise ValidationFailedError("Skill code failed AST validation.", details=verdict.errors)
        if entrypoint not in verdict.functions:
            raise ValidationFailedError(
                f"Entrypoint '{entrypoint}' not defined.", details={"functions": verdict.functions}
            )

        if smoke_test_args is not None:
            result = await run_in_sandbox(code, entrypoint, smoke_test_args, validate=False)
            if not result.success:
                raise ValidationFailedError(
                    "Skill failed its sandbox smoke test.", details={"error": result.error, "stderr": result.stderr}
                )
            status = SkillStatus.VERIFIED

        # Version bump if a skill with this (node, name) already exists.
        existing = (
            await db.execute(
                select(AgentSkill)
                .where(AgentSkill.node_id == node_id, AgentSkill.name == name)
                .order_by(AgentSkill.version.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        version = existing.version + 1 if existing else 1

        embedding = await EmbeddingService.embed(f"{name}: {description}")
        skill = AgentSkill(
            node_id=node_id,
            name=name,
            description=description,
            code=code,
            entrypoint=entrypoint,
            parameters_schema=parameters_schema or {},
            status=status,
            embedding=embedding,
            origin_run_id=origin_run_id,
            version=version,
            is_builtin=is_builtin,
        )
        db.add(skill)
        await db.flush()
        logger.info("skill_registered", extra={"skill": name, "version": version, "status": str(status)})
        return skill

    @staticmethod
    async def search(
        db: AsyncSession,
        query: str,
        *,
        node_id: uuid.UUID | None = None,
        top_k: int = 5,
        include_shared: bool = True,
        min_similarity: float = 0.0,
    ) -> list[tuple[AgentSkill, float]]:
        """Semantic similarity search over the skill catalog."""
        if top_k <= 0:
            return []
        query_embedding = await EmbeddingService.embed(query)
        distance = AgentSkill.embedding.cosine_distance(query_embedding)
        stmt = (
            select(AgentSkill, (1 - distance).label("similarity"))
            .where(
                AgentSkill.embedding.isnot(None),
                AgentSkill.status.in_([SkillStatus.VERIFIED, SkillStatus.CANDIDATE]),
            )
            .order_by(distance)
            .limit(top_k)
        )
        if node_id is not None and include_shared:
            stmt = stmt.where((AgentSkill.node_id == node_id) | (AgentSkill.node_id.is_(None)))
        elif node_id is not None:
            stmt = stmt.where(AgentSkill.node_id == node_id)
        rows = (await db.execute(stmt)).all()
        return [(row[0], float(row[1])) for row in rows if float(row[1]) >= min_similarity]

    @staticmethod
    async def execute(
        db: AsyncSession,
        skill_id: uuid.UUID,
        arguments: dict[str, Any] | None = None,
        *,
        node_id: uuid.UUID | None = None,
        run_id: uuid.UUID | None = None,
        timeout: int | None = None,
    ) -> SandboxResult:
        """Execute a stored skill in the sandbox and record the audit trail."""
        skill = await db.get(AgentSkill, skill_id)
        if skill is None:
            raise NotFoundError(f"Skill {skill_id} not found")

        result = await run_in_sandbox(skill.code, skill.entrypoint, arguments or {}, timeout=timeout)

        db.add(
            SkillExecution(
                skill_id=skill.id,
                node_id=node_id,
                run_id=run_id,
                arguments=arguments or {},
                success=result.success,
                stdout=result.stdout[:8000] if result.stdout else None,
                stderr=(result.stderr or result.error or "")[:8000] or None,
                result={"value": result.result} if result.success else {"error": result.error},
                duration_ms=result.duration_ms,
            )
        )

        # Update rolling statistics.
        skill.usage_count += 1
        if result.success:
            skill.success_count += 1
        else:
            skill.failure_count += 1
        total = skill.success_count + skill.failure_count
        skill.avg_latency_ms = (
            (skill.avg_latency_ms * (total - 1) + result.duration_ms) / total if total else result.duration_ms
        )
        skill.last_used_at = datetime.now(timezone.utc)

        # Auto-promote candidates that keep succeeding; quarantine repeat failures.
        if skill.status == SkillStatus.CANDIDATE and skill.success_count >= 3 and skill.failure_count == 0:
            skill.status = SkillStatus.VERIFIED
        elif skill.failure_count >= 5 and skill.success_count == 0:
            skill.status = SkillStatus.QUARANTINED

        await db.flush()
        return result
