from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.admin.router import router as admin_router
from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.chat.router import scenarios_router
from app.config import get_settings
from app.database import init_db
from app.export.router import router as export_router
from app.knowledge import reload_knowledge
from app.practice.router import router as practice_router
from app.telemetry.router import router as telemetry_router
logger = logging.getLogger('mentorai')

class SecurityHeadersMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        response.headers.setdefault('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
        response.headers.setdefault('Cache-Control', 'no-store')
        return response

@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    try:
        reload_knowledge()
    except Exception as exc:
        logger.warning('knowledge failed to load: %s', exc)
    yield
settings = get_settings()
app = FastAPI(title='MentOrAI API', version='0.1.0', lifespan=lifespan, docs_url='/docs' if settings.enable_openapi else None, redoc_url='/redoc' if settings.enable_openapi else None, openapi_url='/openapi.json' if settings.enable_openapi else None)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'X-Admin-Token'])
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(scenarios_router)
app.include_router(practice_router)
app.include_router(export_router)
app.include_router(telemetry_router)
app.include_router(admin_router)

@app.get('/api/health')
async def health():
    from app.services.gigachat_client import gigachat_enabled
    payload = {'status': 'ok'}
    if not settings.is_production:
        payload['gigachat'] = 'configured' if gigachat_enabled() else 'fallback'
    return payload
