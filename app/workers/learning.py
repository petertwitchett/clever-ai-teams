"""Lifelong learning workers.

Track 1 (Voyager): extract successful novel operational routines from run
traces, validate them in the sandbox, document them and index them into the
acting agent's vector skill library.

Track 2 (ExpeL): asynchronous post-mortem critique of the full communication
trace; distills atomic behavioral lessons and writes them into each involved
agent's archival memory (memory_type=lesson) for future prompt injection.

Both tracks run in a background asyncio task started with the app (one poller
per worker process is avoided via a Redis lock so only one worker drains the
queue at a time).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_async_session
from app.core.logging import get_logger
from app.core.redis_client import get_redis
from app.models import (
    AgentSkill,
    Message,
    MemoryType,
    OrchestrationRun,
    PersonNode,
    PostMortemJob,
    PostMortemStatus,
    RunStatus,
    SkillStatus,
)
from app.services.llm_gateway import LLMGateway
from app.services.memory import MemoryService
from app.services.skills import SkillService

logger = get_logger(__name__)

_POLL_INTERVAL = 15  # seconds
_LOCK_TTL = 120

_POSTMORTEM_PROMPT = """You are an experiential learning evaluator (ExpeL) reviewing a completed multi-agent run.

USER GOAL:
{goal}

FINAL STATUS: {status}

COMMUNICATION TRACE (chronological):
{trace}

Extract atomic behavioral lessons for each participating agent. A lesson is a concise,
reusable heuristic rule (strategy that worked, mistake to avoid, communication improvement).

Respond with a JSON object:
{{
  "lessons": [
    {{"node_key": "<agent node_key>", "lesson": "one concise heuristic rule", "importance": 0.0-1.0}}
  ],
  "skill_candidates": [
    {{
      "node_key": "<agent node_key>",
      "name": "snake_case_function_name",
      "description": "what the skill does and when to use it",
      "code": "def run(...):\\n    ...  # complete pure-python function using only stdlib",
      "smoke_args": {{}}
    }}
  ]
}}

Rules:
- 0 to 3 lessons per agent, only genuinely useful ones.
- skill_candidates only when the trace shows a REUSABLE computational routine
  (data transformation, parsing, calculation) that stdlib Python can express. Usually this list is empty.
