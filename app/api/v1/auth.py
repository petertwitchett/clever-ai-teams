"""Authentication endpoints: register, login, profile, API keys."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.core.config import settings
from app.core.errors import AuthenticationError, ConflictError
from app.core.security import create_access_token, generate_api_key, hash_password, verify_password
from app.models import User, UserRole
from app.schemas import APIKeyResponse, TokenResponse, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
    description="Creates a user account. The very first account on the platform is granted the admin role.",
)
async def register(payload: UserRegister, db: DBSession) -> User:
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("An account with this email already exists")
    user_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.ADMIN if user_count == 0 else UserRole.USER,
    )
    db.add(user)
    await db.flush()
    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Obtain a JWT access token",
)
async def login(payload: UserLogin, db: DBSession) -> TokenResponse:
    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise AuthenticationError("Invalid email or password")
    if not user.is_active:
        raise AuthenticationError("Account is deactivated")
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token({"sub": str(user.id), "role": str(user.role)}, expires_delta=expires)
    return TokenResponse(access_token=token, expires_in=int(expires.total_seconds()))


@router.get("/me", response_model=UserOut, summary="Current account profile")
async def me(user: CurrentUser) -> User:
    return user


@router.post(
    "/api-key",
    response_model=APIKeyResponse,
    summary="Issue (or rotate) a personal API key",
    description="Returns a new API key usable via the X-API-Key header. Any previous key is invalidated.",
)
async def issue_api_key(user: CurrentUser, db: DBSession) -> APIKeyResponse:
    key = generate_api_key()
    user.api_key = key
    db.add(user)
    await db.flush()
    return APIKeyResponse(api_key=key)
