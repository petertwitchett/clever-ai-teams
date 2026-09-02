"""Shared schema primitives: envelopes, pagination, base configs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class APIModel(BaseModel):
    """Base schema with ORM support."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PaginationParams(BaseModel):
    """Standard offset pagination query parameters."""

    limit: int = Field(default=20, ge=1, le=100, description="Maximum items to return")
    offset: int = Field(default=0, ge=0, description="Number of items to skip")


class Page(BaseModel, Generic[T]):
    """Paginated response envelope."""

    items: list[T]
    total: int = Field(description="Total matching items")
    limit: int
    offset: int


class StatusResponse(BaseModel):
    """Simple acknowledgement payload."""

    status: str = "ok"
    detail: str | None = None


class IDResponse(BaseModel):
    """Response containing only the created/affected resource ID."""

    id: uuid.UUID


class HealthResponse(BaseModel):
    """Health probe payload."""

    status: str
    version: str
    environment: str
    timestamp: datetime
    checks: dict[str, Any] = Field(default_factory=dict)
