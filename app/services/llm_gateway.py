"""LLM Gateway: unified multi-provider routing via LiteLLM.

Resolves a person node's brain binding (provider + model) to a concrete
LiteLLM model string, applies retries and timeouts, tracks token usage and
cost, and optionally falls back to a deterministic mock provider when no
API key is configured (so the whole platform stays testable end-to-end).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")  # avoid remote fetch at import

import litellm
from litellm import acompletion

from app.core.config import settings
from app.core.errors import LLMProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)

litellm.drop_params = True  # silently drop unsupported params per provider
litellm.suppress_debug_info = True

_PROVIDER_PREFIXES = {
    "openai": "",
    "anthropic": "anthropic/",
    "groq": "groq/",
    "deepseek": "deepseek/",
    "openrouter": "openrouter/",
    "gemini": "gemini/",
    "ollama": "ollama/",
}

_PROVIDER_KEYS = {
    "openai": lambda: settings.OPENAI_API_KEY,
    "anthropic": lambda: settings.ANTHROPIC_API_KEY,
    "groq": lambda: settings.GROQ_API_KEY,
    "deepseek": lambda: settings.DEEPSEEK_API_KEY,
    "openrouter": lambda: settings.OPENROUTER_API_KEY,
    "gemini": lambda: settings.GEMINI_API_KEY,
}


@dataclass
class LLMResponse:
    """Normalized non-streaming completion result."""

    content: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    finish_reason: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


def resolve_model(provider: str | None, model: str | None, *, default_model: str | None = None) -> tuple[str, dict[str, Any]]:
    """Resolve (provider, model) into a LiteLLM model string + extra kwargs.

    Resolution order:
    1. LiteLLM proxy if configured (all traffic through the proxy).
    2. Explicit provider prefixing when the provider has an API key.
    3. Fall back to the first configured provider with the default model.
    """
    extra: dict[str, Any] = {}
    model = model or default_model or settings.DEFAULT_SPECIALIST_MODEL

    if settings.LITELLM_PROXY_URL:
        extra["api_base"] = settings.LITELLM_PROXY_URL
        if settings.LITELLM_PROXY_API_KEY:
            extra["api_key"] = settings.LITELLM_PROXY_API_KEY
        return model, extra

    if provider and provider in _PROVIDER_PREFIXES:
        if provider == "ollama":
            if settings.OLLAMA_BASE_URL:
                extra["api_base"] = settings.OLLAMA_BASE_URL
                return f"ollama/{model.removeprefix('ollama/')}", extra
        else:
            key_getter = _PROVIDER_KEYS.get(provider)
            if key_getter and key_getter():
                extra["api_key"] = key_getter()
                prefix = _PROVIDER_PREFIXES[provider]
                if prefix and not model.startswith(prefix):
                    model = f"{prefix}{model}"
                return model, extra

    # No explicit/usable provider: try configured providers in priority order.
    for candidate in ("openai", "anthropic", "groq", "deepseek", "openrouter", "gemini"):
        key_getter = _PROVIDER_KEYS[candidate]
        if key_getter():
            extra["api_key"] = key_getter()
            prefix = _PROVIDER_PREFIXES[candidate]
            if prefix and not model.startswith(prefix):
                # If the model clearly belongs to another provider family, swap to the default.
                model = f"{prefix}{model}" if "/" not in model else model
            return model, extra
    if settings.OLLAMA_BASE_URL:
        extra["api_base"] = settings.OLLAMA_BASE_URL
        return f"ollama/{model.removeprefix('ollama/')}", extra

    return model, extra  # unauthenticated; caller may use the mock fallback


def _mock_response(messages: list[dict[str, str]], model: str) -> LLMResponse:
    """Deterministic offline response used when no provider is configured."""
    last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    system = next((m["content"] for m in messages if m.get("role") == "system"), "")
    digest = hashlib.sha256((system + last_user).encode()).hexdigest()[:8]
    content = json.dumps(
        {
            "mock": True,
            "note": (
                "No LLM provider is configured. Set OPENAI_API_KEY / ANTHROPIC_API_KEY / "
                "GROQ_API_KEY / OLLAMA_BASE_URL or LITELLM_PROXY_URL to enable real inference."
            ),
            "echo_digest": digest,
            "received_chars": len(last_user),
        }
    )
    return LLMResponse(content=content, model=f"mock/{model}", input_tokens=0, output_tokens=0)


class LLMGateway:
    """Async facade over LiteLLM used by every agent invocation."""

    @staticmethod
    def has_real_provider() -> bool:
        return bool(settings.configured_llm_providers)

    @staticmethod
    async def complete(
        messages: list[dict[str, str]],
        *,
        provider: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        top_p: float = 1.0,
        max_tokens: int | None = None,
        default_model: str | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """Run a non-streaming completion with retries."""
        resolved_model, extra = resolve_model(provider, model, default_model=default_model)

        if "api_key" not in extra and "api_base" not in extra:
            if settings.LLM_ALLOW_MOCK_FALLBACK:
                logger.warning("llm_mock_fallback", extra={"model": resolved_model})
                return _mock_response(messages, resolved_model)
            raise LLMProviderError("No LLM provider is configured and mock fallback is disabled.")

        params: dict[str, Any] = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "timeout": settings.LLM_REQUEST_TIMEOUT,
            **extra,
        }
        if max_tokens:
            params["max_tokens"] = max_tokens
        if response_format:
            params["response_format"] = response_format

        last_error: Exception | None = None
        for attempt in range(1, settings.LLM_MAX_RETRIES + 1):
            start = time.monotonic()
            try:
                response = await acompletion(**params)
                latency_ms = int((time.monotonic() - start) * 1000)
                usage = getattr(response, "usage", None)
                input_tokens = getattr(usage, "prompt_tokens", 0) or 0
                output_tokens = getattr(usage, "completion_tokens", 0) or 0
                try:
                    cost = litellm.completion_cost(completion_response=response) or 0.0
                except Exception:
                    cost = 0.0
                choice = response.choices[0]
                return LLMResponse(
                    content=choice.message.content or "",
                    model=resolved_model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cost_usd=float(cost),
                    latency_ms=latency_ms,
                    finish_reason=getattr(choice, "finish_reason", None),
                )
            except Exception as exc:  # noqa: BLE001 - provider errors are heterogeneous
                last_error = exc
                logger.warning(
                    "llm_attempt_failed",
                    extra={"model": resolved_model, "attempt": attempt, "error": str(exc)[:400]},
                )
                if attempt < settings.LLM_MAX_RETRIES:
                    await asyncio.sleep(min(2**attempt, 8))

        raise LLMProviderError(f"LLM completion failed after {settings.LLM_MAX_RETRIES} attempts: {last_error}")

    @staticmethod
    async def stream(
        messages: list[dict[str, str]],
        *,
        provider: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        top_p: float = 1.0,
        max_tokens: int | None = None,
        default_model: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream completion deltas as plain text chunks."""
        resolved_model, extra = resolve_model(provider, model, default_model=default_model)

        if "api_key" not in extra and "api_base" not in extra:
            if settings.LLM_ALLOW_MOCK_FALLBACK:
                mock = _mock_response(messages, resolved_model)
                for i in range(0, len(mock.content), 64):
                    yield mock.content[i : i + 64]
                    await asyncio.sleep(0)
                return
            raise LLMProviderError("No LLM provider is configured and mock fallback is disabled.")

        params: dict[str, Any] = {
            "model": resolved_model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "timeout": settings.LLM_REQUEST_TIMEOUT,
            "stream": True,
            **extra,
        }
        if max_tokens:
            params["max_tokens"] = max_tokens

        try:
            response = await acompletion(**params)
            async for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and getattr(delta, "content", None):
                    yield delta.content
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(f"LLM streaming failed: {exc}") from exc

    @staticmethod
    async def complete_json(
        messages: list[dict[str, str]],
        *,
        provider: str | None = None,
        model: str | None = None,
        temperature: float = 0.2,
        default_model: str | None = None,
        max_tokens: int | None = None,
    ) -> tuple[dict[str, Any] | list[Any], LLMResponse]:
        """Completion that must return JSON; parses (and repairs) the payload."""
        response = await LLMGateway.complete(
            messages,
            provider=provider,
            model=model,
            temperature=temperature,
            default_model=default_model,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        text = response.content.strip()
        # Strip markdown fences if present.
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rsplit("```", 1)[0] if "```" in text else text
        try:
            return json.loads(text), response
        except json.JSONDecodeError:
            # Attempt to locate the outermost JSON object.
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end > start:
                try:
                    return json.loads(text[start : end + 1]), response
                except json.JSONDecodeError:
                    pass
            raise LLMProviderError(f"Model did not return valid JSON: {text[:300]}")
