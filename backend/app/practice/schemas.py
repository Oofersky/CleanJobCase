from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field
ShortStr = Annotated[str, Field(min_length=1, max_length=120)]
NoteStr = Annotated[str, Field(min_length=1, max_length=200)]
TagStr = Annotated[str, Field(min_length=1, max_length=64)]

class SourceRef(BaseModel):
    model_config = ConfigDict(extra='ignore')
    title: str = Field(default='', max_length=200)
    source: str = Field(default='', max_length=200)
    url: str = Field(default='', max_length=500)
    accessed: str = Field(default='', max_length=40)

class SignalItem(BaseModel):
    model_config = ConfigDict(extra='ignore')
    at: int | None = Field(default=None, ge=0)
    scenario: str = Field(default='', max_length=40)
    zoneId: str = Field(default='', max_length=80)
    zone: str = Field(default='', max_length=120)
    engine: str = Field(default='', max_length=40)

class MessageIn(BaseModel):
    role: str = Field(pattern='^(user|bot)$')
    text: str = Field(min_length=1, max_length=8000)
    tags: list[TagStr] = Field(default_factory=list, max_length=12)
    sources: list[SourceRef] = Field(default_factory=list, max_length=12)
    rating: Literal['like', 'dislike'] | None = None

class MessageOut(BaseModel):
    role: str
    text: str
    tags: list[str] = []
    sources: list[dict] = []
    rating: str | None = None
    at: int

class MessageRatingIn(BaseModel):
    rating: Literal['like', 'dislike'] | None = None

class SessionCreate(BaseModel):
    id: str | None = Field(default=None, max_length=40, pattern='^[A-Za-z0-9_.-]{0,40}$')
    title: str = Field(min_length=1, max_length=120)
    scenario: str = Field(default='university', pattern='^(university|job|adapt)$')
    mode: str = Field(default='info', pattern='^(info|trainer)$')
    case_index: int = Field(default=0, ge=0, le=20)
    messages: list[MessageIn] = Field(default_factory=list, max_length=200)

class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    scenario: str | None = Field(default=None, pattern='^(university|job|adapt)$')
    mode: str | None = Field(default=None, pattern='^(info|trainer)$')
    case_index: int | None = Field(default=None, ge=0, le=20)

class SessionOut(BaseModel):
    id: str
    title: str
    scenario: str
    mode: str
    caseIndex: int = 0
    createdAt: int
    updatedAt: int
    messages: list[MessageOut] = []

class ProgressOut(BaseModel):
    sessions: int = 0
    byScenario: dict[str, int] = Field(default_factory=lambda: {'university': 0, 'job': 0, 'adapt': 0})
    weakZones: list[str] = []
    notes: list[str] = []
    signals: list[dict] = []

class ProgressUpdate(BaseModel):
    sessions: int = Field(default=0, ge=0)
    byScenario: dict[str, int] = Field(default_factory=dict)
    weakZones: list[ShortStr] = Field(default_factory=list, max_length=12)
    notes: list[NoteStr] = Field(default_factory=list, max_length=12)
    signals: list[SignalItem] = Field(default_factory=list, max_length=40)
