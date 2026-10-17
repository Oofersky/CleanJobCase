from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, Field
ShortStr = Annotated[str, Field(min_length=1, max_length=120)]
NoteStr = Annotated[str, Field(min_length=1, max_length=200)]
TagStr = Annotated[str, Field(min_length=1, max_length=64)]

class OpinionIn(BaseModel):
    session_id: str | None = Field(default=None, max_length=40)
    client_key: str = Field(min_length=3, max_length=80)
    rating: Literal['like', 'dislike'] | None = None
    message_text: str = Field(min_length=1, max_length=8000)
    scenario: str = Field(default='university', pattern='^(university|job|adapt)$')
    mode: str = Field(default='info', pattern='^(info|trainer)$')
    tags: list[TagStr] = Field(default_factory=list, max_length=12)

class OpinionOut(BaseModel):
    id: int
    rating: str
    fingerprint: str
    updated: bool

class RecommendationsRefreshIn(BaseModel):
    scenario: str = Field(default='university', pattern='^(university|job|adapt)$')
    weak_zones: list[ShortStr] = Field(default_factory=list, max_length=12)
    notes: list[NoteStr] = Field(default_factory=list, max_length=12)
    focus_label: str = Field(default='', max_length=80)

class RecommendationsRefreshOut(BaseModel):
    notes: list[str]
    prompts: list[str]
    weak_zones: list[str] = Field(default_factory=list)
    source: str

class TelemetryKpi(BaseModel):
    likes: int
    dislikes: int
    total: int
    like_rate: float
    unique_users: int
    flagged_answers: int

class FlaggedAnswer(BaseModel):
    fingerprint: str
    excerpt: str
    scenario: str
    dislike_count: int
    like_count: int
    last_seen: datetime | None = None

class OpinionRow(BaseModel):
    id: int
    user_id: int
    session_id: str | None
    rating: str
    scenario: str
    mode: str
    excerpt: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime

class TelemetryOverview(BaseModel):
    kpi: TelemetryKpi
    by_scenario: dict[str, dict[str, int]]
    flagged: list[FlaggedAnswer]
    recent: list[OpinionRow]
