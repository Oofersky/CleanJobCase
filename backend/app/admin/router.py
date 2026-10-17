from __future__ import annotations
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.admin.deps import require_admin
from app.database import get_session
from app.knowledge.loader import KnowledgeError, reload_knowledge
from app.knowledge.store import list_scenario_ids, read_catalog_raw, read_scenario_raw, save_catalog_raw, save_scenario_raw
from app.services.gigachat_client import gigachat_enabled
from app.telemetry.schemas import TelemetryOverview
from app.telemetry.service import build_overview
router = APIRouter(prefix='/api/admin', tags=['admin'], dependencies=[Depends(require_admin)])

class CatalogIn(BaseModel):
    sources: list[dict[str, Any]] = Field(min_length=1)

class ScenarioIn(BaseModel):
    data: dict[str, Any]

@router.get('/status')
async def admin_status() -> dict[str, Any]:
    return {'ok': True, 'gigachat': 'configured' if gigachat_enabled() else 'fallback', 'scenarios': list_scenario_ids()}

@router.get('/catalog')
async def get_catalog() -> dict[str, Any]:
    return read_catalog_raw()

def _kb_http_error(exc: KnowledgeError, *, not_found: bool=False) -> HTTPException:
    message = str(exc)
    if '/' in message or '\\' in message or '.json' in message:
        message = 'Некорректные данные базы знаний' if not not_found else 'Сценарий не найден'
    return HTTPException(status_code=404 if not_found else 400, detail=message)

@router.put('/catalog')
async def put_catalog(payload: CatalogIn) -> dict[str, Any]:
    try:
        return save_catalog_raw({'sources': payload.sources})
    except KnowledgeError as exc:
        raise _kb_http_error(exc) from exc

@router.get('/scenarios')
async def get_scenarios() -> list[dict[str, str]]:
    out = []
    for sid in list_scenario_ids():
        data = read_scenario_raw(sid)
        out.append({'id': sid, 'title': str(data.get('title') or sid)})
    return out

@router.get('/scenarios/{scenario_id}')
async def get_scenario(scenario_id: str) -> dict[str, Any]:
    try:
        return read_scenario_raw(scenario_id)
    except KnowledgeError as exc:
        raise _kb_http_error(exc, not_found=True) from exc

@router.put('/scenarios/{scenario_id}')
async def put_scenario(scenario_id: str, payload: ScenarioIn) -> dict[str, Any]:
    try:
        return save_scenario_raw(scenario_id, payload.data)
    except KnowledgeError as exc:
        raise _kb_http_error(exc) from exc

@router.post('/reload')
async def reload_kb() -> dict[str, str]:
    try:
        reload_knowledge()
    except KnowledgeError as exc:
        raise _kb_http_error(exc) from exc
    return {'status': 'reloaded'}

@router.get('/telemetry', response_model=TelemetryOverview)
async def telemetry_overview(db: AsyncSession=Depends(get_session)) -> TelemetryOverview:
    return await build_overview(db)
