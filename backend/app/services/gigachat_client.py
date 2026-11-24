from __future__ import annotations

import asyncio
import logging
import time

from app.config import get_settings

logger = logging.getLogger(__name__)

_lock = asyncio.Lock()
_next_allowed_at = 0.0


def gigachat_enabled() -> bool:
    return bool(get_settings().gigachat_credentials.strip())


def _extract_text(response) -> str:
    messages = getattr(response, "messages", None)
    if messages:
        parts: list[str] = []
        for message in messages:
            content = getattr(message, "content", None)
            if isinstance(content, str) and content.strip():
                parts.append(content.strip())
                continue
            if not content:
                continue
            for part in content:
                text = getattr(part, "text", None)
                if text and str(text).strip():
                    parts.append(str(text).strip())
        if parts:
            return "\n".join(parts).strip()
    choices = getattr(response, "choices", None)
    if choices:
        message = getattr(choices[0], "message", None)
        content = getattr(message, "content", None) if message else None
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ""


def _is_rate_limit(exc: Exception) -> bool:
    name = type(exc).__name__
    if "RateLimit" in name:
        return True
    text = str(exc).lower()
    return "429" in text or "too many requests" in text


async def _throttle() -> None:
    global _next_allowed_at
    settings = get_settings()
    gap = max(0.2, float(settings.gigachat_min_interval_seconds))
    now = time.monotonic()
    wait = _next_allowed_at - now
    if wait > 0:
        await asyncio.sleep(wait)
    _next_allowed_at = time.monotonic() + gap


async def _once(messages: list[dict[str, str]], *, max_tokens: int) -> str:
    settings = get_settings()
    from gigachat import GigaChat

    kwargs = {
        "credentials": settings.gigachat_credentials,
        "scope": settings.gigachat_scope,
        "model": settings.gigachat_model,
        "verify_ssl_certs": settings.gigachat_verify_ssl_certs,
        "timeout": settings.gigachat_timeout,
    }
    async with GigaChat(**kwargs) as client:
        try:
            from gigachat.models import ChatCompletionRequest, ChatMessage

            response = await client.achat.create(
                ChatCompletionRequest(
                    messages=[ChatMessage(role=m["role"], content=m["content"]) for m in messages],
                    temperature=0.2,
                    max_tokens=max_tokens,
                )
            )
            return _extract_text(response)
        except Exception as primary_exc:
            if _is_rate_limit(primary_exc):
                raise
            logger.debug("GigaChat primary create failed, trying legacy: %s", primary_exc)
            from gigachat.models import Chat, Messages, MessagesRole

            role_map = {
                "system": MessagesRole.SYSTEM,
                "user": MessagesRole.USER,
                "assistant": MessagesRole.ASSISTANT,
            }
            response = await client.achat(
                Chat(
                    messages=[
                        Messages(role=role_map.get(m["role"], MessagesRole.USER), content=m["content"])
                        for m in messages
                    ],
                    temperature=0.2,
                    max_tokens=max_tokens,
                )
            )
            return _extract_text(response)


async def complete(messages: list[dict[str, str]], *, max_tokens: int = 1200) -> str | None:
    if not gigachat_enabled():
        return None
    settings = get_settings()
    retries = max(1, int(settings.gigachat_retry_max))
    async with _lock:
        for attempt in range(retries):
            try:
                await _throttle()
                text = await _once(messages, max_tokens=max_tokens)
                return text.strip() or None
            except Exception as exc:
                if _is_rate_limit(exc) and attempt + 1 < retries:
                    backoff = min(8.0, (2**attempt) * 1.5)
                    logger.warning("GigaChat 429, retry in %.1fs (%s/%s)", backoff, attempt + 1, retries)
                    await asyncio.sleep(backoff)
                    continue
                logger.warning("GigaChat complete failed: %s", exc)
                return None
    return None
