"""Run event bus: Redis pub/sub fan-out of orchestration events.

Every orchestration run publishes typed events to a Redis channel. SSE
consumers (which may live on a *different* gunicorn worker than the one
executing the run) subscribe to the channel and forward frames to the client.
Events are also appended to a capped Redis list for replay/late-join.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis_client import get_redis
from app.models.enums import RunEventType

logger = get_logger(__name__)

_TERMINAL_EVENTS = {RunEventType.RUN_COMPLETED, RunEventType.ERROR}


def _channel(run_id: uuid.UUID | str) -> str:
    return settings.redis_key("run-events", str(run_id))


def _replay_key(run_id: uuid.UUID | str) -> str:
    return settings.redis_key("run-events-log", str(run_id))


class EventBus:
    """Publish/subscribe for orchestration run events."""

    @staticmethod
    async def publish(run_id: uuid.UUID | str, event: RunEventType | str, data: dict[str, Any] | None = None) -> None:
        frame = json.dumps(
            {
                "event": str(event),
                "data": data or {},
                "run_id": str(run_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            default=str,
        )
        try:
            async with get_redis() as r:
                pipe = r.pipeline()
                pipe.publish(_channel(run_id), frame)
                pipe.rpush(_replay_key(run_id), frame)
                pipe.ltrim(_replay_key(run_id), -500, -1)
                pipe.expire(_replay_key(run_id), 60 * 60 * 24)
                await pipe.execute()
        except Exception as exc:  # pragma: no cover - events must never break a run
            logger.warning("event_publish_failed", extra={"run_id": str(run_id), "error": str(exc)[:200]})

    @staticmethod
    async def replay(run_id: uuid.UUID | str) -> list[dict[str, Any]]:
        """Return all recorded frames for a run (for late joiners / history)."""
        try:
            async with get_redis() as r:
                frames = await r.lrange(_replay_key(run_id), 0, -1)
            return [json.loads(frame) for frame in frames]
        except Exception as exc:  # pragma: no cover
            logger.warning("event_replay_failed", extra={"run_id": str(run_id), "error": str(exc)[:200]})
            return []

    @staticmethod
    async def subscribe(
        run_id: uuid.UUID | str,
        *,
        include_replay: bool = True,
        heartbeat_seconds: int = 15,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Yield event frames for the run until a terminal event arrives."""
        seen_terminal = False

        if include_replay:
            for frame in await EventBus.replay(run_id):
                yield frame
                if frame.get("event") in {e.value for e in _TERMINAL_EVENTS}:
                    seen_terminal = True
        if seen_terminal:
            return

        async with get_redis() as r:
            pubsub = r.pubsub()
            await pubsub.subscribe(_channel(run_id))
            try:
                while True:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=heartbeat_seconds)
                    if message is None:
                        yield {
                            "event": RunEventType.HEARTBEAT.value,
                            "data": {},
                            "run_id": str(run_id),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                        continue
                    frame = json.loads(message["data"])
                    yield frame
                    if frame.get("event") in {e.value for e in _TERMINAL_EVENTS}:
                        return
            finally:
                await pubsub.unsubscribe(_channel(run_id))
                await pubsub.aclose()
