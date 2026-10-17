from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.models import User
from app.auth.schemas import RegisterRequest, UpdateProfileRequest
from app.auth.security import hash_password, verify_password

async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()

async def create_user(session: AsyncSession, payload: RegisterRequest) -> User:
    user = User(email=payload.email.lower(), name=payload.name.strip(), password_hash=hash_password(payload.password), focus='university')
    session.add(user)
    try:
        await session.commit()
        await session.refresh(user)
        return user
    except Exception:
        await session.rollback()
        raise

async def authenticate(session: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(session, email.strip().lower())
    if not user or not verify_password(password, user.password_hash):
        return None
    return user

async def update_user(session: AsyncSession, user: User, payload: UpdateProfileRequest) -> User:
    data = payload.model_dump(exclude_unset=True)
    if 'name' in data and data['name'] is not None:
        user.name = data['name'].strip()
    if 'focus' in data and data['focus'] is not None:
        user.focus = data['focus']
    if data.get('password'):
        current = data.get('current_password') or ''
        if not current or not verify_password(current, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Current password is incorrect')
        user.password_hash = hash_password(data['password'])
    try:
        await session.commit()
        await session.refresh(user)
        return user
    except HTTPException:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        raise
