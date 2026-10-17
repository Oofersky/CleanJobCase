from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.rate_limit import enforce_chat_rate_limit
from app.database import get_session
from app.export.pdf_service import build_pdf_bytes
from app.practice import service as practice_service
from app.services.gigachat_client import compose_export_brief
router = APIRouter(prefix='/api/export', tags=['export'])
SCENARIO_LABELS = {'university': 'Выбор вуза', 'job': 'Первая работа', 'adapt': 'Первый месяц'}
MODE_LABELS = {'info': 'Инфо', 'trainer': 'Тренажёр'}

class ExportRequest(BaseModel):
    kind: str = Field(pattern='^(report|notes)$')
    session_ids: list[str] = Field(default_factory=list, max_length=8)
    focusLabel: str = Field(default='', max_length=80)

def _owned_export_sessions(rows, session_ids: list[str]) -> list[dict]:
    wanted = {sid for sid in session_ids if sid}
    if not wanted:
        selected = list(rows)
    else:
        owned_ids = {row.id for row in rows}
        missing = wanted - owned_ids
        if missing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Некоторые session_ids не найдены или недоступны')
        selected = [row for row in rows if row.id in wanted]
    export_rows = []
    for row in selected[:8]:
        export_rows.append({'title': row.title, 'scenarioLabel': SCENARIO_LABELS.get(row.scenario, row.scenario), 'modeLabel': MODE_LABELS.get(row.mode, row.mode), 'messages': [{'role': msg.role, 'text': msg.text} for msg in (row.messages or [])[:40] if msg.role in {'user', 'bot'}]})
    return export_rows

@router.post('/pdf')
async def export_pdf(payload: ExportRequest, request: Request, user: User=Depends(get_current_user), session: AsyncSession=Depends(get_session)) -> Response:
    await enforce_chat_rate_limit(request, user.id)
    progress = await practice_service.get_progress(session, user.id)
    focus_label = (payload.focusLabel or '').strip() or SCENARIO_LABELS.get(getattr(user, 'focus', None) or '', 'сценарий не выбран')
    export_sessions: list[dict] = []
    if payload.kind == 'report':
        owned = await practice_service.list_sessions(session, user.id)
        export_sessions = _owned_export_sessions(owned, payload.session_ids)
    weak_zones = list(progress.weakZones or [])[:12]
    notes = list(progress.notes or [])[:12]
    if not weak_zones or not notes:
        session_summaries = [f"{row.get('title')}: {row.get('scenarioLabel')} / {row.get('modeLabel')} ({len(row.get('messages') or [])} сообщ.)" for row in export_sessions]
        ai_brief = await compose_export_brief(kind=payload.kind, user_name=user.name or 'Участник', focus_label=focus_label, weak_zones=weak_zones, notes=notes, session_summaries=session_summaries if payload.kind == 'report' else None)
        if ai_brief:
            if not weak_zones:
                weak_zones = list(ai_brief.get('weak_zones') or [])[:12]
            if not notes:
                notes = list(ai_brief.get('notes') or [])[:12]
    pdf_bytes = build_pdf_bytes(kind=payload.kind, user_name=user.name or 'Участник', focus_label=focus_label, weak_zones=weak_zones, notes=notes, sessions=export_sessions)
    filename = 'mentorai-report.pdf' if payload.kind == 'report' else 'mentorai-notes.pdf'
    return Response(content=pdf_bytes, media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{filename}"', 'Cache-Control': 'no-store'})
