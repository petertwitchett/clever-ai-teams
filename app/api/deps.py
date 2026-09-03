"""FastAPI dependencies: DB session, current user, role guards, rate limiting."""

from __future__ import annotations

from typing import Annotated, AsyncGenerator

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_async_session_factory
from app.core.errors import AuthenticationError, AuthorizationError, RateLimitedError
from app.core.redis_client import CacheService
from app.core.security import decode_access_token
from app.models import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token from /api/v1/auth/login")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped database session with commit-on-success."""
    factory = get_async_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    request: Request,
    db: DBSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    """Resolve the caller from a JWT bearer token or an X-API-Key header."""
    # 1. API key header
    api_key = request.headers.get(settings.API_KEY_HEADER)
    if api_key:
        user = (await db.execute(select(User).where(User.api_key == api_key, User.is_active))).scalar_one_or_none()
        if user is None:
            raise AuthenticationError("Invalid API key")
        return user

    # 2. JWT bearer or query parameter token (for browser EventSource)
    token = (
        credentials.credentials
        if (credentials and credentials.credentials)
        else request.query_params.get("token") or request.query_params.get("access_token")
    )
    if not token:
        raise AuthenticationError("Missing credentials: provide a Bearer token, X-API-Key header, or ?token= query parameter")
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise AuthenticationError("Token payload is missing the subject")
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("User not found or deactivated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    """Guard endpoints that mutate platform-level resources."""
    if user.role not in (UserRole.ADMIN, UserRole.OPERATOR):
        raise AuthorizationError("This operation requires an admin or operator role")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


async def rate_limit(request: Request, user: CurrentUser) -> User:
    """Redis-backed fixed-window rate limiter per user."""
    if not settings.RATE_LIMIT_ENABLED:
        return user
    key = f"rl:{user.id}:{request.url.path.split('/')[3] if len(request.url.path.split('/')) > 3 else 'root'}"
    count = await CacheService.increment(key, ttl=settings.RATE_LIMIT_WINDOW_SECONDS)
    if count > settings.RATE_LIMIT_REQUESTS:
        raise RateLimitedError(
            f"Rate limit exceeded ({settings.RATE_LIMIT_REQUESTS} requests / {settings.RATE_LIMIT_WINDOW_SECONDS}s)."
        )
    return user


RateLimitedUser = Annotated[User, Depends(rate_limit)]
