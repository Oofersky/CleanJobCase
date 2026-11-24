from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.schemas import (
    ResumeDraftRequest,
    ResumeDraftResponse,
    ResumeSampleRequest,
    ResumeSampleResponse,
    RunRequest,
    VerifyRequest,
)
from app.services.auth import AuthUser, require_user
from app.services.draft_store import get_draft, list_drafts, save_draft
from app.services.gigachat_client import gigachat_enabled
from app.services.pipeline import run_from_api, run_from_payload
from app.services.report_store import get_report, list_reports, load_latest
from app.services.resume_draft import (
    build_sample_resume,
    draft_resume,
    list_resume_vacancies,
    resolve_vacancy,
)

router = APIRouter(prefix="/api")


@router.get("/health")
async def health():
    settings = get_settings()
    payload: dict[str, Any] = {"status": "ok", "service": "prozrachnaya-vakansiya"}
    if not settings.is_production:
        payload["gigachat"] = "configured" if gigachat_enabled() else "rules-only"
        payload["schedule_enabled"] = settings.schedule_enabled
    return payload


@router.get("/config")
async def public_config():
    settings = get_settings()
    return {
        "vacancies_api_url": settings.vacancies_api_url,
        "vacancies_max": settings.vacancies_max,
        "vacancies_page_limit": settings.vacancies_page_limit,
        "schedule_interval_minutes": settings.schedule_interval_minutes,
        "schedule_enabled": settings.schedule_enabled,
        "gigachat": "configured" if gigachat_enabled() else "rules-only",
    }


@router.get("/reports")
async def reports_list(
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    items = await list_reports(session, user_id=user.id)
    return {"items": [i.model_dump(mode="json") for i in items]}


@router.get("/reports/{report_id}")
async def reports_get(
    report_id: int,
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    report = await get_report(session, report_id, user_id=user.id)
    if not report:
        raise HTTPException(status_code=404, detail="report not found")
    return JSONResponse(content=json.loads(report.model_dump_json()))


@router.get("/reports/{report_id}/download")
async def reports_download(
    report_id: int,
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    report = await get_report(session, report_id, user_id=user.id)
    if not report:
        raise HTTPException(status_code=404, detail="report not found")
    body = report.model_dump_json(indent=2)
    return Response(
        content=body.encode("utf-8"),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="otchet-{report_id}.json"'},
    )


@router.post("/run")
async def run_pipeline(
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    body: RunRequest | None = None,
):
    max_v = body.max_vacancies if body else None
    source = body.source if body else "api"
    if source == "fixture":
        settings = get_settings()
        path = Path(settings.fixtures_dir) / "kantkod_sample_vacancies.json"
        if not path.exists():
            path = Path(settings.fixtures_dir) / "sample_vacancies.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="fixture not found")
        payload = json.loads(path.read_text(encoding="utf-8"))
        report = await run_from_payload(
            session, payload, source="fixture", use_ai=True, persist=True, user_id=user.id
        )
    else:
        report = await run_from_api(session, max_vacancies=max_v, use_ai=True, user_id=user.id)
    status = 503 if report.error and report.vacancies_processed == 0 else 200
    return JSONResponse(status_code=status, content=json.loads(report.model_dump_json()))


@router.post("/verify")
async def verify_pipeline(
    body: VerifyRequest,
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    report = await run_from_payload(
        session,
        body.payload,
        source="upload",
        use_ai=body.use_ai,
        persist=True,
        user_id=user.id,
    )
    return JSONResponse(content=json.loads(report.model_dump_json()))


@router.post("/verify/fixture")
async def verify_fixture(
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    use_ai: bool | None = None,
):
    """Jury path: login first, then POST with cookie (use_ai=false for rules-only)."""
    settings = get_settings()
    path = Path(settings.fixtures_dir) / "kantkod_sample_vacancies.json"
    if not path.exists():
        path = Path(settings.fixtures_dir) / "sample_vacancies.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="fixture not found")
    payload = json.loads(path.read_text(encoding="utf-8"))
    enabled = gigachat_enabled() if use_ai is None else use_ai
    report = await run_from_payload(
        session, payload, source="fixture", use_ai=enabled, persist=True, user_id=user.id
    )
    return JSONResponse(content=json.loads(report.model_dump_json()))


@router.get("/report/latest")
async def latest_report(
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    report = await load_latest(session, user_id=user.id)
    if not report:
        raise HTTPException(status_code=404, detail="no report yet")
    return JSONResponse(content=json.loads(report.model_dump_json()))


@router.get("/resume/vacancies")
async def resume_vacancies(
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    items = await list_resume_vacancies(session, user_id=user.id)
    return {"items": [i.model_dump(mode="json") for i in items]}


@router.get("/resume/drafts")
async def resume_drafts(
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    items = await list_drafts(session, user_id=user.id)
    return {"items": [i.model_dump(mode="json") for i in items]}


@router.get("/resume/drafts/{draft_id}", response_model=ResumeDraftResponse)
async def resume_draft_get(
    draft_id: int,
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    draft = await get_draft(session, draft_id, user_id=user.id)
    if not draft:
        raise HTTPException(status_code=404, detail="черновик не найден")
    return draft


@router.post("/resume/sample", response_model=ResumeSampleResponse)
async def resume_sample(
    body: ResumeSampleRequest,
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        vac, _report_id = await resolve_vacancy(
            session,
            user_id=user.id,
            vacancy_id=body.vacancy_id,
            report_id=body.report_id,
            vacancy=body.vacancy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    resume = build_sample_resume(vac)
    return ResumeSampleResponse(
        resume=resume,
        vacancy_id=str(vac.get("id") or body.vacancy_id or "") or None,
        job_name=str(vac.get("job-name") or "") or None,
    )


@router.post("/resume/draft", response_model=ResumeDraftResponse)
async def resume_draft(
    body: ResumeDraftRequest,
    user: Annotated[AuthUser, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if not isinstance(body.resume, dict) or not body.resume:
        raise HTTPException(status_code=400, detail="Передайте объект resume с опытом, навыками и образованием")
    try:
        vac, report_id = await resolve_vacancy(
            session,
            user_id=user.id,
            vacancy_id=body.vacancy_id,
            report_id=body.report_id,
            vacancy=body.vacancy,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result = await draft_resume(resume=body.resume, vac=vac, use_ai=body.use_ai)
    result = result.model_copy(update={"report_id": report_id})
    return await save_draft(
        session, result=result, resume=body.resume, report_id=report_id, user_id=user.id
    )
