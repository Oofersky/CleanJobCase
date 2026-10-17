from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.database import get_session
from app.practice import service as practice_service
from app.practice.schemas import MessageIn, MessageRatingIn, ProgressOut, ProgressUpdate, SessionCreate, SessionOut, SessionUpdate
router = APIRouter(prefix='/api', tags=['practice'])

@router.get('/sessions', response_model=list[SessionOut])
async def list_sessions(session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    return await practice_service.list_sessions(session, user.id)

@router.post('/sessions', response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    return await practice_service.create_session(session, user.id, payload)

@router.get('/sessions/{session_id}', response_model=SessionOut)
async def get_session_detail(session_id: str, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    row = await practice_service.get_session(session, user.id, session_id)
    if not row:
        raise HTTPException(status_code=404, detail='Session not found')
    return row

@router.patch('/sessions/{session_id}', response_model=SessionOut)
async def patch_session(session_id: str, payload: SessionUpdate, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    row = await practice_service.update_session(session, user.id, session_id, payload)
    if not row:
        raise HTTPException(status_code=404, detail='Session not found')
    return row

@router.delete('/sessions/{session_id}', status_code=status.HTTP_204_NO_CONTENT)
async def remove_session(session_id: str, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    ok = await practice_service.delete_session(session, user.id, session_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Session not found')

@router.post('/sessions/{session_id}/messages', response_model=SessionOut)
async def add_message(session_id: str, payload: MessageIn, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    row = await practice_service.append_message(session, user.id, session_id, payload)
    if not row:
        raise HTTPException(status_code=404, detail='Session not found')
    return row

@router.put('/sessions/{session_id}/messages', response_model=SessionOut)
async def put_messages(session_id: str, payload: list[MessageIn], session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    if len(payload) > 200:
        raise HTTPException(status_code=400, detail='Too many messages')
    row = await practice_service.replace_messages(session, user.id, session_id, payload)
    if not row:
        raise HTTPException(status_code=404, detail='Session not found')
    return row

@router.patch('/sessions/{session_id}/messages/{message_index}/rating', response_model=SessionOut)
async def patch_message_rating(session_id: str, message_index: int, payload: MessageRatingIn, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    if message_index < 0:
        raise HTTPException(status_code=400, detail='Invalid message index')
    row = await practice_service.set_message_rating(session, user.id, session_id, message_index, payload.rating)
    if not row:
        raise HTTPException(status_code=404, detail='Session or message not found')
    return row

@router.get('/progress', response_model=ProgressOut)
async def get_progress(session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    return await practice_service.get_progress(session, user.id)

@router.put('/progress', response_model=ProgressOut)
async def save_progress(payload: ProgressUpdate, session: AsyncSession=Depends(get_session), user: User=Depends(get_current_user)):
    return await practice_service.put_progress(session, user.id, payload)
