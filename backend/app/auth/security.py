from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import get_settings
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
settings = get_settings()

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def create_access_token(*, subject: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {'sub': subject, 'iat': int(now.timestamp()), 'exp': int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp())}
    return jwt.encode(payload, settings.jwt_secret, algorithm='HS256')

def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=['HS256'])
    except JWTError as exc:
        raise ValueError('Invalid token') from exc
