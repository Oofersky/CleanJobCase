from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


IssueKind = Literal["gap", "ambiguity", "contradiction"]


class Remark(BaseModel):
    topic: str
    source_field: str
    quote: str = ""
    quote_secondary: str = ""
    kind: IssueKind
    problem: str
    recommendation: str


class VacancyReport(BaseModel):
    vacancy_id: str
    vacancy_url: str | None = None
    job_name: str | None = None
    company_name: str | None = None
    duty: str | None = None
    requirements: str | None = None
    requirement: dict[str, Any] | None = None
    schedule: str | None = None
    employment: str | None = None
    salary: str | None = None
    remarks: list[Remark] = Field(default_factory=list)


class AnalysisReport(BaseModel):
    id: int | None = None
    generated_at: str
    source: Literal["api", "fixture", "upload"]
    source_url: str | None = None
    vacancies_processed: int
    pages_fetched: int = 0
    ai_used: bool = False
    error: str | None = None
    vacancies: list[VacancyReport] = Field(default_factory=list)


class ReportSummary(BaseModel):
    id: int
    created_at: str
    source: Literal["api", "fixture", "upload"]
    vacancies_processed: int
    ai_used: bool = False
    has_error: bool = False


class RunRequest(BaseModel):
    max_vacancies: int | None = None
    # api = поиск в сети; fixture = учебный JSON для жюри
    source: Literal["api", "fixture"] = "api"


class VerifyRequest(BaseModel):
    """Local JSON in trudvsem API shape, or a bare list of vacancy wrappers."""

    payload: dict[str, Any] | list[Any]
    use_ai: bool = True


class ResumeDraftRequest(BaseModel):
    vacancy_id: str | None = None
    report_id: int | None = None
    vacancy: dict[str, Any] | None = None
    resume: dict[str, Any]
    use_ai: bool = True


class ResumeSampleRequest(BaseModel):
    vacancy_id: str | None = None
    report_id: int | None = None
    vacancy: dict[str, Any] | None = None


class ResumeSampleResponse(BaseModel):
    resume: dict[str, Any]
    vacancy_id: str | None = None
    job_name: str | None = None


class ResumeVacancyOption(BaseModel):
    id: str
    report_id: int
    job_name: str | None = None
    company_name: str | None = None
    vacancy_url: str | None = None
    duty: str | None = None
    requirements: str | None = None
    schedule: str | None = None
    employment: str | None = None
    salary: str | None = None



class ResumeDraftSummary(BaseModel):
    id: int
    created_at: str
    vacancy_id: str | None = None
    job_name: str | None = None
    company_name: str | None = None
    ai_used: bool = False


class ResumeDraftResponse(BaseModel):
    id: int | None = None
    vacancy_id: str | None = None
    job_name: str | None = None
    company_name: str | None = None
    vacancy_url: str | None = None
    draft_text: str
    ai_used: bool
    used_fields: list[str] = Field(default_factory=list)
    matched_skills: list[str] = Field(default_factory=list)
    vacancy_fields_used: list[str] = Field(default_factory=list)
    report_id: int | None = None
    resume: dict[str, Any] | None = None


class RegisterRequest(BaseModel):
    login: str = Field(min_length=3, max_length=32)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    login: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: int
    login: str
    email: EmailStr

