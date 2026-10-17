from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.models import User
from app.auth.security import decode_access_token
from app.auth.service import get_user_by_email
from app.database import get_session
bearer = HTTPBearer(auto_error=False)

async def get_optional_user(credentials: HTTPAuthorizationCredentials | None=Depends(bearer), session: AsyncSession=Depends(get_session)) -> User | None:
    if not credentials:
        return None
    raw = credentials.credentials or ''
    if raw.startswith('local.'):
        return None
    try:
        payload = decode_access_token(raw)
        email = payload.get('sub')
    except ValueError:
        return None
    if not email:
        return None
    return await get_user_by_email(session, email)

async def get_current_user(user: User | None=Depends(get_optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Not authenticated')
    return user
