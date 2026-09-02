"""Structured logging configuration."""

from __future__ import annotations

import json
import logging
import sys
import time
from contextvars import ContextVar
from typing import Any

from app.core.config import settings

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
run_id_ctx: ContextVar[str | None] = ContextVar("run_id", default=None)

_RESERVED = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "taskName",
    "thread",
    "threadName",
}


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per log record (Clever Cloud friendly)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "pid": record.process,
        }
        request_id = request_id_ctx.get()
        if request_id:
            payload["request_id"] = request_id
        run_id = run_id_ctx.get()
        if run_id:
            payload["run_id"] = run_id
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                try:
                    json.dumps(value)
                    payload[key] = value
                except (TypeError, ValueError):
                    payload[key] = repr(value)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


class ConsoleFormatter(logging.Formatter):
    """Human readable formatter for local development."""

    def __init__(self) -> None:
        super().__init__(fmt="%(asctime)s | %(levelname)-8s | %(name)-32s | %(message)s", datefmt="%H:%M:%S")


def configure_logging() -> None:
    """Install the root logging handler exactly once per process."""
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL)
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if settings.LOG_FORMAT == "json" else ConsoleFormatter())
    root.addHandler(handler)

    for noisy in ("uvicorn.access", "uvicorn.error", "sqlalchemy.engine.Engine", "httpx", "LiteLLM", "litellm"):
        logging.getLogger(noisy).handlers = []
        logging.getLogger(noisy).propagate = True
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("litellm").setLevel(logging.WARNING)
    logging.getLogger("LiteLLM").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a module level logger."""
    return logging.getLogger(name)
