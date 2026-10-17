from __future__ import annotations
import hashlib
import re
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.telemetry.models import FeedbackOpinion
from app.telemetry.schemas import FlaggedAnswer, OpinionRow, TelemetryKpi, TelemetryOverview
_WS = re.compile('\\s+')

def fingerprint_text(text: str) -> str:
    normalized = _WS.sub(' ', (text or '').strip().lower())[:2000]
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

def excerpt_text(text: str, limit: int=280) -> str:
    cleaned = _WS.sub(' ', (text or '').strip())
    if len(cleaned) <= limit:
        return cleaned
    return f'{cleaned[:limit - 1]}…'

async def upsert_opinion(db: AsyncSession, *, user_id: int, client_key: str, rating: str | None, message_text: str, scenario: str, mode: str, session_id: str | None, tags: list[str]) -> tuple[FeedbackOpinion | None, bool]:
    key = client_key.strip()[:80]
    result = await db.execute(select(FeedbackOpinion).where(FeedbackOpinion.user_id == user_id, FeedbackOpinion.client_key == key))
    row = result.scalar_one_or_none()
    if rating is None:
        if row:
            await db.delete(row)
            await db.commit()
            return (None, True)
        return (None, False)
    fp = fingerprint_text(message_text)
    excerpt = excerpt_text(message_text)
    now = datetime.now(timezone.utc)
    safe_tags = [str(t)[:40] for t in (tags or [])[:12]]
    if row:
        row.rating = rating
        row.fingerprint = fp
        row.message_excerpt = excerpt
        row.scenario = scenario
        row.mode = mode
        row.session_id = session_id
        row.tags = safe_tags
        row.updated_at = now
        await db.commit()
        await db.refresh(row)
        return (row, True)
    row = FeedbackOpinion(user_id=user_id, session_id=session_id, client_key=key, fingerprint=fp, rating=rating, message_excerpt=excerpt, scenario=scenario, mode=mode, tags=safe_tags, created_at=now, updated_at=now)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return (row, False)

async def disliked_hints_for_prompt(db: AsyncSession, *, scenario: str, min_dislikes: int=2, limit: int=4) -> list[str]:
    dislike_count = func.sum(case((FeedbackOpinion.rating == 'dislike', 1), else_=0)).label('dislike_count')
    like_count = func.sum(case((FeedbackOpinion.rating == 'like', 1), else_=0)).label('like_count')
    stmt = select(FeedbackOpinion.fingerprint, func.max(FeedbackOpinion.message_excerpt).label('excerpt'), dislike_count, like_count).where(FeedbackOpinion.scenario == scenario).group_by(FeedbackOpinion.fingerprint).having(dislike_count >= min_dislikes).order_by(dislike_count.desc()).limit(limit)
    rows = (await db.execute(stmt)).all()
    hints: list[str] = []
    for row in rows:
        if int(row.like_count or 0) >= int(row.dislike_count or 0):
            continue
        excerpt = str(row.excerpt or '').strip()
        if excerpt:
            hints.append(f'({int(row.dislike_count)} дизлайков) {excerpt[:220]}')
    if not hints and min_dislikes > 1:
        return await disliked_hints_for_prompt(db, scenario=scenario, min_dislikes=1, limit=limit)
    return hints[:limit]

async def build_overview(db: AsyncSession, *, recent_limit: int=40, flagged_limit: int=12) -> TelemetryOverview:
    likes = (await db.execute(select(func.count()).select_from(FeedbackOpinion).where(FeedbackOpinion.rating == 'like'))).scalar_one()
    dislikes = (await db.execute(select(func.count()).select_from(FeedbackOpinion).where(FeedbackOpinion.rating == 'dislike'))).scalar_one()
    total = int(likes) + int(dislikes)
    unique_users = (await db.execute(select(func.count(func.distinct(FeedbackOpinion.user_id))))).scalar_one()
    by_scenario: dict[str, dict[str, int]] = {}
    scenario_rows = (await db.execute(select(FeedbackOpinion.scenario, FeedbackOpinion.rating, func.count()).group_by(FeedbackOpinion.scenario, FeedbackOpinion.rating))).all()
    for scenario, rating, count in scenario_rows:
        bucket = by_scenario.setdefault(str(scenario), {'like': 0, 'dislike': 0})
        if rating in bucket:
            bucket[rating] = int(count)
    dislike_count = func.sum(case((FeedbackOpinion.rating == 'dislike', 1), else_=0)).label('dislike_count')
    like_count = func.sum(case((FeedbackOpinion.rating == 'like', 1), else_=0)).label('like_count')
    flagged_stmt = select(FeedbackOpinion.fingerprint, func.max(FeedbackOpinion.message_excerpt).label('excerpt'), func.max(FeedbackOpinion.scenario).label('scenario'), dislike_count, like_count, func.max(FeedbackOpinion.updated_at).label('last_seen')).group_by(FeedbackOpinion.fingerprint).having(dislike_count >= 2).order_by(dislike_count.desc()).limit(flagged_limit)
    flagged_rows = (await db.execute(flagged_stmt)).all()
    flagged = [FlaggedAnswer(fingerprint=str(row.fingerprint), excerpt=str(row.excerpt or ''), scenario=str(row.scenario or ''), dislike_count=int(row.dislike_count or 0), like_count=int(row.like_count or 0), last_seen=row.last_seen) for row in flagged_rows if int(row.dislike_count or 0) > int(row.like_count or 0)]
    recent_result = await db.execute(select(FeedbackOpinion).order_by(FeedbackOpinion.updated_at.desc()).limit(recent_limit))
    recent = [OpinionRow(id=item.id, user_id=item.user_id, session_id=item.session_id, rating=item.rating, scenario=item.scenario, mode=item.mode, excerpt=item.message_excerpt, tags=list(item.tags or []), created_at=item.created_at, updated_at=item.updated_at) for item in recent_result.scalars().all()]
    like_rate = round(int(likes) / total * 100, 1) if total else 0.0
    return TelemetryOverview(kpi=TelemetryKpi(likes=int(likes), dislikes=int(dislikes), total=total, like_rate=like_rate, unique_users=int(unique_users or 0), flagged_answers=len(flagged)), by_scenario=by_scenario, flagged=flagged, recent=recent)

