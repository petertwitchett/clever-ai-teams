"""Background task executor pool for CPU-intensive operations."""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ProcessPoolExecutor
from functools import partial
from typing import Any, Callable, TypeVar

from app.core.config import settings

logger = logging.getLogger(__name__)

_cpu_executor: ProcessPoolExecutor | None = None

T = TypeVar("T")


def get_cpu_executor() -> ProcessPoolExecutor:
    """Return the cached ProcessPoolExecutor singleton."""
    global _cpu_executor
    if _cpu_executor is None:
        _cpu_executor = ProcessPoolExecutor(max_workers=settings.cpu_executor_workers)
        logger.info(
            "cpu_executor_initialized",
            extra={"workers": settings.cpu_executor_workers, "cores": settings.cpu_count},
        )
    return _cpu_executor


async def run_in_executor(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a blocking function in the CPU executor pool."""
    executor = get_cpu_executor()
    loop = asyncio.get_running_loop()
    bound_func = partial(func, **kwargs) if kwargs else func
    return await loop.run_in_executor(executor, bound_func, *args)


def shutdown_executor() -> None:
    """Shut down the CPU executor pool (called at app shutdown)."""
    global _cpu_executor
    if _cpu_executor is not None:
        _cpu_executor.shutdown(wait=True, cancel_futures=False)
        _cpu_executor = None
        logger.info("cpu_executor_shutdown_complete")
