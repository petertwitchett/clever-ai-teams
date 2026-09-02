"""Authentication schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole
from app.schemas.common import APIModel


class UserRegister(BaseModel):
    """New account registration payload."""

    email: EmailStr = Field(description="Unique account email", examples=["admin@example.com"])
    password: str = Field(min_length=8, max_length=128, description="Plaintext password (hashed at rest)")
    full_name: str | None = Field(default=None, max_length=255)


class UserLogin(BaseModel):
    """Credential login payload."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """JWT bearer token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token lifetime in seconds")


class UserOut(APIModel):
    """Public user representation."""

    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    role: UserRole
    is_active: bool
    created_at: datetime


class APIKeyResponse(BaseModel):
    """Issued API key (shown once)."""

    api_key: str
    detail: str = "Store this key securely; it will not be shown again."
