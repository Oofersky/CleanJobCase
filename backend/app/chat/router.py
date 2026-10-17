from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from app.auth.dependencies import get_optional_user
from app.auth.models import User
from app.config import get_settings
from app.core.rate_limit import enforce_chat_rate_limit
from app.knowledge import get_scenario, load_scenarios, resolve_sources
from app.knowledge.search import list_cases
from app.services.chat_service import build_chat_reply
router = APIRouter(prefix='/api/chat', tags=['chat'])
ShortStr = Annotated[str, Field(min_length=1, max_length=120)]

class HistoryMessage(BaseModel):
    role: str = Field(pattern='^(user|bot|assistant|human)$')
    text: str = Field(min_length=1, max_length=4000)

class ChatRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    scenario: str = Field(default='university', pattern='^(university|job|adapt)$')
    mode: str = Field(default='info', pattern='^(info|trainer)$')
    weak_zones: list[ShortStr] = Field(default_factory=list, max_length=12)
    case_index: int = Field(default=0, ge=0, le=20)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=16)

class SourceOut(BaseModel):
    title: str
    source: str
    url: str
    accessed: str

class ChatResponse(BaseModel):
    text: str
    tags: list[str] = []
    detected_weak_zones: list[str] = []
    sources: list[SourceOut] = []
    case_id: str | None = None
    case_index: int | None = None
    next_case_index: int | None = None
    total_cases: int | None = None
    error_ids: list[str] = []
    trainer_completed: bool = False
    trainer_phase: str | None = None

class ScenarioSummary(BaseModel):
    id: str
    title: str
    topic_count: int
    case_count: int
    error_count: int = 0

class CaseOut(BaseModel):
    id: str
    index: int
    prompt: str
    sources: list[SourceOut] = []

class TopicOut(BaseModel):
    id: str
    summary: str
    keywords: list[str] = []
    sources: list[SourceOut] = []

class ScenarioDetail(BaseModel):
    id: str
    title: str
    disclaimer: str = ''
    topics: list[TopicOut] = []
    cases: list[CaseOut]

@router.post('', response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request, user: User | None=Depends(get_optional_user)) -> ChatResponse:
    settings = get_settings()
    if settings.chat_require_auth and user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required', headers={'WWW-Authenticate': 'Bearer'})
    await enforce_chat_rate_limit(request, user.id if user else None)
    reply = await build_chat_reply(text=payload.text, scenario=payload.scenario, mode=payload.mode, weak_zones=list(payload.weak_zones), case_index=payload.case_index, history=[item.model_dump() for item in payload.history], opinion_hints=[])
    return ChatResponse(text=reply.text, tags=reply.tags, detected_weak_zones=reply.detected_weak_zones, sources=[SourceOut(**item) for item in reply.sources], case_id=reply.case_id, case_index=reply.case_index, next_case_index=reply.next_case_index, total_cases=reply.total_cases, error_ids=reply.error_ids, trainer_completed=reply.trainer_completed, trainer_phase=reply.trainer_phase)
scenarios_router = APIRouter(prefix='/api/scenarios', tags=['scenarios'])

@scenarios_router.get('', response_model=list[ScenarioSummary])
async def list_scenarios() -> list[ScenarioSummary]:
    scenarios = load_scenarios()
    out: list[ScenarioSummary] = []
    for scenario_id, data in scenarios.items():
        out.append(ScenarioSummary(id=scenario_id, title=str(data.get('title') or scenario_id), topic_count=len(data.get('info', {}).get('topics') or []), case_count=len(data.get('trainer', {}).get('cases') or []), error_count=len(data.get('typical_errors') or [])))
    return out

@scenarios_router.get('/{scenario_id}', response_model=ScenarioDetail)
async def get_scenario_detail(scenario_id: str) -> ScenarioDetail:
    from fastapi import HTTPException
    data = get_scenario(scenario_id)
    if not data:
        raise HTTPException(status_code=404, detail='Scenario not found')
    topics_out: list[TopicOut] = []
    for topic in data.get('info', {}).get('topics') or []:
        if not isinstance(topic, dict):
            continue
        topics_out.append(TopicOut(id=str(topic.get('id') or 'topic'), summary=str(topic.get('summary') or ''), keywords=[str(k) for k in topic.get('keywords') or []], sources=[SourceOut(**item) for item in resolve_sources(list(topic.get('source_ids') or []))]))
    cases_out: list[CaseOut] = []
    for index, case in enumerate(list_cases(data)):
        cases_out.append(CaseOut(id=str(case.get('id') or f'case-{index}'), index=index, prompt=str(case.get('prompt') or ''), sources=[SourceOut(**item) for item in resolve_sources(list(case.get('source_ids') or []))]))
    return ScenarioDetail(id=str(data.get('id') or scenario_id), title=str(data.get('title') or scenario_id), disclaimer=str(data.get('disclaimer') or ''), topics=topics_out, cases=cases_out)