def heuristic_recommendations(*, scenario: str, weak_zones: list[str], notes: list[str]) -> dict[str, list[str]]:
    from app.ml.weak_zones import RULES
    prompts: list[str] = []
    new_notes: list[str] = []
    for zone in weak_zones[:6]:
        rule = next((r for r in RULES if r.zone == zone), None)
        if rule and scenario in rule.scenarios:
            prompts.append(rule.follow_up[:120])
            new_notes.append(f'Повтори: {rule.follow_up}')
        else:
            new_notes.append(f'Слабая зона «{zone}» — разбери 1 короткий кейс в тренажёре.')
            prompts.append(f'Разбери тему: {zone}')
    if not new_notes and notes:
        new_notes = list(notes)[:6]
    if not prompts:
        defaults = {'university': ['Сравни 2 вуза без опоры только на рейтинг'], 'job': ['Опиши учебный проект: задача → действия → результат'], 'adapt': ['Как за 15 секунд уточнить критерий «готово» у тимлида']}
        prompts = defaults.get(scenario, defaults['university'])
    return {'notes': list(dict.fromkeys(new_notes))[:8], 'prompts': list(dict.fromkeys(prompts))[:5]}

def collect_zones_from_sessions(sessions: list[Any]) -> list[str]:
    from app.ml.weak_zones import detect_weak_zones
    found: list[str] = []
    for item in (sessions or [])[:12]:
        messages = getattr(item, 'messages', None)
        if messages is None and isinstance(item, dict):
            messages = item.get('messages') or []
        for msg in messages or []:
            role = getattr(msg, 'role', None) or (msg.get('role') if isinstance(msg, dict) else '')
            text = getattr(msg, 'text', None) or (msg.get('text') if isinstance(msg, dict) else '')
            if str(role) != 'user':
                continue
            for zone in detect_weak_zones(str(text or '')):
                if zone not in found:
                    found.append(zone)
    return found[:8]

async def compose_recommendations(*, scenario: str, weak_zones: list[str], notes: list[str], focus_label: str, session_digest: str='') -> dict[str, Any]:
    from app.services.gigachat_client import gigachat_enabled, _request_completion
    base = heuristic_recommendations(scenario=scenario, weak_zones=weak_zones, notes=notes)
    if not gigachat_enabled():
        return {**base, 'weak_zones': list(weak_zones)[:8], 'source': 'heuristic'}
    system = 'Ты MentOrAI. По новым сессиям практики обнови слабые зоны и рекомендации. Ответ строго в формате:\nWEAK:\n- зона\nNOTES:\n- пункт\nPROMPTS:\n- короткая подсказка для чата\nДо 6 WEAK, до 6 NOTES и до 5 PROMPTS. Без HTML. Информационный характер.'
    user = f"Сценарий: {scenario} ({focus_label or scenario})\nИзвестные слабые зоны: {', '.join(weak_zones) or 'нет'}\nСтарые рекомендации: {'; '.join(notes[:6]) or 'нет'}\nНовые сессии:\n{session_digest or '- нет диалогов'}\nОбнови слабые зоны и рекомендации на основе новых сессий."
    try:
        raw = await _request_completion([{'role': 'system', 'content': system}, {'role': 'user', 'content': user}], max_tokens=700)
    except Exception:
        return {**base, 'weak_zones': list(weak_zones)[:8], 'source': 'heuristic'}
    parsed_notes: list[str] = []
    parsed_prompts: list[str] = []
    parsed_weak: list[str] = []
    section = None
    for line in (raw or '').splitlines():
        upper = line.strip().upper()
        if upper.startswith('WEAK') or upper.startswith('СЛАБ'):
            section = 'weak'
            continue
        if upper.startswith('NOTES') or upper.startswith('РЕКОМЕНД'):
            section = 'notes'
            continue
        if upper.startswith('PROMPTS') or upper.startswith('ПОДСКАЗКИ'):
            section = 'prompts'
            continue
        cleaned = line.strip().lstrip('-•*').strip()
        if not cleaned:
            continue
        if section == 'weak':
            parsed_weak.append(cleaned[:120])
        elif section == 'notes':
            parsed_notes.append(cleaned[:220])
        elif section == 'prompts':
            parsed_prompts.append(cleaned[:120])
    merged_weak = list(dict.fromkeys([*parsed_weak, *weak_zones]))[:8]
    return {'notes': (parsed_notes or base['notes'])[:8], 'prompts': (parsed_prompts or base['prompts'])[:5], 'weak_zones': merged_weak or list(weak_zones)[:8], 'source': 'gigachat' if parsed_notes or parsed_prompts or parsed_weak else 'heuristic'}
