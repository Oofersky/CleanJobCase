from __future__ import annotations
import secrets
import time
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.practice.models import PracticeMessage, PracticeSession, UserProgress
from app.practice.schemas import MessageIn, ProgressOut, ProgressUpdate, SessionCreate, SessionOut, SessionUpdate

def _ts(dt: datetime | None) -> int:
    if not dt:
        return int(time.time() * 1000)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)

def _sources_dump(sources) -> list[dict]:
    out: list[dict] = []
    for item in sources or []:
        if hasattr(item, 'model_dump'):
            out.append(item.model_dump())
        elif isinstance(item, dict):
            out.append(item)
    return out

def _session_out(row: PracticeSession) -> SessionOut:
    return SessionOut(id=row.id, title=row.title, scenario=row.scenario, mode=row.mode, caseIndex=row.case_index or 0, createdAt=_ts(row.created_at), updatedAt=_ts(row.updated_at), messages=[{'role': msg.role, 'text': msg.text, 'tags': msg.tags or [], 'sources': msg.sources or [], 'rating': msg.rating if msg.rating in {'like', 'dislike'} else None, 'at': _ts(msg.created_at)} for msg in row.messages or []])

def empty_progress() -> ProgressOut:
    return ProgressOut()

async def list_sessions(session: AsyncSession, user_id: int) -> list[SessionOut]:
    result = await session.execute(select(PracticeSession).where(PracticeSession.user_id == user_id).options(selectinload(PracticeSession.messages)).order_by(PracticeSession.updated_at.desc()))
    return [_session_out(row) for row in result.scalars().all()]

async def get_session(session: AsyncSession, user_id: int, session_id: str) -> SessionOut | None:
    result = await session.execute(select(PracticeSession).where(PracticeSession.user_id == user_id, PracticeSession.id == session_id).options(selectinload(PracticeSession.messages)))
    row = result.scalar_one_or_none()
    return _session_out(row) if row else None

async def create_session(session: AsyncSession, user_id: int, payload: SessionCreate) -> SessionOut:
    session_id = payload.id or f's_{secrets.token_hex(8)}'
    now = datetime.now(timezone.utc)
    row = PracticeSession(id=session_id, user_id=user_id, title=payload.title, scenario=payload.scenario, mode=payload.mode, case_index=payload.case_index, created_at=now, updated_at=now)
    session.add(row)
    for message in payload.messages:
        session.add(PracticeMessage(session_id=session_id, role=message.role, text=message.text, tags=list(message.tags), sources=_sources_dump(message.sources), rating=message.rating if message.rating in {'like', 'dislike'} else None, created_at=now))
    await session.commit()
    loaded = await get_session(session, user_id, session_id)
    assert loaded is not None
    return loaded

async def update_session(session: AsyncSession, user_id: int, session_id: str, payload: SessionUpdate) -> SessionOut | None:
    result = await session.execute(select(PracticeSession).where(PracticeSession.user_id == user_id, PracticeSession.id == session_id))
    row = result.scalar_one_or_none()
    if not row:
        return None
    if payload.title is not None:
        row.title = payload.title
    if payload.scenario is not None:
        row.scenario = payload.scenario
    if payload.mode is not None:
        row.mode = payload.mode
    if payload.case_index is not None:
        row.case_index = payload.case_index
    row.updated_at = datetime.now(timezone.utc)
    await session.commit()
    return await get_session(session, user_id, session_id)

async def delete_session(session: AsyncSession, user_id: int, session_id: str) -> bool:
    result = await session.execute(select(PracticeSession).where(PracticeSession.user_id == user_id, PracticeSession.id == session_id))
    row = result.scalar_one_or_none()
    if not row:
        return False
    await session.delete(row)
    await session.commit()
    return True

async def append_message(session: AsyncSession, user_id: int, session_id: str, message: MessageIn) -> SessionOut | None:
    result = await session.execute(select(PracticeSession).where(PracticeSession.user_id == user_id, PracticeSession.id == session_id))
    row = result.scalar_one_or_none()
    if not row:
        return None
    session.add(PracticeMessage(session_id=session_id, role=message.role, text=message.text, tags=list(message.tags), sources=_sources_dump(message.sources), rating=message.rating if message.rating in {'like', 'dislike'} else None))
    row.updated_at = datetime.now(timezone.utc)
    await session.commit()
    return await get_session(session, user_id, session_id)

async def set_message_rating(session: AsyncSession, user_id: int, session_id: str, message_index: int, rating: str | None) -> SessionOut | None:
    result = await session.execute(select(PracticeSession).where(PracticeSession.user_id == user_id, PracticeSession.id == session_id).options(selectinload(PracticeSession.messages)))
    row = result.scalar_one_or_none()
    if not row:
        return None
    messages = list(row.messages or [])
    if message_index < 0 or message_index >= len(messages):
        return None
    messages[message_index].rating = rating if rating in {'like', 'dislike'} else None
    row.updated_at = datetime.now(timezone.utc)
    await session.commit()
    return await get_session(session, user_id, session_id)

async def replace_messages(session: AsyncSession, user_id: int, session_id: str, messages: list[MessageIn]) -> SessionOut | None:
    result = await session.execute(select(PracticeSession).where(PracticeSession.user_id == user_id, PracticeSession.id == session_id).options(selectinload(PracticeSession.messages)))
    row = result.scalar_one_or_none()
    if not row:
        return None
    for existing in list(row.messages):
        await session.delete(existing)
    now = datetime.now(timezone.utc)
    for message in messages:
        session.add(PracticeMessage(session_id=session_id, role=message.role, text=message.text, tags=list(message.tags), sources=_sources_dump(message.sources), rating=message.rating if message.rating in {'like', 'dislike'} else None, created_at=now))
    row.updated_at = now
    await session.commit()
    return await get_session(session, user_id, session_id)

async def get_progress(session: AsyncSession, user_id: int) -> ProgressOut:
    row = await session.get(UserProgress, user_id)
    if not row or not row.data:
        return empty_progress()
    return ProgressOut.model_validate(row.data)

async def put_progress(session: AsyncSession, user_id: int, payload: ProgressUpdate) -> ProgressOut:
    data = ProgressOut(sessions=payload.sessions, byScenario={'university': int(payload.byScenario.get('university', 0)), 'job': int(payload.byScenario.get('job', 0)), 'adapt': int(payload.byScenario.get('adapt', 0))}, weakZones=list(payload.weakZones)[:8], notes=list(payload.notes)[:8], signals=[item.model_dump() for item in payload.signals[:40]]).model_dump()
    row = await session.get(UserProgress, user_id)
    if not row:
        row = UserProgress(user_id=user_id, data=data)
        session.add(row)
    else:
        row.data = data
        row.updated_at = datetime.now(timezone.utc)
    await session.commit()
    return ProgressOut.model_validate(data)
