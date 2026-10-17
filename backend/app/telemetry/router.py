from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.rate_limit import client_key, limiter
from app.database import get_session
from app.practice import service as practice_service
from app.practice.models import UserProgress
from app.telemetry.schemas import OpinionIn, OpinionOut, RecommendationsRefreshIn, RecommendationsRefreshOut
from app.telemetry.service import collect_zones_from_sessions, compose_recommendations, upsert_opinion
router = APIRouter(prefix='/api', tags=['telemetry'])

async def enforce_feedback_rate_limit(request: Request, user_id: int) -> None:
    limiter.check(f'feedback:{client_key(request, user_id)}', max_requests=60, window_seconds=60)

def _msg_field(msg, key: str) -> str:
    if isinstance(msg, dict):
        return str(msg.get(key) or '')
    return str(getattr(msg, key, '') or '')

def _session_digest(sessions: list) -> str:
    lines: list[str] = []
    for item in sessions[:8]:
        if isinstance(item, dict):
            title = item.get('title') or 'сессия'
            scenario = item.get('scenario') or ''
            mode = item.get('mode') or ''
            messages = item.get('messages') or []
        else:
            title = getattr(item, 'title', '') or 'сессия'
            scenario = getattr(item, 'scenario', '') or ''
            mode = getattr(item, 'mode', '') or ''
            messages = getattr(item, 'messages', None) or []
        user_bits = [_msg_field(msg, 'text')[:160] for msg in messages if _msg_field(msg, 'role') == 'user'][:3]
        snippet = ' | '.join((bit for bit in user_bits if bit.strip())) or 'без сообщений'
        lines.append(f'- {title} ({scenario}/{mode}): {snippet}')
    return '\n'.join(lines) if lines else '- нет диалогов'

@router.post('/feedback/opinion', response_model=OpinionOut)
async def post_opinion(payload: OpinionIn, request: Request, user: User=Depends(get_current_user), db: AsyncSession=Depends(get_session)) -> OpinionOut:
    await enforce_feedback_rate_limit(request, user.id)
    row, updated = await upsert_opinion(db, user_id=user.id, client_key=payload.client_key, rating=payload.rating, message_text=payload.message_text, scenario=payload.scenario, mode=payload.mode, session_id=payload.session_id, tags=payload.tags)
    if row is None:
        return OpinionOut(id=0, rating='cleared', fingerprint='', updated=updated)
    return OpinionOut(id=row.id, rating=row.rating, fingerprint=row.fingerprint, updated=updated)

@router.post('/recommendations/refresh', response_model=RecommendationsRefreshOut)
async def refresh_recommendations(payload: RecommendationsRefreshIn, request: Request, user: User=Depends(get_current_user), db: AsyncSession=Depends(get_session)) -> RecommendationsRefreshOut:
    limiter.check(f'reco:{client_key(request, user.id)}', max_requests=12, window_seconds=60)
    sessions = await practice_service.list_sessions(db, user.id)
    scanned = collect_zones_from_sessions(sessions)
    known = list(dict.fromkeys([*scanned, *(payload.weak_zones or [])]))[:8]
    digest = _session_digest(sessions)
    result = await compose_recommendations(scenario=payload.scenario, weak_zones=known, notes=payload.notes, focus_label=payload.focus_label, session_digest=digest)
    weak_zones = list(dict.fromkeys([*(result.get('weak_zones') or []), *known]))[:8]
    progress = await db.get(UserProgress, user.id)
    data = dict(progress.data or {}) if progress else {}
    data['notes'] = result['notes']
    data['weakZones'] = weak_zones
    data.setdefault('byScenario', {'university': 0, 'job': 0, 'adapt': 0})
    data.setdefault('sessions', data.get('sessions') or len(sessions))
    data.setdefault('signals', data.get('signals') or [])
    data['recoSource'] = result['source']
    data['recoUpdatedAt'] = datetime.now(timezone.utc).isoformat()
    if progress:
        progress.data = data
    else:
        db.add(UserProgress(user_id=user.id, data=data))
    await db.commit()
    return RecommendationsRefreshOut(notes=result['notes'], prompts=result['prompts'], weak_zones=weak_zones, source=result['source'])
