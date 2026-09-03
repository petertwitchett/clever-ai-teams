"""ARQ worker: decoupled lifelong-learning job processing.

Runs the ExpeL post-mortem / Voyager skill-compilation pipeline **outside** the
API process, so heavy reflection work can never starve the FastAPI event loops.

Execution model:
- The orchestrator enqueues ``process_post_mortem_job(run_id)`` immediately
  after a run completes (fast path, per-run job).
- A cron job (``drain_post_mortems``) additionally sweeps the ``post_mortem_jobs``
  table every minute for anything missed (crash recovery / enqueue failures).

Entrypoints:
- ``python -m app.worker``      standalone worker process (external mode)
- ``arq app.worker.WorkerSettings``  equivalent via the arq CLI
- The API launches the same worker in-container when ``WORKER_MODE=sidecar``.
"""

from __future__ import annotations

import uuid
from typing import Any

from arq import cron
from arq.connections import RedisSettings

from app.core.config import settings
from app.core.logging import configure_logging, get_logger

logger = get_logger(__name__)


# ------------------------------------------------------------- job functions --


async def process_post_mortem_job(ctx: dict[str, Any], run_id: str) -> dict[str, Any]:
    """Process the ExpeL/Voyager post-mortem for a single completed run."""
    from sqlalchemy import select

    from app.core.database import get_async_session
    from app.models import PostMortemJob, PostMortemStatus
    from app.workers.learning import process_post_mortem

    async with get_async_session() as db:
        job = (
            await db.execute(select(PostMortemJob).where(PostMortemJob.run_id == uuid.UUID(run_id)))
        ).scalar_one_or_none()
        if job is None:
            logger.warning("post_mortem_job_missing", extra={"run_id": run_id})
            return {"status": "missing"}
        if job.status not in (PostMortemStatus.QUEUED, PostMortemStatus.PROCESSING):
            return {"status": str(job.status)}
        job.status = PostMortemStatus.PROCESSING
        job.attempts += 1
        await db.flush()
        try:
            await process_post_mortem(db, job)
        except Exception as exc:  # noqa: BLE001 - recorded on the job row
            logger.warning("post_mortem_job_failed", extra={"run_id": run_id, "error": str(exc)[:400]})
            job.status = PostMortemStatus.QUEUED if job.attempts < 3 else PostMortemStatus.FAILED
            job.error_message = str(exc)[:2000]
        await db.commit()
        return {"status": str(job.status), "lessons": job.lessons_extracted, "skills": job.skills_compiled}


async def drain_post_mortems(ctx: dict[str, Any]) -> int:
    """Cron sweep: pick up queued jobs that were never enqueued (crash recovery)."""
    from app.workers.learning import drain_post_mortem_queue

    return await drain_post_mortem_queue()


# ------------------------------------------------------------ enqueue helper --


async def enqueue_post_mortem(run_id: uuid.UUID | str) -> bool:
    """Enqueue a post-mortem job onto the ARQ queue; returns False on failure.

    Failures are non-fatal: the cron sweep (or the embedded poller) will pick
    the job up from the ``post_mortem_jobs`` table later.
    """
    try:
        from arq import create_pool

        pool = await create_pool(WorkerSettings.redis_settings)
        try:
            await pool.enqueue_job(
                "process_post_mortem_job",
                str(run_id),
                _queue_name=settings.ARQ_QUEUE_NAME,
                _job_id=f"pm-{run_id}",  # idempotent: one job per run
            )
            return True
        finally:
            await pool.aclose()
    except Exception as exc:  # noqa: BLE001
        logger.warning("post_mortem_enqueue_failed", extra={"run_id": str(run_id), "error": str(exc)[:200]})
        return False


# ------------------------------------------------------------ worker settings --


async def _startup(ctx: dict[str, Any]) -> None:
    configure_logging()
    logger.info(
        "arq_worker_started",
        extra={"queue": settings.ARQ_QUEUE_NAME, "max_jobs": settings.ARQ_MAX_JOBS},
    )


async def _shutdown(ctx: dict[str, Any]) -> None:
    from app.core.database import close_async_engine
    from app.core.redis_client import close_redis_pool

    await close_redis_pool()
    await close_async_engine()
    logger.info("arq_worker_stopped")


class WorkerSettings:
    """arq worker configuration (``arq app.worker.WorkerSettings``)."""

    functions = [process_post_mortem_job]
    cron_jobs = [
        cron(drain_post_mortems, minute=set(range(60)), run_at_startup=True, unique=True),
    ]
    on_startup = _startup
    on_shutdown = _shutdown
    redis_settings = RedisSettings(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD,
        database=settings.REDIS_DB,
        ssl=settings.REDIS_TLS,
        conn_timeout=10,
    )
    queue_name = settings.ARQ_QUEUE_NAME
    max_jobs = settings.ARQ_MAX_JOBS
    job_timeout = settings.ARQ_JOB_TIMEOUT
    max_tries = 3
    health_check_interval = 60


def main() -> None:
    """Run the worker as a standalone process (``python -m app.worker``)."""
    from arq.worker import run_worker

    configure_logging()
    run_worker(WorkerSettings)  # type: ignore[arg-type]


if __name__ == "__main__":
    main()
