from __future__ import annotations
import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import HTTPException, Request, status
from app.config import get_settings

class SlidingWindowLimiter:

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, *, max_requests: int, window_seconds: int) -> None:
        now = time.monotonic()
        window_start = now - window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < window_start:
                bucket.popleft()
            if len(bucket) >= max_requests:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='Слишком много запросов. Подожди минуту и попробуй снова.', headers={'Retry-After': str(window_seconds)})
            bucket.append(now)
limiter = SlidingWindowLimiter()

def client_key(request: Request, user_id: int | None=None) -> str:
    if user_id is not None:
        return f'user:{user_id}'
    settings = get_settings()
    if settings.trust_proxy:
        forwarded = request.headers.get('x-forwarded-for')
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
    client = request.client.host if request.client else 'unknown'
    return f'ip:{client}'

async def enforce_chat_rate_limit(request: Request, user_id: int | None=None) -> None:
    settings = get_settings()
    limiter.check(client_key(request, user_id), max_requests=settings.chat_rate_limit, window_seconds=settings.chat_rate_window_seconds)

async def enforce_auth_rate_limit(request: Request) -> None:
    settings = get_settings()
    limiter.check(f'auth:{client_key(request)}', max_requests=settings.auth_rate_limit, window_seconds=settings.auth_rate_window_seconds)

async def enforce_admin_rate_limit(request: Request) -> None:
    settings = get_settings()
    limiter.check(f'admin:{client_key(request)}', max_requests=30, window_seconds=60)