- Skill code must define a function named 'run', use only Python stdlib, no I/O, no network."""


async def _acquire_lock(name: str) -> bool:
    try:
        async with get_redis() as r:
            return bool(await r.set(settings.redis_key("lock", name), "1", nx=True, ex=_LOCK_TTL))
    except Exception:  # pragma: no cover
        return True  # fail open: better duplicate work than no work


async def _release_lock(name: str) -> None:
    try:
        async with get_redis() as r:
            await r.delete(settings.redis_key("lock", name))
    except Exception:  # pragma: no cover
        pass


async def _build_trace(db: AsyncSession, run: OrchestrationRun) -> tuple[str, dict[str, PersonNode]]:
    """Render the message trace and map node ids to nodes."""
    messages = (
        (
            await db.execute(
                select(Message).where(Message.run_id == run.id).order_by(Message.created_at).limit(200)
            )
        )
        .scalars()
        .all()
    )
    node_ids = {m.sender_node_id for m in messages if m.sender_node_id}
    nodes: dict[str, PersonNode] = {}
    if node_ids:
        rows = (await db.execute(select(PersonNode).where(PersonNode.id.in_(node_ids)))).scalars().all()
        nodes = {str(n.id): n for n in rows}

    lines = []
    for m in messages:
        sender = nodes.get(str(m.sender_node_id)) if m.sender_node_id else None
        label = sender.node_key if sender else str(m.role)
        lines.append(f"[{label}] ({m.event_type or m.role}): {m.content[:600]}")
    return "\n".join(lines)[:24_000], {n.node_key: n for n in nodes.values()}


async def process_post_mortem(db: AsyncSession, job: PostMortemJob) -> None:
    """Run the ExpeL + Voyager pipeline for one completed run."""
    run = await db.get(OrchestrationRun, job.run_id)
    if run is None or run.status not in (RunStatus.COMPLETED, RunStatus.FAILED):
        job.status = PostMortemStatus.SKIPPED
        job.error_message = "Run missing or not in a reviewable state."
        return

    trace, nodes_by_key = await _build_trace(db, run)
    if not trace or not nodes_by_key:
        job.status = PostMortemStatus.SKIPPED
        job.error_message = "No agent trace to review."
        return

    goal = (run.task_ledger or {}).get("goal", "")
    payload, _resp = await LLMGateway.complete_json(
        [
            {
                "role": "user",
                "content": _POSTMORTEM_PROMPT.format(
                    goal=goal[:2000], status=str(run.status), trace=trace
                ),
            }
        ],
        temperature=0.2,
        default_model=settings.DEFAULT_ORCHESTRATOR_MODEL,
        max_tokens=3000,
    )
    if not isinstance(payload, dict):
        raise RuntimeError("Post-mortem evaluator returned non-object JSON")

    lessons_written = 0
    for item in (payload.get("lessons") or [])[:15]:
        node = nodes_by_key.get(str(item.get("node_key", "")))
        lesson = str(item.get("lesson") or "").strip()
        if node is None or not lesson:
            continue
        importance = float(item.get("importance") or 0.5)
        await MemoryService.append(
            db,
            node.id,
            lesson,
            memory_type=MemoryType.LESSON,
            importance=max(0.0, min(importance, 1.0)),
            source_run_id=run.id,
            source_session_id=run.session_id,
        )
        lessons_written += 1

    skills_compiled = 0
    for candidate in (payload.get("skill_candidates") or [])[:3]:
        node = nodes_by_key.get(str(candidate.get("node_key", "")))
        name = str(candidate.get("name") or "").strip()
        code = str(candidate.get("code") or "")
        description = str(candidate.get("description") or "")
        if node is None or not name or not code or not description:
            continue
        try:
            await SkillService.register(
                db,
                name=name[:128],
                description=description[:8000],
                code=code,
                entrypoint="run",
                node_id=node.id,
                origin_run_id=run.id,
                smoke_test_args=candidate.get("smoke_args") if isinstance(candidate.get("smoke_args"), dict) else {},
            )
            skills_compiled += 1
        except Exception as exc:  # noqa: BLE001 - candidate rejection is expected
            logger.info("skill_candidate_rejected", extra={"name": name, "error": str(exc)[:300]})

    job.status = PostMortemStatus.COMPLETED
    job.lessons_extracted = lessons_written
    job.skills_compiled = skills_compiled
    job.completed_at = datetime.now(timezone.utc)
    job.result = {"lessons": lessons_written, "skills": skills_compiled}
    logger.info(
        "post_mortem_completed",
        extra={"run_id": str(run.id), "lessons": lessons_written, "skills": skills_compiled},
    )


async def drain_post_mortem_queue() -> int:
    """Process queued post-mortem jobs; returns the number processed."""
    processed = 0
    async with get_async_session() as db:
        jobs = (
            (
                await db.execute(
                    select(PostMortemJob)
                    .where(PostMortemJob.status == PostMortemStatus.QUEUED, PostMortemJob.attempts < 3)
                    .order_by(PostMortemJob.created_at)
                    .limit(5)
                )
            )
            .scalars()
            .all()
        )
        for job in jobs:
            job.status = PostMortemStatus.PROCESSING
            job.attempts += 1
            await db.flush()
            try:
                await process_post_mortem(db, job)
            except Exception as exc:  # noqa: BLE001
                logger.warning("post_mortem_failed", extra={"job": str(job.id), "error": str(exc)[:400]})
                job.status = PostMortemStatus.QUEUED if job.attempts < 3 else PostMortemStatus.FAILED
                job.error_message = str(exc)[:2000]
            processed += 1
        await db.commit()
    return processed


async def learning_worker_loop(stop_event: asyncio.Event) -> None:
    """Background poller; a Redis lock keeps one active drainer across workers."""
    logger.info("learning_worker_started")
    while not stop_event.is_set():
        try:
            if await _acquire_lock("post-mortem-drain"):
                try:
                    await drain_post_mortem_queue()
                finally:
                    await _release_lock("post-mortem-drain")
        except Exception as exc:  # noqa: BLE001 - the loop must survive everything
            logger.warning("learning_worker_iteration_failed", extra={"error": str(exc)[:300]})
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=_POLL_INTERVAL)
        except asyncio.TimeoutError:
            continue
    logger.info("learning_worker_stopped")
