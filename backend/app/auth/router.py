from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UpdateProfileRequest, UserPublic
from app.auth.security import create_access_token
from app.auth.service import authenticate, create_user, get_user_by_email, update_user
from app.core.rate_limit import enforce_auth_rate_limit
from app.database import get_session
router = APIRouter(prefix='/api/auth', tags=['auth'])

@router.post('/register', response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, session: AsyncSession=Depends(get_session)):
    await enforce_auth_rate_limit(request)
    existing = await get_user_by_email(session, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Email already registered')
    user = await create_user(session, payload)
    token = create_access_token(subject=user.email)
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))

@router.post('/login', response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, session: AsyncSession=Depends(get_session)):
    await enforce_auth_rate_limit(request)
    user = await authenticate(session, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid email or password')
    token = create_access_token(subject=user.email)
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))

@router.get('/me', response_model=UserPublic)
async def me(user: User=Depends(get_current_user)):
    return UserPublic.model_validate(user)

@router.patch('/me', response_model=UserPublic)
async def patch_me(payload: UpdateProfileRequest, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    if payload.name is None and payload.focus is None and (payload.password is None):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Nothing to update')
    if payload.password is not None and (not payload.current_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='current_password is required to change password')
    db_user = await get_user_by_email(session, user.email)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')
    updated = await update_user(session, db_user, payload)
    return UserPublic.model_validate(updated)
