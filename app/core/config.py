"""Application settings.

Configuration is loaded from environment variables (or a local ``.env`` file) via
pydantic-settings. Clever Cloud injects add-on credentials under its own variable
names (``POSTGRESQL_ADDON_URI``, ``REDIS_ADDON_HOST``, ...), so every field that
maps to a managed add-on accepts both the canonical name and the Clever alias.
"""

from __future__ import annotations

import multiprocessing
from functools import lru_cache
from typing import Literal
from urllib.parse import quote, urlparse

from pydantic import AliasChoices, Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ----------------------------------------------------------------- app ---
    APP_NAME: str = "Clever AI Team"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "production"
    DEBUG: bool = Field(default=False, validation_alias=AliasChoices("APP_DEBUG"))
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: Literal["json", "console"] = "json"
    API_V1_PREFIX: str = "/api/v1"
    PORT: int = 8080
    HOST: str = "0.0.0.0"

    # ------------------------------------------------------------ security ---
    SECRET_KEY: str = "insecure-development-key-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    API_KEY_HEADER: str = "X-API-Key"
    ALLOWED_ORIGINS: str = "*"
    AUTH_REQUIRED: bool = True
    BOOTSTRAP_ADMIN_EMAIL: str | None = None
    BOOTSTRAP_ADMIN_PASSWORD: str | None = None

    # ------------------------------------------------------------ database ---
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/clever_ai_team",
        validation_alias=AliasChoices("DATABASE_URL", "POSTGRESQL_ADDON_URI"),
    )
    DB_POOL_SIZE: int = 2
    DB_MAX_OVERFLOW: int = 3
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_ECHO: bool = False
    DB_STATEMENT_TIMEOUT_MS: int = 60_000
    DB_SSL: Literal["disable", "prefer", "require"] = "prefer"
    DB_AUTO_CREATE_SCHEMA: bool = True
    DB_SCHEMA: str = "clever_ai"

    # --------------------------------------------------------------- redis ---
    REDIS_HOST: str = Field(default="localhost", validation_alias=AliasChoices("REDIS_HOST", "REDIS_ADDON_HOST"))
    REDIS_PORT: int = Field(default=6379, validation_alias=AliasChoices("REDIS_PORT", "REDIS_ADDON_PORT"))
    REDIS_PASSWORD: str | None = Field(
        default=None, validation_alias=AliasChoices("REDIS_PASSWORD", "REDIS_ADDON_PASSWORD")
    )
    REDIS_DB: int = 0
    REDIS_MAX_CONNECTIONS: int = 24
    REDIS_KEY_PREFIX: str = "cat"
    REDIS_TLS: bool = False
    CACHE_TTL_SECONDS: int = 300
    CACHE_TTL_EMBEDDING: int = 60 * 60 * 24 * 7
    CACHE_TTL_GRAPH_DSL: int = 60 * 60

    # ----------------------------------------------------------------- llm ---
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    GROQ_API_KEY: str | None = None
    DEEPSEEK_API_KEY: str | None = None
    OPENROUTER_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    LITELLM_PROXY_URL: str | None = None
    LITELLM_PROXY_API_KEY: str | None = None
    OLLAMA_BASE_URL: str | None = None
    DEFAULT_ORCHESTRATOR_MODEL: str = "gpt-4o-mini"
    DEFAULT_SPECIALIST_MODEL: str = "gpt-4o-mini"
    LLM_REQUEST_TIMEOUT: int = 120
    LLM_MAX_RETRIES: int = 3
    LLM_ALLOW_MOCK_FALLBACK: bool = True

    # ---------------------------------------------------------- embeddings ---
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536
    EMBEDDING_BATCH_SIZE: int = 64

    # -------------------------------------------------------- orchestrator ---
    ORCHESTRATOR_STALL_LIMIT: int = 4
    MAX_DIALECTICAL_REVIEW_ITERATIONS: int = 3
    MAX_ORCHESTRATION_STEPS: int = 40
    MAX_MILESTONES: int = 12
    RUN_TIMEOUT_SECONDS: int = 900
    MEMORY_RETRIEVAL_TOP_K: int = 5
    SKILL_RETRIEVAL_TOP_K: int = 4
    LESSON_RETRIEVAL_TOP_K: int = 5

    # ------------------------------------------------------------- sandbox ---
    SANDBOX_ENABLED: bool = True
    SANDBOX_TIMEOUT: int = 30
    SANDBOX_MAX_MEMORY_MB: int = 512
    SANDBOX_MAX_OUTPUT_BYTES: int = 65_536
    SANDBOX_ALLOW_NETWORK: bool = False

    # ------------------------------------------------------------- workers ---
    WEB_CONCURRENCY: int | None = None
    MAX_WEB_WORKERS: int = 9
    CPU_EXECUTOR_WORKERS: int | None = None
    BACKGROUND_TASK_WORKERS: int = 2
    ENABLE_BACKGROUND_WORKERS: bool = True

    # ------------------------------------------------------------ limiting ---
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 240
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ----------------------------------------------------------- validators --
    @field_validator("LOG_LEVEL")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        return value.upper()

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalise_database_url(cls, value: str) -> str:
        # Clever Cloud and Heroku style URIs sometimes use the postgres:// scheme.
        if value.startswith("postgres://"):
            return "postgresql://" + value[len("postgres://") :]
        return value

    # ------------------------------------------------------ computed views ---
    @computed_field  # type: ignore[prop-decorator]
    @property
    def async_database_url(self) -> str:
        """SQLAlchemy URL for the asyncpg driver."""
        url = self.DATABASE_URL
        for prefix in ("postgresql+asyncpg://", "postgresql+psycopg://", "postgresql+psycopg2://"):
            if url.startswith(prefix):
                return url.replace(prefix, "postgresql+asyncpg://", 1)
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sync_database_url(self) -> str:
        """SQLAlchemy URL for the psycopg2 driver (Alembic, CPU-bound jobs)."""
        url = self.DATABASE_URL
        for prefix in ("postgresql+asyncpg://", "postgresql+psycopg://"):
            if url.startswith(prefix):
                return url.replace(prefix, "postgresql+psycopg2://", 1)
        if url.startswith("postgresql+psycopg2://"):
            return url
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_name(self) -> str:
        parsed = urlparse(self.DATABASE_URL)
        return (parsed.path or "/").lstrip("/") or "postgres"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def redis_url(self) -> str:
        scheme = "rediss" if self.REDIS_TLS else "redis"
        auth = f":{quote(self.REDIS_PASSWORD, safe='')}@" if self.REDIS_PASSWORD else ""
        return f"{scheme}://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cpu_count(self) -> int:
        try:
            return max(1, multiprocessing.cpu_count())
        except NotImplementedError:  # pragma: no cover - platform dependent
            return 1

    @computed_field  # type: ignore[prop-decorator]
    @property
    def web_workers(self) -> int:
        """Gunicorn worker count: (2 x cores) + 1, capped for add-on limits."""
        if self.WEB_CONCURRENCY and self.WEB_CONCURRENCY > 0:
            return self.WEB_CONCURRENCY
        return max(1, min((2 * self.cpu_count) + 1, self.MAX_WEB_WORKERS))

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cpu_executor_workers(self) -> int:
        if self.CPU_EXECUTOR_WORKERS and self.CPU_EXECUTOR_WORKERS > 0:
            return self.CPU_EXECUTOR_WORKERS
        return max(1, min(2, self.cpu_count))

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origins(self) -> list[str]:
        raw = (self.ALLOWED_ORIGINS or "*").strip()
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def configured_llm_providers(self) -> list[str]:
        providers: list[str] = []
        if self.OPENAI_API_KEY:
            providers.append("openai")
        if self.ANTHROPIC_API_KEY:
            providers.append("anthropic")
        if self.GROQ_API_KEY:
            providers.append("groq")
        if self.DEEPSEEK_API_KEY:
            providers.append("deepseek")
        if self.OPENROUTER_API_KEY:
            providers.append("openrouter")
        if self.GEMINI_API_KEY:
            providers.append("gemini")
        if self.OLLAMA_BASE_URL:
            providers.append("ollama")
        if self.LITELLM_PROXY_URL:
            providers.append("litellm_proxy")
        return providers

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    def redis_key(self, *parts: str) -> str:
        """Build a namespaced Redis key."""
        return ":".join([self.REDIS_KEY_PREFIX, *[str(part) for part in parts]])


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached settings singleton."""
    return Settings()


settings = get_settings()
