"""Declarative base, mixins and shared column types for all ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, MetaData, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base bound to the application schema."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION, schema=settings.DB_SCHEMA)

    type_annotation_map = {
        dict[str, Any]: JSONB,
        list[str]: JSONB,
        list[dict[str, Any]]: JSONB,
    }

    def to_dict(self, exclude: set[str] | None = None) -> dict[str, Any]:
        """Serialise column values into a plain dictionary."""
        exclude = exclude or set()
        payload: dict[str, Any] = {}
        for column in self.__table__.columns:
            if column.name in exclude:
                continue
            value = getattr(self, column.name, None)
            if isinstance(value, uuid.UUID):
                value = str(value)
            elif isinstance(value, datetime):
                value = value.isoformat()
            payload[column.name] = value
        return payload

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        identifier = getattr(self, "id", None)
        return f"<{self.__class__.__name__} id={identifier}>"


def utcnow() -> datetime:
    """Timezone aware UTC now (used as a Python-side default)."""
    return datetime.now(timezone.utc)


class UUIDPrimaryKeyMixin:
    """Adds a UUID primary key generated application side."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )


class TimestampMixin:
    """Adds created/updated timestamps maintained by the database."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
    )


class SoftDeleteMixin:
    """Adds an optional soft-delete marker."""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class MetadataMixin:
    """Adds a free-form JSONB metadata bag (``meta`` to avoid SQLAlchemy clash)."""

    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)


def short_string(length: int = 128, **kwargs: Any) -> Mapped[str]:
    """Helper for constrained string columns."""
    return mapped_column(String(length), **kwargs)
