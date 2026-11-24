from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas import LoginRequest, RegisterRequest, UserPublic
from app.services.auth import (
    AuthUser,
    authenticate,
    check_auth_rate_limit,
    clear_auth_failures,
    clear_session_cookie,
    note_auth_failure,
    optional_user,
    require_user,
    set_session_cookie,
    validate_login,
    validate_password,
)
from app.services.users import create_user, get_user_by_email, get_user_by_login

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    check_auth_rate_limit(request)
    login = validate_login(body.login)
    password = validate_password(body.password)
    email = str(body.email).lower().strip()
    if await get_user_by_login(session, login):
        note_auth_failure(request)
        raise HTTPException(status_code=409, detail="Логин уже занят")
    if await get_user_by_email(session, email):
        note_auth_failure(request)
        raise HTTPException(status_code=409, detail="Почта уже зарегистрирована")
    user = await create_user(session, login=login, email=email, password=password)
    clear_auth_failures(request)
    set_session_cookie(response, user.id)
    return UserPublic(id=user.id, login=user.login, email=user.email)


@router.post("/login", response_model=UserPublic)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    check_auth_rate_limit(request)
    login_name = validate_login(body.login)
    user = await authenticate(login_name, body.password, session)
    if not user:
        note_auth_failure(request)
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    clear_auth_failures(request)
    set_session_cookie(response, user.id)
    return UserPublic(id=user.id, login=user.login, email=user.email)


@router.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me(user: Annotated[AuthUser, Depends(require_user)]):
    return UserPublic(id=user.id, login=user.login, email=user.email)


@router.get("/status")
async def status(user: Annotated[AuthUser | None, Depends(optional_user)]):
    if not user:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "user": UserPublic(id=user.id, login=user.login, email=user.email).model_dump(),
    }
