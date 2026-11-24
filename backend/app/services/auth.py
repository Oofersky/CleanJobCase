from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.models import UserRow

COOKIE_NAME = "pv_session"
LOGIN_RE = re.compile(r"^[a-zA-Z0-9_]{3,32}$")
# чуть легче для Docker/Windows; параметры пишутся в сам hash
_ph = PasswordHasher(time_cost=2, memory_cost=32768, parallelism=2)
# for timing-safe login when user missing
_DUMMY_HASH = _ph.hash("not-a-real-password-placeholder")

# ip -> list of fail timestamps
_fail_bucket: dict[str, list[float]] = {}
_FAIL_WINDOW = 900.0
_FAIL_MAX = 10


@dataclass(frozen=True)
class AuthUser:
    id: int
    login: str
    email: str


def validate_login(login: str) -> str:
    value = (login or "").strip()
    if not LOGIN_RE.fullmatch(value):
        raise HTTPException(
            status_code=400,
            detail="Логин: 3–32 символа, латиница, цифры или _",
        )
    return value


def validate_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < 12 or len(password) > 128:
        raise HTTPException(status_code=400, detail="Пароль: от 12 до 128 символов")
    return password


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().secret_key, salt="pv-auth-v1")


def issue_session_token(user_id: int) -> str:
    return _serializer().dumps({"uid": int(user_id)})


def read_session_token(token: str) -> int | None:
    settings = get_settings()
    try:
        data = _serializer().loads(token, max_age=settings.session_max_age_seconds)
    except (BadSignature, SignatureExpired, TypeError, ValueError):
        return None
    uid = data.get("uid") if isinstance(data, dict) else None
    return int(uid) if isinstance(uid, int) or (isinstance(uid, str) and uid.isdigit()) else None


def set_session_cookie(response: Response, user_id: int) -> None:
    settings = get_settings()
    response.set_cookie(
        key=COOKIE_NAME,
        value=issue_session_token(user_id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def client_ip(request: Request) -> str:
    settings = get_settings()
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64] or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def check_auth_rate_limit(request: Request) -> None:
    ip = client_ip(request)
    now = time.monotonic()
    stamps = [t for t in _fail_bucket.get(ip, []) if now - t < _FAIL_WINDOW]
    _fail_bucket[ip] = stamps
    if len(stamps) >= _FAIL_MAX:
        raise HTTPException(status_code=429, detail="Слишком много попыток. Подождите 15 минут.")


def note_auth_failure(request: Request) -> None:
    ip = client_ip(request)
    now = time.monotonic()
    stamps = [t for t in _fail_bucket.get(ip, []) if now - t < _FAIL_WINDOW]
    stamps.append(now)
    _fail_bucket[ip] = stamps


def clear_auth_failures(request: Request) -> None:
    _fail_bucket.pop(client_ip(request), None)


async def authenticate(login: str, password: str, session: AsyncSession) -> UserRow | None:
    result = await session.execute(select(UserRow).where(UserRow.login == login))
    user = result.scalar_one_or_none()
    if user is None:
        verify_password(_DUMMY_HASH, password)
        return None
    if not verify_password(user.password_hash, password):
        return None
    return user


async def user_from_cookie(
    session: AsyncSession,
    pv_session: str | None,
) -> AuthUser | None:
    if not pv_session:
        return None
    uid = read_session_token(pv_session)
    if uid is None:
        return None
    row = await session.get(UserRow, uid)
    if not row:
        return None
    return AuthUser(id=row.id, login=row.login, email=row.email)


async def require_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    pv_session: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> AuthUser:
    user = await user_from_cookie(session, pv_session)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется вход")
    request.state.user = user
    return user


async def optional_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    pv_session: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> AuthUser | None:
    return await user_from_cookie(session, pv_session)
