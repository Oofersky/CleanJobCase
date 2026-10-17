import hmac
from fastapi import Header, HTTPException, Request
from app.config import get_settings
from app.core.rate_limit import enforce_admin_rate_limit

async def require_admin(request: Request, x_admin_token: str | None=Header(default=None)) -> None:
    await enforce_admin_rate_limit(request)
    settings = get_settings()
    expected = (settings.admin_token or '').strip()
    if not expected:
        raise HTTPException(status_code=503, detail='Админка не настроена: задайте ADMIN_TOKEN в .env')
    provided = (x_admin_token or '').strip()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail='Неверный admin-токен')
